// Skynet CTF — the site's actual live Worker entry point.
//
// This project deploys as a Cloudflare "Worker with static assets" (its
// dashboard's own build config runs `npx wrangler deploy`, driven by
// wrangler.toml at the repo root) — not Cloudflare Pages. That distinction
// matters: Pages Functions' functions/*.js file-based routing does not
// apply here at all, and an earlier version of this file lived at
// functions/check-answer.js on the (incorrect) assumption that it did.
// With no wrangler.toml present, wrangler's zero-config fallback just
// serves the whole repo as static files — which is what silently shipped
// instead, breaking answer submission entirely (POST /check-answer had
// nothing to route to, 404) and, worse, serving that old file's own
// source — hashes included — as a plain public file. Same class of
// exposure the whole server-side move was meant to close, just relocated,
// plus the feature not working at all. This file plus wrangler.toml's
// `main`/`[assets]` config fixes both: this Worker's fetch handler runs
// FIRST for every request now, decides whether to handle it directly
// (POST /check-answer) or hand it to the ASSETS binding to serve as a
// static file — and .assetsignore (repo root) keeps this file itself,
// wrangler.toml, and other non-public files out of what ASSETS can ever
// serve, so there's no file to fetch the source of this time.
//
// Everything below the routing at the bottom is otherwise the same
// reasoning as the Pages Functions version it replaces: n.answerHash used
// to ship straight to the browser, along with the exact algorithm to
// check a guess against it, so view-source was a free, unlimited,
// unrateable local oracle — no different from (actually strictly better
// than) mashing the site's own submit button, which also had no rate
// limit. The fix isn't hiding the check better; nothing running in the
// player's own browser can ever not be readable from it. The fix is not
// shipping the check to the browser at all — this file holds the hashes
// server-side instead, the browser sends a raw guess and gets back only
// true/false, and a real rate limit becomes possible for the first time
// because the enforcement finally lives somewhere the player doesn't
// control.
//
// Explicit non-goal: this does not stop someone from directly editing
// their own localStorage / calling clearNode() from devtools to fake a
// "solved" state — that's a separate problem (client-authoritative game
// state) that would need real server-tracked sessions to close, a much
// bigger change than this. This only removes the free guess-checking
// oracle; the game's progress tracking is unchanged.

// Identical to the answerHash values NODES[] in scripts/console.js used to
// carry — copied verbatim, not regenerated. This is now the only copy:
// NODES[] has no answerHash field at all. If a node's answer is ever
// changed, regenerate the hash here the same careful way CLAUDE.md
// describes (compute it, verify, don't hand-type it) — nothing needs
// updating on the console.js side for this specific field. `deco` is the
// one exception to "copied from NODES[]" — it has no NODES[] counterpart
// at all (DECO_NODES isn't part of NODES/CHAIN), it's the bonus level
// unlocked by finding all 4 decorative fragments (see REWARDS below and
// the DECO_NODES comment in console.js). Its hash is of the 4 fragments
// assembled ("crystal peak shelter three", normalizeAnswer'd) — same
// compute-don't-hand-type discipline as every hash here.
const ANSWER_HASHES = {
  n1: "e43781640b80cf82007d12b66a5611931ad569166b98543e9ffd0d727462a126",
  n2: "28e211aeed4eb2e1740d7da242b4b34c676875b2691ccb247761ae87f2bd1b2e",
  n3: "19a1c2633ba1fcaf4bd787dd32afc50fb9deb40ea39c3c4e27636773b30eb2bc",
  n4: "3c8036d705a7273ebcb331091e1abf38933a33aad554909ef732b9c5a7d15191",
  n5: "a84e88d513f0e08ab9825defffc00eb7e67119c1f4d57f45be342707396dd14b",
  n6: "10c08ff84069d1ed0f8ff2622ac710954df7260a1c7cb38c983c35a4208a6511",
  n7: "f55de374352faf2a5136a98a91c092fd290a7366c1838bc3d1819937491f0cb1",
  b1: "45e8716890d299afde59779a3e129b237d250d8702cfd4952949ebec90eb6c2a",
  deco: "f751a5cae76d2fb81fe1cf700b0f058488b22526c8d3ae23385337fe5fc5f8c6",
};

// Extra payload returned only alongside a *correct* answer for the given
// id — everything else keeps returning bare {correct}, see the branch in
// handleCheckAnswer below. This is what actually keeps the deco bonus's
// reward off the client entirely until it's genuinely earned: unlike
// ANSWER_HASHES, which every id needs, REWARDS is opt-in per id, so
// n1-n7/b1's responses are completely unaffected by this existing at all.
const REWARDS = {
  deco: "CRYSTAL_PEAK // SHELTER-03 // STILL LISTENING",
};

// Byte-for-byte the same rules as normalizeAnswer() in scripts/console.js
// — this has to match that function exactly, or a guess the client used to
// accept gets rejected here (or the reverse). If normalizeAnswer() ever
// changes there, make the same edit here.
function normalizeAnswer(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/^flag\{(.*)\}$/, "$1")
    .replace(/['".,!?]/g, "")
    .replace(/[-_\s]+/g, " ")
    .trim();
}

// Real Web Crypto, not console.js's hand-rolled sha256Hex — that version
// exists purely because crypto.subtle refuses to run outside a secure
// context and throws on file://, which local dev over file:// needs to
// avoid. A Worker always runs server-side in a secure context, so the
// native implementation just works and there's no reason to port the
// hand-written one over.
async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Fixed-window counter in KV: RATE_LIMIT guesses per RATE_WINDOW_S seconds,
// keyed per IP across all nodes (not per-node) — a scripted brute force
// working through variants on one hard node is exactly the pattern this
// needs to catch, and a global-per-IP counter catches that without needing
// to track per-node state at all.
//
// Known limitation, stated plainly rather than oversold: KV is eventually
// consistent, not transactional, so a burst of near-simultaneous requests
// from the same IP can race the read-then-write below and slip a few over
// the limit. For this project's actual traffic (a small recreational CTF,
// not a target under sustained parallel attack) that's an acceptable
// trade-off against the complexity of a strictly-consistent alternative
// (e.g. a Durable Object per IP). If this ever needs to be airtight, that
// upgrade path exists — Cloudflare also has a purpose-built Rate Limiting
// binding for exactly this now; check current docs before reaching for
// it, since its config syntax has moved since this was written and isn't
// reproduced here to avoid shipping stale syntax.
const RATE_LIMIT = 20;
const RATE_WINDOW_S = 60;
const RATE_KEY_TTL_S = RATE_WINDOW_S + 10; // outlives the window slightly so a read right at expiry doesn't race a just-vanished key

async function checkRateLimit(kv, ip) {
  const key = `rl:${ip}`;
  const now = Date.now();
  const raw = await kv.get(key);
  const state = raw ? JSON.parse(raw) : null;

  if (!state || now - state.windowStart > RATE_WINDOW_S * 1000) {
    await kv.put(key, JSON.stringify({ windowStart: now, count: 1 }), {
      expirationTtl: RATE_KEY_TTL_S,
    });
    return { limited: false };
  }

  if (state.count >= RATE_LIMIT) {
    const retryAfter = Math.ceil((state.windowStart + RATE_WINDOW_S * 1000 - now) / 1000);
    return { limited: true, retryAfter };
  }

  await kv.put(key, JSON.stringify({ windowStart: state.windowStart, count: state.count + 1 }), {
    expirationTtl: RATE_KEY_TTL_S,
  });
  return { limited: false };
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleCheckAnswer(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const { nodeId, guess } = body || {};
  // Length cap on guess is just sane-input hygiene, not the anti-abuse
  // measure — the rate limiter below is.
  if (typeof nodeId !== "string" || typeof guess !== "string" || guess.length > 200) {
    return json({ error: "bad_request" }, 400);
  }
  if (!(nodeId in ANSWER_HASHES)) {
    return json({ error: "unknown_node" }, 404);
  }

  // env.RATE_LIMIT is the KV binding — added to wrangler.toml separately,
  // once the namespace's real id is known (see the comment there). Missing
  // binding fails safe: treated as "always allow" rather than crashing
  // every guess, since a misconfigured rate limiter shouldn't take the
  // whole puzzle down.
  if (env.RATE_LIMIT) {
    // CF-Connecting-IP is set by Cloudflare itself at their edge, after
    // the request has already passed through their network — a client can
    // put anything it wants in its own request, but can't override the
    // value Cloudflare records here, which is what makes it safe to key
    // rate limiting off.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { limited, retryAfter } = await checkRateLimit(env.RATE_LIMIT, ip);
    if (limited) {
      return json({ error: "rate_limited", retryAfter }, 429);
    }
  }

  const hash = await sha256Hex(normalizeAnswer(guess));
  const correct = hash === ANSWER_HASHES[nodeId];
  // REWARDS is opt-in per id (see its own comment) — every id not in it
  // (n1-n7, b1) falls straight through to the plain response below,
  // completely unchanged from before this branch existed.
  if (correct && nodeId in REWARDS) {
    return json({ correct: true, reward: REWARDS[nodeId] }, 200);
  }
  return json({ correct }, 200);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/check-answer") {
      return handleCheckAnswer(request, env);
    }
    // Everything else — index.html, console.html, styles/, scripts/,
    // audio/, all of it — is a plain static file. env.ASSETS is the
    // binding wrangler.toml's [assets] block sets up; this Worker only
    // exists to intercept the one route above, not to reimplement static
    // file serving.
    return env.ASSETS.fetch(request);
  },
};
