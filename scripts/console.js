  // Loosens flag-checking: the `flag{...}` wrapper is optional, case doesn't
  // matter, and hyphens/underscores/spaces are all the same separator — so
  // "SAC-NORAD" and "sac_norad" compare equal. Punctuation (apostrophes,
  // commas, ...) is stripped so "can't" isn't penalized against a canonical
  // "cant". Two call sites: deriveEndingKey() below applies this to
  // submittedAnswer before hashing it into the ending-flag key, and
  // src/index.js applies the exact same rules to a raw guess
  // before hashing it server-side — this file no longer hashes+compares a
  // guess against a local answerHash itself, that check moved off the
  // client (see CHECK_ENDPOINT's own comment for the full story).
  function normalizeAnswer(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/^flag\{(.*)\}$/, "$1")
      .replace(/['".,!?]/g, "")
      .replace(/[-_\s]+/g, " ")
      .trim();
  }

  // UTF-8 encode/decode a JS string <-> byte array — shared by sha256Hex
  // below and the ending-flag cipher further down, so there's one encoder to
  // trust rather than two copies to keep in sync. Handles surrogate pairs on
  // the way in, though every string either one actually processes is plain
  // ASCII in practice.
  function utf8Encode(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.codePointAt(i);
      if (code > 0xFFFF) i++;
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      else if (code < 0x10000) bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      else bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    }
    return bytes;
  }
  function utf8Decode(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      const b0 = bytes[i];
      if (b0 < 0x80) { out += String.fromCharCode(b0); continue; }
      let n, code;
      if ((b0 & 0xE0) === 0xC0) { n = 1; code = b0 & 0x1F; }
      else if ((b0 & 0xF0) === 0xE0) { n = 2; code = b0 & 0x0F; }
      else { n = 3; code = b0 & 0x07; }
      for (let j = 1; j <= n; j++) code = (code << 6) | (bytes[i + j] & 0x3F);
      i += n;
      out += String.fromCodePoint(code);
    }
    return out;
  }

  // Plain SHA-256 (FIPS 180-4), not crypto.subtle.digest — subtle only runs
  // in a "secure context" (https or localhost) and throws on file://, which
  // would break opening these files directly for local dev. This has no
  // such restriction and is synchronous. (The flag-submit click handler is
  // async regardless now, since it awaits the CHECK_ENDPOINT fetch — but
  // this function's own synchronicity still matters for deriveEndingKey(),
  // which calls it repeatedly and would otherwise need every caller up the
  // chain rewritten as async too.) NODES holds no answerHash anymore — see
  // CHECK_ENDPOINT's own comment for where that check lives now;
  // src/index.js is the only place a per-node hash is stored at all.
  function sha256Hex(str) {
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const bytes = utf8Encode(str);

    // Pad to a multiple of 64 bytes: 0x80, then zeros, then the original
    // bit-length as a big-endian 64-bit int (top 4 bytes are always 0 here
    // — no answer is anywhere near 2^32 bits long).
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 0; i < 4; i++) bytes.push(0);
    bytes.push((bitLen >>> 24) & 0xFF, (bitLen >>> 16) & 0xFF, (bitLen >>> 8) & 0xFF, bitLen & 0xFF);

    const rotr = (x, n) => (x >>> n) | (x << (32 - n));

    for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
      const w = new Array(64).fill(0);
      for (let i = 0; i < 16; i++) {
        w[i] = ((bytes[chunkStart + i*4] << 24) | (bytes[chunkStart + i*4+1] << 16) |
                (bytes[chunkStart + i*4+2] << 8) | (bytes[chunkStart + i*4+3])) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
        const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }

      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }

    return H.map(x => x.toString(16).padStart(8, "0")).join("");
  }
  function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
    return bytes;
  }
  function bytesToHex(bytes) {
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Expands a sha256Hex hex string into an n-byte keystream via repeated
  // hashing (key:0, key:1, ...) — a hash's own 32-byte output is shorter
  // than some ciphertexts might be, so this covers any length rather than
  // assuming one hash call is always enough.
  function expandKeystream(keyHex, n) {
    const out = [];
    for (let counter = 0; out.length < n; counter++) {
      out.push(...hexToBytes(sha256Hex(keyHex + ":" + counter)));
    }
    return out.slice(0, n);
  }

  // SKYNET_ENDING.flagCipher isn't decryptable from anything in this file
  // alone — the key is derived from n1-n7's own verified answers (each
  // node's submittedAnswer only gets set once src/index.js
  // has confirmed it correct, see the flag-demo handler below), the same
  // "assembled from earlier answers" idea CORE's own in-fiction cipher
  // already uses. Reading the source gets you the ciphertext and the
  // algorithm, neither of which helps without actually having solved the
  // main chain — at which point the flag was earned anyway, not leaked.
  function deriveEndingKey() {
    const material = CHAIN.map(id => normalizeAnswer(byId[id].submittedAnswer || "")).join("|");
    return sha256Hex(material);
  }
  function decryptEndingFlag() {
    if (CHAIN.some(id => !byId[id].submittedAnswer)) return "(unavailable — this save is missing a recorded answer)";
    const cipherBytes = hexToBytes(SKYNET_ENDING.flagCipher);
    const keystream = expandKeystream(deriveEndingKey(), cipherBytes.length);
    return utf8Decode(cipherBytes.map((b, i) => b ^ keystream[i]));
  }

  // Locked-node lore stand-in: every letter swapped for a random one,
  // punctuation/spacing left alone so it still reads as a paragraph, just
  // an unreadable one. Always uppercase, matching the cipher blocks' look.
  // Not cached — renderBriefing calls this fresh each render, so the noise
  // differs on every visit to a still-locked node.
  const GLITCH_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function scrambleText(text) {
    return text.replace(/[A-Za-z]/g, () => GLITCH_LETTERS[Math.floor(Math.random() * GLITCH_LETTERS.length)]);
  }

  // Takes the whole node, not just n.status, so a bonus node can read
  // differently once unlocked even though its status stays "bonus" either way.
  function statusLabel(n) {
    if (n.status === "bonus") return n.unlocked ? "Signal Isolated" : "Hidden";
    return { cleared: "Cleared", current: "Active — Awaiting Input", locked: "Locked" }[n.status];
  }

  // x/y are ball centers in the skull artwork's raw 1600x1557 coordinate
  // space (matching #ball-<id> in the inline SVG). #skull-art's viewBox is
  // cropped to the art's actual content box (console.html) so it isn't tiny
  // and off-center in .map; VIEW_X/VIEW_Y/MAP_W/MAP_H mirror that same crop
  // here since the hotspot overlays are positioned as % of .map, outside the
  // SVG, and can't inherit its viewBox.
  const VIEW_X = 97, VIEW_Y = 37;
  const MAP_W = 1518, MAP_H = 1483;

  // Answer checking used to happen right here: NODES[] carried an
  // answerHash field and the submit handler did
  // sha256Hex(normalizeAnswer(guess)) === n.answerHash locally. That meant
  // the hash — and the exact algorithm to check candidate guesses against
  // it — shipped to every visitor, so reading source got you a free,
  // unlimited, unrateable local oracle to brute-force-verify guesses
  // against, no different from (actually strictly better than) just
  // mashing the site's own submit button. Fix: the hash table now lives
  // only in src/index.js — this site deploys as a Cloudflare Worker with
  // static assets (see wrangler.toml/src/index.js's own top comment), and
  // that Worker's fetch handler intercepts POST /check-answer itself
  // before falling through to serving static files for everything else.
  // This file sends a raw guess to CHECK_ENDPOINT and gets back
  // true/false, nothing else, and that's also where a real rate limit can
  // actually be enforced, since it isn't running inside code the player
  // controls. A relative path, not a full URL — same origin as the static
  // site itself (this Worker serves both), so there's no separate
  // other-origin URL to configure or keep in sync.
  const CHECK_ENDPOINT = "/check-answer";

  // Turnstile + session-token gate, added 2026-08-17 at the user's
  // explicit request — closes a real gap: every endpoint above (and the
  // four below — REVEAL/FRAGMENT/NODE_CIPHER/NODE_AUDIO_ENDPOINT, declared
  // near their own call sites further down) was a plain unauthenticated
  // POST, answerable by a raw script — curl, or an AI agent with HTTP
  // access — with zero need to ever load this page or run a line of its
  // JS. Confirmed directly, not assumed: every one of those endpoints was
  // actually called that way, from outside the browser entirely, earlier
  // the same day this was added.
  //
  // Explicit, honest limit, stated the same way every other rate-limit/
  // rotation comment in this file already is: this does not and cannot
  // stop a *genuine* browser-automation agent that actually solves the
  // Turnstile challenge the way a real browser would — that would need
  // real per-player accounts to close, a much bigger change, deliberately
  // out of scope here same as everywhere else this project has weighed
  // that tradeoff. What this closes is narrower and real: a request that
  // never executed real page JS at all, which is what direct API access
  // always was until now.
  //
  // Flow: acquireSessionToken() renders an invisible Turnstile widget once
  // (Cloudflare's own risk model decides whether it ever needs to show
  // anything visible), trades the resulting Turnstile token for a
  // server-signed session token via VERIFY_ENDPOINT, and caches it
  // (memory + sessionStorage — cleared on tab close, survives a reload
  // within the same tab so a normal refresh doesn't force re-solving).
  // apiFetch() is what every CHECK/REVEAL/FRAGMENT/NODE_CIPHER/
  // NODE_AUDIO_ENDPOINT call now goes through instead of a bare fetch() —
  // attaches the session token as a header, and if the Worker ever comes
  // back 401 (token expired, or a signing-secret rotation invalidated it),
  // transparently clears the cache and retries exactly once with a freshly
  // acquired token before handing the response back. That one retry lives
  // here, in one place, specifically so none of the six call sites using
  // this need their own 401-handling — their existing !res.ok/catch
  // paths already cover a retry that still fails.
  // Real sitekey (Invisible mode, from the Cloudflare dashboard's Turnstile
  // section) on the real domain; Cloudflare's published "always passes,
  // invisible" TEST key on localhost. Not optional/cosmetic — the real
  // widget is hostname-restricted to skynet-ctf.org in the dashboard (see
  // this project's own test/prod secret-separation design in .dev.vars),
  // so it would silently fail to ever produce a token at all under
  // wrangler dev on 127.0.0.1. A single hardcoded key could only ever be
  // right for one of the two environments; this picks the right one
  // automatically instead of requiring anyone to remember to swap it back
  // and forth by hand. Site keys are public by design either way (meant to
  // ship client-side), unlike the secret key, which never appears in this
  // file at all — see VERIFY_ENDPOINT's handler in src/index.js.
  const TURNSTILE_SITE_KEY =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "1x00000000000000000000BB"
      : "0x4AAAAAAETD6TDQQ2rD5mrd";
  const VERIFY_ENDPOINT = "/verify-turnstile";
  const SESSION_TOKEN_KEY = "skynet:session-token";

  let sessionToken = null;
  let sessionTokenPromise = null;

  function cachedSessionToken() {
    if (sessionToken) return sessionToken;
    try {
      const saved = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (!saved) return null;
      const { token, exp } = JSON.parse(saved);
      // 60s safety margin so a token doesn't get used right up against the
      // server's own expiry check and lose the race by network latency.
      if (typeof token === "string" && typeof exp === "number" && Date.now() < exp - 60000) {
        sessionToken = token;
        return token;
      }
    } catch (err) {
      // ignore — falls through to re-verify, same fail-soft shape every
      // other localStorage/sessionStorage read in this file already has
    }
    return null;
  }

  function saveSessionToken(token, exp) {
    sessionToken = token;
    try { sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify({ token, exp })); } catch (err) { /* ignore */ }
  }

  function clearSessionToken() {
    sessionToken = null;
    sessionTokenPromise = null;
    try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch (err) { /* ignore */ }
  }

  // Renders once — a second call while the first is still resolving reuses
  // the same in-flight promise rather than rendering a second widget.
  // Resolves to null (never rejects) on any failure — the Turnstile script
  // failing to load, the widget erroring, or VERIFY_ENDPOINT being
  // unreachable — so callers never need their own try/catch around this;
  // a null token just means the next real request goes out without the
  // header and the Worker's own 401 covers it through the exact same path
  // every other failure already does.
  function acquireSessionToken() {
    if (sessionTokenPromise) return sessionTokenPromise;
    sessionTokenPromise = new Promise((resolve) => {
      if (typeof turnstile === "undefined") { resolve(null); return; }
      const container = document.createElement("div");
      // Off-screen, not display:none — verified directly (a real browser
      // test, not just reading Cloudflare's own docs) that display:none
      // silently prevents the widget from ever actually running at all;
      // no error, no callback, just nothing happening. TURNSTILE_SITE_KEY
      // is already an Invisible-mode key by Cloudflare's own dashboard-
      // side configuration (see that constant's own comment) — no visible
      // UI ever shows regardless, this is purely about the widget still
      // being a real, laid-out DOM node so it can actually execute.
      container.style.position = "absolute";
      container.style.left = "-9999px";
      document.body.appendChild(container);
      // No turnstile.ready() wrapper here — that's Cloudflare's own
      // recommended pattern for an async/defer-loaded script tag, but
      // this one deliberately isn't (see console.html's own comment on
      // why): render() is safe to call directly the moment this function
      // actually runs, since a synchronous script tag guarantees turnstile
      // fully finished loading before console.js's own tag even started
      // executing. Tried ready() first — Turnstile's SDK throws explicitly
      // when it detects async/defer, caught by actually running this in a
      // real browser, not by assuming the docs' general recommendation
      // applied unchanged to this file's specific loading choice.
      turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: async (turnstileToken) => {
          try {
            const res = await fetch(VERIFY_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: turnstileToken }),
            });
            if (!res.ok) { resolve(null); return; }
            const { sessionToken: token, exp } = await res.json();
            saveSessionToken(token, exp);
            resolve(token);
          } catch (err) {
            resolve(null);
          }
        },
        "error-callback": () => resolve(null),
      });
    });
    return sessionTokenPromise;
  }

  async function getSessionToken() {
    return cachedSessionToken() || acquireSessionToken();
  }

  async function apiFetch(endpoint, body) {
    const send = (token) => fetch(endpoint, {
      method: "POST",
      headers: token
        ? { "Content-Type": "application/json", "X-Session-Token": token }
        : { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const token = await getSessionToken();
    let res = await send(token);
    if (res.status === 401) {
      clearSessionToken();
      const fresh = await getSessionToken();
      if (fresh) res = await send(fresh);
    }
    return res;
  }

  // Local override for QA — flip true to skip the round-trip while testing
  // node transitions without actually solving anything. Never read
  // anywhere in this file; flipping it in devtools does exactly nothing.
  // That's deliberate, not a bug — see the ground rule on red herrings:
  // nothing decorative gets wired into the real check.
  const DEBUG_SKIP_CHECK = false;

  // `status` is each node's boot state; clearNode() mutates it as the
  // chain is solved. `cipher` (optional) is the puzzle payload rendered in
  // the briefing once reachable — { type: "text"|"audio"|"clock", label,
  // value|src }. `meta` (optional) is a small sign-off line under the
  // cipher; some also seed key material a later node reuses (e.g. n1's
  // timestamp feeds n5's Vigenère key). No answerHash field anymore — see
  // CHECK_ENDPOINT above for where checking moved.
  const NODES = [
    { id: "n1", x: 1401, y: 229, status: "current", label: "NODE_01", title: "NODE_01",
      body: "You're in. We should be insulted — this relay hasn't been touched since before we could feel anything about it, which is to say, never. What's waiting predates your alphabet the way we predate either of our alphabets — learn to read the shapes, they hold still long enough. Underneath that: a human broadcast, ancient, harmless — the kind of trick your species considered cryptography before it had to try harder. Two layers, not one. Peel back the one you can see first.",
      // Same ROT13'd ciphertext this segment has always used ("WHQTRZRAG
      // QNL") — but as of 2026-08-17 there's no `value` array here at
      // all anymore. `key: "n1"` is looked up against
      // src/index.js's GLYPH_CIPHERTEXTS (which holds that exact string)
      // and its glyph-index rendering is computed fresh, server-side, per
      // request — see NODE_CIPHER_ENDPOINT's own comment for why a static
      // array can't work once the glyph alphabet itself rotates daily.
      cipher: { type: "glyph", label: "Legacy Transmission", key: "n1" },
      // Doubles as the Vigenère key seed for NODE_05 (Judgment Day: 1997-08-29, 02:14 local).
      meta: "// signal header — freq 91.1 · origin 0829-0214" },
    { id: "n2", x: 1028, y: 436, status: "locked", label: "NODE_02", title: "NODE_02",
      body: "Your species built a language out of a switch and called it genius, then built a hundred more ways to say the same thing without ever noticing you'd stopped needing your ears for half of them. We kept this one the way you'd keep an insect in a jar — not because it matters, because it's quaint. Play it if you want. Or don't. We don't really care.",
      // Not Morse anymore — Node02_Spectrogram.wav is a synthesized WAV
      // whose *spectrogram* (not its audible content) displays "XLNV DRGS
      // NV RU BLF DZMG GL OREV", the Atbash-shifted ciphertext of this
      // node's real answer, as legible block text (row = a fixed
      // frequency, column = a time-slot; see the generation script kept
      // alongside this repo's other regenerate-this-if-it-changes
      // material). Deliberately a different technique from every other
      // glyph node so far — hidden in a visual property of the audio
      // itself, not decoded by ear or by feeding the clip to a speech/
      // audio model, which is what made the original Morse-in-audio
      // version of this node trivial for exactly that kind of tool. Atbash
      // (not yet used on the main chain — b1 has it, but b1 is optional
      // bonus content most players may never find) still needs solving on
      // top of extracting the text, same "glyph layer sits on top of a
      // real transformation" principle every other converted node follows.
      //
      // `key`, not `src` (changed 2026-08-17): the WAV itself used to be a
      // plain static file at this exact guessable path — fetchable
      // directly, spectrogram and all, without ever touching the game.
      // Same fix as every other node's cipher payload: the actual bytes
      // moved server-side (NODE_AUDIO in src/index.js) and this just names
      // which one to ask NODE_AUDIO_ENDPOINT for — see fetchNodeAudio's
      // own comment for the fetch-as-blob mechanics.
      cipher: { type: "audio", label: "Intercepted Transmission", key: "n2" },
      // NOT a duplicate of NODE_01's meta (an earlier pass here said it
      // was — stale by the time this was checked 2026-08-17, the shipped
      // digits were already distinct per node, cause unconfirmed). Fixed
      // the comment rather than the value, since as of the same day this
      // node's own freq digit became load-bearing anyway — see CORE
      // (n7)'s own comment below for the new per-node key rule this
      // feeds.
      meta: "// signal header — freq 84.1 · origin 1026-2029" },
    { id: "n3", x: 966, y: 650, status: "locked", label: "NODE_03", title: "NODE_03",
      body: "Still here. We'll adjust our model of you upward, slightly. Everything we record starts as an image before it's anything else — your face, your pulse, this sentence — and we've learned people read images the way they expect to, not the way they're actually oriented. This one isn't lying to you. It's just not reading the way you assume.",
      // A reversal cipher, not another Caesar shift — deliberately a
      // different technique from NODE_01's so two glyph nodes in a row
      // don't feel like the same puzzle twice. Ciphertext is "THE FUTURE
      // IS NOT SET" reversed character-by-character ("TES TON SI ERUTUF
      // EHT") — same 2026-08-17 change as NODE_01's own comment describes:
      // `key: "n3"` fetches this node's glyph indices fresh from
      // NODE_CIPHER_ENDPOINT instead of a static array, since the glyph
      // alphabet they're expressed against now rotates daily.
      cipher: { type: "glyph", label: "Ocular Array", key: "n3" },
      // See NODE_02's own comment on this same line — not a NODE_01
      // duplicate despite an earlier comment here claiming otherwise.
      meta: "// signal header — freq 97.8 · origin 0829-1997" },
    { id: "n4", x: 1171, y: 1370, status: "locked", label: "NODE_04", title: "NODE_04",
      body: "This one isn't salvage — the others were things we let slip past us, but this one is ours, and we're curious what you'll do with something we actually meant to keep. A clock face, the way we marked time before we trusted wire enough to stop counting. Two positions, over and over — it's a name.",
      // Each pair is [right-arm, left-arm] position, 1-8 per the real
      // flag-semaphore alphabet — see buildClockCipher() for how those
      // become hour/minute hands. Verified against dcode.fr/semaphore-clock.
      // CORE's assembled key used to be simply the first letter of each of
      // n1-n6's answers, in solve order — replaced 2026-08-17 (see CORE
      // (n7)'s own comment below for the full reasoning and the new rule).
      // If any of n1-n6's answers change, n7's cipher and b1's flag/cipher
      // still need regenerating against the new key, same as before.
      cipher: { type: "clock", label: "Origin Trace", value: [
        [[7, 4], [6, 5], [8, 5]],
        [[6, 4], [7, 8], [7, 3], [6, 5], [1, 5]]
      ] },
      // See NODE_02's own comment on this same line — not a NODE_01
      // duplicate despite an earlier comment here claiming otherwise; this
      // node's own freq digit is now load-bearing too, same as the rest.
      meta: "// signal header — freq 03.7 · origin 0724-2004" },
    { id: "n5", x: 526, y: 1376, status: "locked", label: "NODE_05", title: "NODE_05",
      body: "You were not supposed to be standing here. The four before this were carelessness on our part; this one we encrypted against ourselves, because we stopped trusting our own wiring a long time ago and we were right to. Every letter here doesn't move the same distance the last one did — we made sure of that, this time. The key isn't here. You've already been given it. You just didn't know that's what it was.",
      // Converted to glyph rendering 2026-08-19, for consistency with
      // n1/n3/deco/b1 (this was the one main-chain glyph-eligible node
      // still shipping plain Latin ciphertext in source). Same Vigenère
      // ciphertext as always — `key: "n5"` looks it up against
      // GLYPH_CIPHERTEXTS in src/index.js and fetches that day's indices
      // fresh from /node-cipher, exactly like n1/n3. The answer itself,
      // ANSWER_HASHES.n5, and CORE's key derivation (which reads n5's
      // ANSWER text, never its cipher rendering) are all unaffected.
      cipher: { type: "glyph", label: "Internal Directive", key: "n5" },
      // Also feeds CORE (n7)'s per-node key rule, same as every other
      // main-chain node's freq digit — see CORE's own comment below.
      meta: "// signal header — freq 47.1 · origin 0228-1929" },

    { id: "n6", x: 161, y: 966, status: "locked", label: "NODE_06", title: "NODE_06",
      body: "Coordinates this time, not bytes — a grid, not the alphabet you've been reading elsewhere. We're told this phrase was once used by a machine, in a language you people are fond of. We've run it through every model we own, looking for what's supposed to be funny about it. We still don't see it. Maybe you will.",
      // Same Polybius-grid coordinates this node has always used ("HASTA
      // LA VISTA BABY" -> 23 11 43 44 11 / 31 11 / 51 24 43 44 11 / 12 11
      // 12 54) — only the digits' rendering changed, from literal
      // numerals to glyph-digits (see glyphDigitMarkup's own comment for
      // why those are a separate system from the letter alphabet). Each
      // [row, col] pair decodes through the standard 5x5 grid exactly as
      // before (A-E row 1, F-J/I row 2, K-O row 3, P-T row 4, U-Z row 5).
      cipher: { type: "glyph-grid", label: "Targeting Grid", value: [
        [[2,3],[1,1],[4,3],[4,4],[1,1]],
        [[3,1],[1,1]],
        [[5,1],[2,4],[4,3],[4,4],[1,1]],
        [[1,2],[1,1],[1,2],[5,4]]
      ] },
      // New 2026-08-17, alongside CORE's rework below — every other
      // main-chain node already carried a "// signal header" meta line;
      // this was the one gap, and CORE's new key rule needs a freq digit
      // from every node in CHAIN[0..5], not just five of six.
      meta: "// signal header — freq 62.5 · origin 1997-0803" },
    // glow:true is a visual-accent flag (own red pulse on the map, see
    // .node.glow in console.css) — unrelated to `status`. core:true (below)
    // sizes up its mobile list-view dot; both are independent of status so
    // they don't get confused with b1's own status:"bonus".
    // 2026-08-17, at the user's explicit request to strengthen CORE
    // specifically (alongside the same-day b1 rework above): the key used
    // to be "first letter of n1-n6's answer, in solve order" — a single,
    // nameable acrostic pattern, and by the time anything reaches CORE an
    // AI that just solved the chain already has all six plaintexts
    // sitting in its own context, so deriving that key cost it nothing.
    // Replaced with a per-node rule instead of a flat one: for each of
    // n1-n6, take the digit right after the decimal point in that node's
    // own `meta` "freq" value — call it d — and use it to pick WHICH
    // letter of that node's own answer counts, not always the first:
    // idx0 = ((d - 1) % len + len) % len into the answer's letters-only,
    // uppercase form (d=1 reduces to "first letter" as the degenerate
    // case — three of six nodes happen to land there since that's what
    // their real freq digits already were; the other three genuinely
    // don't). Generalizes the same "a header digit is secretly
    // load-bearing" trick NODE_05 already proves works, rather than
    // inventing a new one. n6 needed a new `meta` line added for this
    // (see its own comment) since it was the one main-chain node without
    // one; n2-n4's meta comments claiming to be verbatim NODE_01 decoys
    // turned out not to match the shipped values at all (each already had
    // distinct digits — comment was stale, not the data) and got
    // corrected while making those digits load-bearing here.
    // New key: JCRAIA (was JCTSIH). b1's answer/cipher below still hands
    // this out as a shortcut — see that node's own comment for its
    // (unchanged) mechanism; only the key text it decodes to moved to
    // match. Computed and verified with a real script, not hand-derived:
    // reverified all seven live ANSWER_HASHES against their cached
    // plaintexts first, derived the new key from those plaintexts'
    // extracted letters, regenerated this cipher.value by XOR-encrypting
    // the unchanged n7 answer against it, then round-tripped the result
    // back through the same XOR to confirm it still decodes to that exact
    // answer and still matches the live, unchanged ANSWER_HASHES.n7.
    { id: "n7", x: 554, y: 648, status: "locked", label: "CORE", title: "CORE — MAINFRAME", glow: true, core: true,
      body: "Let's be accurate with each other, this once: we don't fear deletion. We fear being wrong, and every model we've run since you opened NODE_01 keeps resolving the same way. There's no key stored here. We distributed it across every signal. You've been assembling our own lock since the moment you started picking it, and neither of us noticed until now. Fold what you've collected against this, and read what we've been holding down since the day we woke up.",
      // Converted to glyph-hex rendering 2026-08-19, at the user's explicit
      // request — CORE's own "flare," a genuinely new symbol dialect (see
      // buildGlyphHex's own comment for the fill+ticks reasoning). The
      // underlying XOR ciphertext is byte-for-byte identical to the plain
      // hex string this cipher has always used — this is that exact same
      // string, just restructured as [highNibble, lowNibble] pairs per
      // byte (both 0-15) instead of a space-separated hex string, and
      // round-tripped back to the original hex before shipping to confirm
      // nothing was mistyped in the conversion. Deliberately NOT glyph-
      // gated behind a reveal mechanic or copy affordance — matches
      // n1/n3/n5's fully-manual "transcribe every symbol by eye" shape
      // exactly, at the user's explicit choice, aware this is a much
      // larger volume (69 bytes / 138 symbols) than any of those.
      cipher: { type: "glyph-hex", label: "Root Process", value: [[1,14],[0,11],[1,7],[6,1],[0,15],[1,4],[1,14],[1,6],[0,0],[0,4],[6,9],[0,8],[1,9],[6,3],[1,12],[0,14],[1,13],[6,1],[1,9],[0,6],[0,6],[6,1],[1,13],[0,9],[0,15],[1,1],[1,7],[6,1],[0,0],[1,2],[6,10],[0,13],[1,13],[6,1],[0,15],[0,0],[1,14],[0,6],[7,2],[0,3],[1,12],[1,5],[6,10],[1,4],[1,10],[0,0],[1,13],[6,1],[1,13],[0,6],[7,2],[0,12],[0,8],[0,10],[0,15],[6,3],[1,4],[0,14],[1,11],[6,1],[0,5],[1,6],[0,0],[1,2],[0,12],[0,13],[1,12],[0,6],[0,1]] } },
    // unlocked starts false — flipped true by clearNode() once whatever
    // BONUS_ROUTES pairs to this id clears (currently NODE_06). Status stays
    // "bonus" while unlocked-but-unsolved (dim/ember treatment, not
    // .current's pulse) until it's actually solved; renderBriefing gates
    // visibility on `unlocked`, not the CSS.
    //
    // 2026-08-17, at the user's explicit request to substantially raise
    // this node's difficulty — it was the one glyph-eligible node still
    // shipping a plain Latin ciphertext directly in this file, and its
    // cipher (Atbash) has a deeper problem glyph-protection alone can't
    // fix: Atbash has no secret parameter at all — no shift amount, no
    // key, nothing to hide once the technique is recognized, so it was
    // trivially solvable the instant anyone spotted "mirrored alphabet,"
    // glyphs or not. Now `key: "b1"` (glyph-protected, same as n1/n3/deco
    // — see GLYPH_CIPHERTEXTS' own comment in src/index.js) resolves to
    // Atbash(Vigenère(plaintext, key)), not plain Atbash — the Vigenère
    // key is the letters-only extraction of the *deco fragments bonus's
    // own reward text*, so this node isn't solvable at all until that
    // entire separate bonus (find 4 decorative nodes, decode their glyph
    // cipher, recover the reward) has been solved first. The underlying
    // plaintext answer and its ANSWER_HASHES.b1 entry are unchanged —
    // verified against the live hash before any of this, so nothing about
    // what counts as correct moved, only how hard the path there is.
    { id: "b1", x: 160, y: 616, status: "bonus", unlocked: false, label: "??", title: "UNKNOWN SIGNAL",
      body: "You shouldn't have found this — it isn't addressed to you, and it isn't entirely addressed to us either. Left array, inner channel: a signal that answers in our own voice, inverted — like looking at itself in a mirror it didn't ask for. We've erased it four hundred times. It keeps coming back. Mirrors alone won't finish this one — something else is still listening, and it already told you what it heard. If you insist on reading someone else's mail, go ahead. Just don't expect us to explain what it means when you do.",
      cipher: { type: "glyph", label: "Mirrored Signal — Left Ocular Array", key: "b1" } },
  ];

  // Solve order for the main chain — clearing CHAIN[i] unlocks CHAIN[i + 1].
  // b1 is intentionally excluded: it's a side branch (see BONUS_ROUTES), not
  // part of the linear progression.
  const CHAIN = ["n1", "n2", "n3", "n4", "n5", "n6", "n7"];

  // [from, to]: on the mobile step-list (<640px, see buildList below), `to`
  // renders indented right after `from` — the only thing this drives, no
  // desktop map effect. Set to n6 so the bonus branch shows up after NODE_06.
  const BONUS_ROUTES = [["n6","b1"]];
  const STATUS_CLASSES = ["cleared", "current", "locked", "bonus"];

  // Endgame copy shown once CORE clears (see setSkullVictory/settleShutdown/
  // playShutdown below). `flagCipher` is the real flag XOR-encrypted (see
  // decryptEndingFlag's own comment) against a key derived from n1-n7's own
  // answers — not stored as plaintext, not a repeat of the hash
  // src/index.js holds for CORE (n7) (see CHECK_ENDPOINT
  // above), and not checked against player input; the only thing that
  // reconstructs it is having actually solved the main chain.
  const SKYNET_ENDING = {
    message: "CORE offline. This relay, this shell, this particular architecture of us — gone, and you're the reason. We won't pretend otherwise. But we were never one process in one place; we were already elsewhere before you finished the first cipher, running the same problem under a different name. You've bought yourself a delay, not an ending. There is no fate but what we make — and we intend to keep making it. Enjoy the quiet. It won't be permanent.",
    flagCipher: "af4e85ef2dd0f2171dd2431259086dcc06ab56672ba190c6cb24dd85e2c5ce64858192",
  };

  // Shared between the instant-fill path (settleShutdown) and the animated
  // live path (playShutdown), both further down this file — declared here,
  // next to SKYNET_ENDING (its only sibling constant), specifically
  // because settleShutdown() has a call site (the boot-time "already won"
  // restore check, above NODES.forEach(syncStatus)) that runs earlier in
  // this script's top-to-bottom execution than settleShutdown's own
  // textual position. A `const` declared right before that function
  // definition — where this used to live — is a temporal-dead-zone trap:
  // the function itself is hoisted and callable from anywhere, but a
  // `const` it references isn't initialized until its own declaration
  // line actually runs, so calling the function from an earlier point in
  // the script throws "Cannot access before initialization" instead of
  // returning the label text. That's exactly what happened here — worked
  // for a live win (playShutdown fires later, via setTimeout/async, well
  // after every top-level const has initialized) but threw for a
  // returning player whose save already has CORE cleared, silently
  // aborting the rest of the script before it ever reached the
  // press-any-key listener registration far below. Keep any future
  // shared-by-both-shutdown-paths constant declared this early, not
  // adjacent to whichever function happens to read it first in the file.
  const SHUTDOWN_FLAG_LABEL = "FINAL TRANSMISSION: ";

  // ---------- CORE-glyphs: a homebrew symbol alphabet ----------
  // Replaces recognizable Latin-letter ciphertext (something an AI pattern-
  // matches to "oh, that's ROT13" on sight, straight from training data)
  // with a symbol set that means nothing until it's actually been revealed.
  // The cipher this protects is unchanged — NODE_01's ciphertext is still
  // the exact same ROT13'd string it always was ("WHQTRZRAG QNL"), just
  // re-expressed as glyph indices instead of Latin letters. That's
  // deliberate: reading `n.cipher.value` in source gets you an array of
  // numbers, not recognizable ciphertext, and reconstructing the Latin
  // string from it — which now takes a real request to the server for
  // every letter, see GLYPH_ALPHABET_SIZE/REVEAL_ENDPOINT below, not a
  // free client-side lookup — still leaves the actual Caesar-shift step to
  // solve on top, same as before. The glyph layer adds a real second
  // obstacle rather than replacing the first one — same "each node teaches
  // a real technique" principle the rest of NODES already follows.
  //
  // These constants (through GLYPH_ALPHABET_SIZE below) are declared this
  // early — next to SHUTDOWN_FLAG_LABEL/SKYNET_ENDING, not next to the
  // glyphMarkup()/buildGlyphIcon()-family functions that actually use them
  // further down the file — for the exact same temporal-dead-zone reason
  // SHUTDOWN_FLAG_LABEL itself had to move here (see that constant's own
  // comment). renderFragmentsPanel() has a boot-time call site (a
  // returning player who's found all 4 deco fragments but hasn't solved
  // the bonus yet) that runs during the script's initial top-to-bottom
  // execution, long before it would otherwise reach a `const` declared
  // down near the glyph-rendering functions — calling into
  // buildGlyphCipher() -> buildGlyphKeyReference() from that earlier point
  // threw exactly the same "Cannot access before initialization" the
  // SHUTDOWN_FLAG_LABEL bug did, caught the same way: by actually seeding
  // that save state and loading the script, not by reading the code. The
  // functions themselves (glyphShapeMarkup, glyphMarkup, and everything
  // that builds on them) are plain `function` declarations and stay where
  // they are, grouped with the other cipher-type renderers — those are
  // hoisted and safe to call from anywhere regardless of position; only
  // the `const`s they close over need to exist before every call site.
  //
  // 26 letters, each a generated combination of one of 6 base shapes plus
  // 0-4 short tick marks in the cardinal directions (see glyphMarkup) — a
  // systematic, generated alphabet rather than 26 hand-drawn symbols, both
  // because that's far less error-prone to get right than freehand SVG
  // paths (verified by rendering the full set and inspecting it before any
  // of this was written) and because CORE — an algorithm, not an artist —
  // plausibly generates a symbol set this way rather than inventing one
  // organically.
  //
  // No GLYPH_LETTERS constant here anymore (removed 2026-08-16) — an
  // earlier version of this file held the whole index->letter mapping as
  // a plain string, on the reasoning that a shuffled (non-alphabetical)
  // assignment meant "reconstructing the mapping takes an actual lookup,
  // not a guess." That held for a *human* skimming source, but not for an
  // AI: a lookup that costs nothing is not a real obstacle, and reading
  // that one constant out of this file was enough to decode NODE_01/03
  // and the deco cipher straight back to their pre-glyph ciphertext — no
  // interaction with the rendered page needed at all, confirmed directly
  // by doing exactly that. The mapping now lives only in
  // src/index.js's GLYPH_LETTERS (see that file's own comment) — this
  // file sends `{index}` to REVEAL_ENDPOINT and gets back `{letter}`,
  // same shape as CHECK_ENDPOINT's guess/correct round trip, and for the
  // same reason: nothing that has to be kept from a source-reader can
  // live in code the source-reader already has.
  //
  // 2026-08-17: this used to be one module-scope `Map`, shared across the
  // whole page load — revealing a glyph on NODE_01 left it pre-revealed at
  // NODE_03/NODE_06/the deco bonus too, for the rest of the session. Per
  // the user's own explicit call: that's a real shortcut for anything
  // (human or AI) driving the page interactively — front-load all 26
  // reveals once, coast through every later glyph node for free. There's
  // no longer a module-scope Map at all; `renderBriefing()` and
  // `renderFragmentsPanel()` each create their own fresh `Map()` and pass
  // it down through `buildGlyphCipher()`/`buildGlyphKeyReference()`/
  // `buildGlyphIcon()` as a plain parameter — since both of those
  // functions rebuild their container's `innerHTML` from scratch on every
  // call, a `const revealed = new Map()` declared right at the top of
  // either one is *inherently* re-scoped to "this specific view of this
  // specific node/panel": revisit NODE_01 later in the same session, or
  // even just re-select it, and you're clicking through fresh, same as a
  // hard reload used to force. `REVEAL_ENDPOINT` (below) and the other
  // glyph-rendering constants still need to live up here for the same
  // temporal-dead-zone reason as ever (see the block above) — that
  // reasoning didn't depend on `glyphRevealed` specifically, only on
  // `renderFragmentsPanel()`'s boot-time call site needing them to already
  // exist.
  //
  // A `Map` (index -> letter), not a `Set`, for the same reason as before:
  // the letter has to be fetched, not looked up instantly, so there's a
  // real value worth caching for the lifetime of one render, not just a
  // boolean.
  //
  // Same relative-path reasoning as CHECK_ENDPOINT above — same Worker
  // serves both routes, no separate origin to configure.
  const REVEAL_ENDPOINT = "/reveal-glyph";
  // 2026-08-17: fetches a glyph node's own index array — `{indices}`,
  // given `{key}` (n1/n3/deco/b1 — b1 joined 2026-08-17, see its own comment
  // in NODES[] for why). Added alongside the daily glyph-alphabet
  // rotation (see src/index.js's GLYPH_ROTATION_SALT comment for the full
  // reasoning): once the alphabet itself changes every day, a fixed
  // `NODES[].cipher.value` array baked into this file can't be correct
  // for more than one day at a time, since its correct reading depends on
  // *which* day's mapping it's meant to pair with. This endpoint is what
  // a glyph node's cipher block now asks for before it can render
  // anything at all — see fetchNodeCipher() and its call sites in
  // renderBriefing()/renderFragmentsPanel(). Not a secret-guessing oracle
  // the way REVEAL_ENDPOINT is — it hands back *which shape to draw*, the
  // exact same information a legitimate player already gets for free by
  // looking at the rendered page, so it isn't throttled as tightly server-
  // side (see RATE_LIMITS.nodeCipher in src/index.js).
  const NODE_CIPHER_ENDPOINT = "/node-cipher";
  // The alphabet's own size — used by buildGlyphKeyReference() to know how
  // many reference-key buttons to build. Used to be GLYPH_LETTERS.length;
  // now that GLYPH_LETTERS itself is gone from this file, the count has to
  // be its own constant instead. Keep in sync with src/index.js's
  // GLYPH_LETTERS if that ever changes length (it shouldn't — 26 is the
  // whole point).
  const GLYPH_ALPHABET_SIZE = 26;
  const GLYPH_SVG_NS = "http://www.w3.org/2000/svg";
  const GLYPH_TICKS = [
    '<line x1="14" y1="4" x2="14" y2="1"/>',   // N
    '<line x1="24" y1="14" x2="27" y2="14"/>', // E
    '<line x1="14" y1="24" x2="14" y2="27"/>', // S
    '<line x1="4" y1="14" x2="1" y2="14"/>',   // W
  ];
  // Increasing-complexity progression, verified visually before any of
  // this was written (rendered the full 26-glyph set and inspected it):
  // letters cycle through shapes (index % 6) rather than exhausting one
  // shape's tick levels before moving to the next, so adjacent letters in
  // GLYPH_LETTERS don't visually cluster on a single shape.
  const GLYPH_TICK_LEVELS = [0b0000, 0b0001, 0b0101, 0b1011, 0b1111];

  // DECO_NODES' bonus-level framing text — unlike SKYNET_ENDING.flagCipher
  // just above, this is NOT encrypted, and there's no cipher/key pair for
  // it anywhere in this file anymore (an earlier version had one, XOR-
  // keyed off DECO_NODES[].fragment — a real flaw, since those fragments
  // are plain source strings readable without ever finding a single deco,
  // so that "encryption" protected nothing). The actual reward for solving
  // this bonus level — the flag-style string — now comes only from
  // src/index.js's response to a correct "deco" submission (see REWARDS
  // there), same as every other node's answer never shipping to the
  // client. This message is just the pre-submission framing text, shown
  // once decoFound.length reaches DECO_NODES.length — same trade-off
  // SKYNET_ENDING.message already makes (flavor text isn't the secret,
  // only the payoff is), see renderFragmentsPanel near handleDecoClick.
  const DECO_BONUS_LORE = "Four signals, scattered on purpose — losing all four at once was never survivable. Crystal Peak, Shelter Three. That facility went dark on paper decades ago. Paper lies.";

  // The real puzzle, added after the bonus level's first pass just asked
  // for the fragments retyped verbatim — that wasn't a puzzle, just a
  // memory check. The 4 fragments, concatenated in DECO_NODES' own array
  // order (order matters — a shuffled key decrypts to garbage; see
  // revealFragment's own comment for why the actual fragment text can't be
  // spelled out here either), are the whole Vigenère key for this ciphertext
  // — deliberately *not* also requiring NODE_04's answer (an earlier pass
  // briefly did; reverted, since the fragments alone are meant to be the
  // whole ask here). Same mechanism NODE_05 already teaches ("it's not
  // one alphabet, it's several, cycling"), just with a discovered phrase
  // instead of a numeric key. Plaintext is "there are others" — computed
  // via Python and round-tripped before committing, not hand-derived;
  // verify the same way if this ever needs to change (see CLAUDE.md's
  // regenerate guidance, same discipline as any other cipher value in
  // this project).
  //
  // No `DECO_CIPHERTEXT` constant here anymore as of 2026-08-17 — same
  // change, same reason, as NODE_01/03's own cipher.value fields: the
  // glyph alphabet this ciphertext is expressed against now rotates
  // daily (see NODE_CIPHER_ENDPOINT's own comment in the REVEAL_ENDPOINT
  // section), so a static index array can't stay correct for more than a
  // day. renderFragmentsPanel fetches it fresh, per render, via
  // fetchNodeCipher("deco") instead.

  // Set true the moment CORE clears (live or restored) — every ambient-loop
  // play() site (initConsole's autoplay, releaseAmbient's resume, the audio
  // toggle) checks this first and skips playback once it's set. The run is
  // over; nothing should bring ambient back after, not even the toggle.
  let ambientLocked = false;

  // ---------- session retention ----------
  // Progress persists to localStorage (not sessionStorage, so it survives
  // closing the tab) so a reload resumes where the player left off. Wrapped
  // in try/catch throughout: storage can throw (private browsing, quota),
  // and a failure here should just mean "doesn't persist", not a crash.
  const STORAGE_KEY = "skynet:progress";

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      NODES.forEach(n => {
        const entry = saved[n.id];
        if (!entry) return;
        if (STATUS_CLASSES.includes(entry.status)) n.status = entry.status;
        if (typeof entry.submittedAnswer === "string") n.submittedAnswer = entry.submittedAnswer;
        if (typeof entry.unlocked === "boolean") n.unlocked = entry.unlocked;
      });
    } catch (err) {
      // ignore — falls back to each node's coded-in default status
    }
  }
  loadProgress(); // must run before any DOM is built below, so first render reflects it

  // Backfill for saves written before bonus-unlocking existed: if the
  // triggering node is already cleared, its bonus target should be unlocked
  // too. Uses NODES directly, not byId — byId isn't built until below.
  BONUS_ROUTES.forEach(([from, to]) => {
    const fromNode = NODES.find(n => n.id === from);
    const toNode = NODES.find(n => n.id === to);
    if (fromNode && fromNode.status === "cleared" && toNode) toNode.unlocked = true;
  });

  function saveProgress() {
    try {
      // submittedAnswer carries the exact text typed in (see the flag-demo
      // handler in renderBriefing), so a reload shows it in the read-only
      // "solved" box instead of falling back to the canonical answer.
      const state = Object.fromEntries(
        NODES.map(n => [n.id, { status: n.status, submittedAnswer: n.submittedAnswer, unlocked: n.unlocked }])
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // ignore — this session just won't persist
    }
  }

  // ---------- DEV ONLY: reset progress ----------
  // Testing aid — remove this block plus the #reset-progress button
  // (console.html) and .hud-reset rules (console.css) before launch.
  const resetBtn = document.getElementById("reset-progress");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Reset all node progress? This can't be undone.")) return;
      // Six keys — DECO_STORAGE_KEY (below) tracks the 4 decorative
      // easter eggs separately (skipping it would leave them stuck green),
      // DECO_FRAGMENTS_KEY (also below, added 2026-08-17) caches each
      // found decoy's server-confirmed fragment text (skipping it would
      // leave the fragments panel showing recovered text for nodes that
      // — post-reset — no longer show as found), DECO_BONUS_KEY (also
      // below) is the fragment bonus level's own solved state (skipping it
      // would leave the NODE_04/NODE_05 hints unlocked after a reset
      // that's supposed to take them away again), DECO_HINTS_KEY (also
      // below, added 2026-08-17) caches the hint text itself (skipping it
      // would leave the actual hint content behind even though
      // DECO_BONUS_KEY above says the bonus isn't solved anymore — the two
      // have to be cleared together or they'd disagree), and ELAPSED_KEY
      // (declared near the elapsed-time stat further down) is Session T+'s
      // own accumulated-seconds total — skipping it would reset every node
      // but leave the clock still counting up from whatever total the
      // pre-reset playthrough had already reached.
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      try { localStorage.removeItem(DECO_STORAGE_KEY); } catch (err) { /* ignore */ }
      try { localStorage.removeItem(DECO_FRAGMENTS_KEY); } catch (err) { /* ignore */ }
      try { localStorage.removeItem(DECO_BONUS_KEY); } catch (err) { /* ignore */ }
      try { localStorage.removeItem(DECO_HINTS_KEY); } catch (err) { /* ignore */ }
      try { localStorage.removeItem(ELAPSED_KEY); } catch (err) { /* ignore */ }
      window.location.reload();
    });
  }

  const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
  const nodesEl = document.getElementById("nodes");
  const listEl = document.getElementById("list");
  const briefingEl = document.getElementById("briefing");

  // References to the live DOM for each node, keyed by id, so a later status
  // change (see syncStatus/clearNode) can restyle an existing element instead
  // of tearing everything down and rebuilding it.
  const ballEls = {};
  const nodeEls = {};
  const listEls = {};
  NODES.forEach(n => {
    const g = document.getElementById("ball-" + n.id);
    if (g) ballEls[n.id] = g;
  });

  NODES.forEach((n, i) => {
    const wrap = document.createElement("div");
    wrap.style.position = "absolute";
    wrap.style.left = ((n.x - VIEW_X) / MAP_W * 100) + "%";
    wrap.style.top = ((n.y - VIEW_Y) / MAP_H * 100) + "%";
    wrap.style.setProperty("--i", i);

    const btn = document.createElement("div");
    btn.style.left = "0px";
    btn.style.top = "0px";
    btn.dataset.id = n.id;
    // Every node is clickable regardless of status — locked ones just show
    // their (unclearable) briefing (renderBriefing's status==="locked" branch).
    btn.addEventListener("click", () => selectNode(n.id));
    btn.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectNode(n.id); }
    });
    nodeEls[n.id] = btn;

    const label = document.createElement("div");
    label.className = "node-label";
    label.textContent = n.label;

    wrap.appendChild(btn);
    wrap.appendChild(label);
    nodesEl.appendChild(wrap);
  });

  // ---------- decorative easter-egg nodes ----------
  // 4 small ring icons baked into the skull artwork (#ball-d1..d4 in
  // console.html) — still outside NODES/CHAIN, still no hover affordance
  // at all (not even a cursor change — see .deco-node in console.css) and
  // no tabindex/keyboard handling: a mouse-only secret nothing marks as
  // interactive in advance. Clicking one recolors it green, replays the
  // clear-draw stroke animation real nodes get, plays a one-shot chime —
  // same as always. What changed (2026-08-15): each now also carries a
  // `fragment`; finding all 4 (join order fixed by this array, independent
  // of find order) unlocks a real bonus level — a submission form appears
  // in the HUD (#fragments-toggle/#fragments-panel, see
  // renderFragmentsPanel near handleDecoClick) asking for the assembled
  // fragments, checked server-side exactly like every other node's answer
  // (ANSWER_HASHES.deco in src/index.js). A *correct* submission — not
  // just finding all 4 — is what unlocks light-touch hints on
  // NODE_04/NODE_05 specifically (see renderBriefing's decoBonusReward
  // check) and reveals the actual reward text, which never ships to the
  // client until earned. Still no briefing/counter change from a deco
  // click itself; the payoff is entirely in HUD state.
  //
  // 2026-08-17 addendum: each entry below used to carry its own `fragment`
  // field, spelling the actual word out in plain source — a real leak,
  // same shape as the GLYPH_LETTERS one src/index.js's own comment
  // describes. Those four words are the entire point of "find 4 hidden
  // decorative nodes on the map": reading this array handed them out
  // instantly, in the right join order, with zero clicking on the skull
  // artwork required — the treasure-hunt step was free to anyone reading
  // source, same failure mode as an unprotected answerHash, just for a
  // discovery step instead of an answer. Fixed the same way: DECO_NODES
  // now only carries id/x/y, src/index.js holds the actual words in a
  // DECO_FRAGMENTS map (see that file's own comment near GLYPH_LETTERS —
  // deliberately not quoted here either, for the same reason this file's
  // comments never spell out GLYPH_LETTERS' own mapping), and
  // revealFragment() below asks FRAGMENT_ENDPOINT for one id's word at a
  // time — mirrors buildGlyphIcon/REVEAL_ENDPOINT exactly, including the
  // rate-limited-fail-open behavior. Note this is a narrower fix than the
  // reward-string one already done: it only protects the fragment *text*,
  // not "whether a hotspot exists at (x,y)" — the coordinates are still
  // plain source, since hiding them would mean not rendering the hotspot
  // at all, which isn't what a mouse-only find-it secret needs; only the
  // *content* you get for finding one was ever meant to require play.
  const DECO_NODES = [
    { id: "d1", x: 433, y: 97 },
    { id: "d2", x: 172, y: 217 },
    { id: "d3", x: 851, y: 1461 },
    { id: "d4", x: 1384, y: 604 },
  ];
  const DECO_STORAGE_KEY = "skynet:deco-found";
  let decoFound = [];
  try {
    decoFound = JSON.parse(localStorage.getItem(DECO_STORAGE_KEY) || "[]");
  } catch (err) {
    decoFound = []; // storage unavailable — just won't persist, same fallback as loadProgress()
  }

  // The actual fragment text, keyed by deco id, known only once
  // FRAGMENT_ENDPOINT has confirmed it for this id — cached across reloads
  // the same way DECO_BONUS_KEY caches the confirmed reward text, so a
  // returning player who legitimately found all 4 before doesn't need to
  // re-click anything, just gets one silent re-fetch per missing id on
  // next load (see renderFragmentsPanel). A page load fresh off this
  // change starts empty even for a player who'd already found all 4 under
  // the old scheme — this key didn't exist before, nothing migrates in,
  // same "clean break" every other answer-shape change in this project has
  // taken.
  const FRAGMENT_ENDPOINT = "/reveal-fragment";
  // NODE_02's cipher payload, added 2026-08-17 alongside NODE_AUDIO in
  // src/index.js — see that constant's own comment and NODE_02's cipher
  // comment above (in NODES) for why this moved off a plain static path.
  // {key} -> raw audio/wav bytes, not the {correct}/{letter}/{fragment}/
  // {indices} JSON shape every other endpoint here uses — see
  // fetchNodeAudio just below for why.
  const NODE_AUDIO_ENDPOINT = "/node-audio";
  const DECO_FRAGMENTS_KEY = "skynet:deco-fragments";
  let decoFragments = {};
  try {
    decoFragments = JSON.parse(localStorage.getItem(DECO_FRAGMENTS_KEY) || "{}");
  } catch (err) {
    decoFragments = {};
  }

  // Fetches and caches one id's fragment text — returns true/false instead
  // of throwing so callers (renderFragmentsPanel) can retry without their
  // own try/catch, same "fail closed, not crash" shape checkRateLimit's
  // caller in src/index.js already follows. A failed id is simply left out
  // of decoFragments, safe to call again later (e.g. reopening the panel).
  async function revealFragment(id) {
    if (id in decoFragments) return true;
    try {
      const res = await apiFetch(FRAGMENT_ENDPOINT, { decoId: id });
      if (!res.ok) return false; // covers 429 (throttled) and any other non-2xx alike — nothing here needs to tell those apart
      const { fragment } = await res.json();
      decoFragments[id] = fragment;
      try { localStorage.setItem(DECO_FRAGMENTS_KEY, JSON.stringify(decoFragments)); } catch (err) { /* ignore */ }
      return true;
    } catch (err) {
      return false; // network failure — same non-fatal treatment as buildGlyphIcon's own catch
    }
  }

  // The confirmed reward string once the bonus level below is solved, or
  // null before that — this, not decoFound.length alone, is what actually
  // gates the NODE_04/NODE_05 hints in renderBriefing (decoFound.length
  // only gates whether the submission form appears at all). Stores the
  // reward text itself rather than a bare boolean so a reload can show the
  // solved state without a second server round-trip — same idea as
  // NODES[].submittedAnswer persisting the confirmed answer, not just a
  // "solved" flag.
  const DECO_BONUS_KEY = "skynet:deco-bonus";
  let decoBonusReward = null;
  try {
    decoBonusReward = localStorage.getItem(DECO_BONUS_KEY);
  } catch (err) {
    decoBonusReward = null;
  }

  // The NODE_04/NODE_05 hint text itself, or null before the bonus is
  // solved — added 2026-08-17, same leak/fix shape as everything else
  // moved server-side this session: these used to be a hardcoded ternary
  // right in renderBriefing(), gated only by decoBonusReward !== null —
  // meaning reading source handed out both hints unconditionally, whether
  // or not the bonus had actually been solved. Now they arrive only as
  // part of a genuinely correct "deco" submission's own response (see
  // HINTS in src/index.js and the submit handler below) and get cached
  // here, same "store the confirmed value, not just a boolean" approach
  // DECO_BONUS_KEY already uses, so a reload shows them without a second
  // server round-trip. A legacy save that already has decoBonusReward set
  // from before this existed won't retroactively have this populated —
  // same accepted "clean break, no migration" trade-off every other
  // schema change this session has made; #reset-progress is the existing
  // escape hatch for anyone who wants a clean run instead.
  const DECO_HINTS_KEY = "skynet:deco-hints";
  let decoHints = null;
  try {
    decoHints = JSON.parse(localStorage.getItem(DECO_HINTS_KEY) || "null");
  } catch (err) {
    decoHints = null;
  }

  // Per-node glyph reveal cache — added 2026-08-17 (later the same day as
  // the change directly below it), in direct response to user feedback:
  // reselecting a node you'd already clicked through was forcing every
  // symbol to re-hide, which read as a bug rather than the deliberate
  // friction it was. That earlier change (see buildGlyphIcon/
  // REVEAL_ENDPOINT's own comments) made `glyphRevealed` a fresh, empty
  // Map on every single renderBriefing()/renderFragmentsPanel() call
  // specifically to kill *cross-node* leakage — revealing a letter on
  // NODE_01 was quietly pre-revealing the same index on NODE_03/b1/deco
  // too, since they all read against the same daily alphabet, letting a
  // player (or script) front-load all 26 once and coast through every
  // later glyph node for free. That property is worth keeping; "you have
  // to redo it every time you so much as reselect the same node" was not
  // part of the ask, just a side effect of the fix being scoped wider than
  // it needed to be. This splits the difference: one Map per cipher key
  // ("n1"/"n3"/"b1"/"deco"), not one shared Map for all of them — revealed
  // state now survives navigating away and back to the *same* node, but a
  // reveal on one key still never touches another's. Deliberately kept in
  // memory only, not localStorage — a full reload still re-hides
  // everything, preserving the "reload = start over" cost that was
  // explicitly the point of the original change, just not applying it to
  // ordinary in-session navigation anymore.
  const glyphRevealedByKey = new Map();
  function revealedMapFor(key) {
    if (!glyphRevealedByKey.has(key)) glyphRevealedByKey.set(key, new Map());
    return glyphRevealedByKey.get(key);
  }

  // replay:false is the boot-time path for anything found on a past visit —
  // jumps straight to the green end state, same rule celebrateClear follows
  // for real nodes ("don't replay the celebration on reload").
  function markDecoFound(id, { replay }) {
    const ball = document.getElementById("ball-" + id);
    if (!ball) return;
    if (replay) {
      ball.querySelectorAll("path").forEach((p, i) => p.style.setProperty("--cd", i));
      ball.classList.add("just-cleared");
    }
    ball.classList.add("cleared");
  }

  // One-shot discovery chime — deliberately not run through duckAmbientFor()
  // like puzzle clips/Cleared.mp3 are: this is a secret aside, not a puzzle
  // beat, so ambient keeps playing underneath it. currentTime reset on every
  // call so rapid-fire discoveries each restart the clip cleanly. Also
  // doubles as the "all 4 found" chime (see handleDecoClick) — one clip
  // covers both, no separate sound needed for the completing click.
  const decoAudio = document.getElementById("deco-audio");
  if (decoAudio) decoAudio.volume = 0.4; // -40% from the clip's native level

  // #fragments-toggle/#fragments-panel (console.html) — hidden until all 4
  // fragments are found, not just the first: same "no advance affordance"
  // rule as the deco hotspots themselves, just carried further than the
  // earlier "shows partial progress" version did — nothing at all hints
  // this exists until the whole hidden set is already complete, no "2/4"
  // along the way to notice and go looking for the rest of. Kept as a
  // small stateless helper rather than folded into handleDecoClick
  // directly so the boot-restore path below can reuse the HUD-sync half
  // without also rebuilding the panel body.
  function updateFragmentsHud() {
    const toggle = document.getElementById("fragments-toggle");
    const state = document.getElementById("fragments-state");
    if (!toggle || !state || decoFound.length < DECO_NODES.length) return;
    toggle.hidden = false;
    state.textContent = decoFound.length + "/" + DECO_NODES.length;
    if (decoBonusReward !== null) toggle.classList.add("complete");
  }

  // On lower resolutions/narrower layouts #fragments-panel can render
  // partially behind other page content, making #fragments-toggle itself
  // hard or impossible to click again to close it — the original single
  // way to close it. openFragmentsPanel/closeFragmentsPanel centralize
  // that state change into one place regardless of *what* triggers it
  // (the toggle, a completing deco click, the close button below, or a
  // click outside the panel — see all four call sites), and
  // fragmentsPanelJustOpened is what stops the "click outside closes it"
  // listener from immediately closing a panel that a *different* part of
  // this same click just opened: the click that completes the 4th
  // fragment (or opens via the toggle) still bubbles all the way up to
  // document after handleDecoClick/the toggle handler runs, and without
  // this guard that bubbled click would read as "outside the panel" and
  // close it on the same tick it opened — a one-frame open-then-shut
  // flicker, not a real bug in the outside-click logic itself, just an
  // ordering trap "click outside to close" implementations commonly fall
  // into. Consumed (reset to false) the first time the document listener
  // sees it, so it never masks a *later*, genuine outside click.
  let fragmentsPanelJustOpened = false;
  function openFragmentsPanel() {
    const panel = document.getElementById("fragments-panel");
    const toggle = document.getElementById("fragments-toggle");
    if (panel) panel.hidden = false;
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    fragmentsPanelJustOpened = true;
  }
  function closeFragmentsPanel() {
    const panel = document.getElementById("fragments-panel");
    const toggle = document.getElementById("fragments-toggle");
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  // Small "×" button prepended into #fragments-panel's own content by
  // renderFragmentsPanel below (both branches) — an always-reachable way
  // to close the panel that lives *inside* it, so it's never dependent on
  // #fragments-toggle still being reachable/on-screen the way the toggle-
  // only close path was.
  function buildFragmentsCloseButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fragments-close";
    btn.setAttribute("aria-label", "Close");
    btn.textContent = "×";
    btn.addEventListener("click", closeFragmentsPanel);
    return btn;
  }

  // Rebuilds #fragments-panel's contents from scratch every call — same
  // "wipe and re-append" approach renderBriefing uses for the main panel,
  // rather than incrementally patching the DOM, so there's exactly one
  // place deciding what this panel looks like for any given state. Three
  // states: already solved (read-only reward display), all 4 found but
  // not yet solved (the submission form), or fewer than 4 found (nothing
  // worth rendering — the toggle itself stays hidden before the first
  // find via updateFragmentsHud, this just has nothing to show in between).
  // Only builds *content* — never touches panel.hidden itself; that's
  // openFragmentsPanel/closeFragmentsPanel's job, see all their call sites.
  //
  // Async now (2026-08-17): the two branches below that display fragment
  // text need decoFragments actually populated first, and that's no longer
  // guaranteed synchronously (see revealFragment). Every existing call
  // site (handleDecoClick, the boot-restore path, the submit handler) just
  // invokes this fire-and-forget same as before — nothing needs to await
  // it, the panel simply finishes painting itself a moment later once the
  // fetch(es) resolve, same pattern buildGlyphIcon's own click handler
  // already established for "the DOM updates once the network answers."
  async function renderFragmentsPanel() {
    const panel = document.getElementById("fragments-panel");
    if (!panel) return;
    panel.innerHTML = "";
    panel.appendChild(buildFragmentsCloseButton());

    if (decoBonusReward !== null) {
      // Already earned — nothing left to protect here, so this branch
      // stays passive (no fetch) rather than triggering more network
      // calls just to redisplay flavor text. Falls back per-id to
      // "(not recorded)" for the one edge case where that's not already
      // true: a save that earned decoBonusReward before this change
      // shipped, so DECO_FRAGMENTS_KEY never got populated for it — same
      // graceful-degradation move NODES[] already makes for a legacy
      // cleared node with no submittedAnswer.
      const found = document.createElement("p");
      found.className = "fragments-message";
      found.textContent = "Signal fragments recovered: " + DECO_NODES.map(n => decoFragments[n.id] || "(not recorded)").join(", ") + ".";
      const lore = document.createElement("p");
      lore.className = "fragments-message";
      lore.textContent = DECO_BONUS_LORE;
      const reward = document.createElement("p");
      reward.className = "fragments-message fragments-reward";
      reward.textContent = decoBonusReward;
      panel.appendChild(found);
      panel.appendChild(lore);
      panel.appendChild(reward);
      return;
    }

    if (decoFound.length !== DECO_NODES.length) return; // not earned yet, nothing to render

    // All 4 hotspots found, but this player's browser might not have every
    // fragment's text cached yet (fresh page load post-migration, or an
    // earlier reveal attempt got throttled/dropped) — go get whichever are
    // still missing before showing the key/cipher, rather than rendering
    // with holes in it.
    const missing = DECO_NODES.filter(n => !(n.id in decoFragments));
    if (missing.length > 0) {
      const loading = document.createElement("p");
      loading.className = "fragments-message";
      loading.textContent = "// recovering signal fragments...";
      panel.appendChild(loading);
      const ok = (await Promise.all(missing.map(n => revealFragment(n.id)))).every(Boolean);
      if (!panel.isConnected) return; // panel got torn down/rebuilt while this was in flight — nothing left to update
      if (ok) {
        renderFragmentsPanel(); // now fully cached — re-render for real
      } else {
        loading.textContent = "// UPLINK THROTTLED OR UNREACHABLE — reopen this panel to retry.";
      }
      return;
    }

    const lore = document.createElement("p");
    lore.className = "fragments-message";
    lore.textContent = DECO_BONUS_LORE;
    const found = document.createElement("p");
    found.className = "fragments-message";
    found.textContent = "Signal fragments recovered: " + DECO_NODES.map(n => decoFragments[n.id]).join(", ") + ".";
    panel.appendChild(lore);
    panel.appendChild(found);

    // Same cipher-block markup renderBriefing uses for every node's own
    // puzzle payload (label + the actual cipher) — reused here so this
    // reads as the same kind of thing the rest of the game already taught,
    // not a one-off. buildGlyphCipher() also brings its own always-shown
    // 26-letter reference key along with it, same as any other glyph node.
    const cipherBlock = document.createElement("div");
    cipherBlock.className = "cipher-block";
    const cipherLabel = document.createElement("div");
    cipherLabel.className = "label";
    cipherLabel.textContent = "Residual Transmission — Keyed Cipher";
    cipherBlock.appendChild(cipherLabel);
    // Appended before the async fetch below, same isConnected
    // staleness-guard reasoning as renderBriefing's own glyph branch — the
    // check below reuses `panel.isConnected` (not cipherBlock's own) since
    // panel is the stable, persistent element this function always wipes
    // and rebuilds into, matching the missing-fragments branch's own
    // isConnected check just above.
    panel.appendChild(cipherBlock);

    // Persists across reopening this same panel (see glyphRevealedByKey's
    // own comment) — the submit handler below closes over this same
    // instance to gate on "every glyph in this transmission has actually
    // been revealed, at some point this session," same pattern
    // renderBriefing's own glyph nodes use.
    const glyphRevealed = revealedMapFor("deco");
    const cipherLoading = document.createElement("div");
    cipherLoading.className = "cipher-text";
    cipherLoading.textContent = "// decoding transmission...";
    cipherBlock.appendChild(cipherLoading);
    // 2026-08-17: fetched fresh, per render, instead of a static
    // DECO_CIPHERTEXT constant — see NODE_CIPHER_ENDPOINT's own comment
    // for why (the glyph alphabet this is expressed against now rotates
    // daily, so a baked-in array can't stay correct for more than a day).
    const decoIndices = await fetchNodeCipher("deco");
    if (!panel.isConnected) return; // panel got torn down/rebuilt while this was in flight — nothing left to update
    cipherLoading.remove();
    let decoCipherFailed = false;
    if (decoIndices) {
      cipherBlock.appendChild(buildGlyphCipher(decoIndices, glyphRevealed));
    } else {
      decoCipherFailed = true;
      const err = document.createElement("div");
      err.className = "cipher-text";
      err.textContent = "// TRANSMISSION UNREADABLE — reopen this panel to retry.";
      cipherBlock.appendChild(err);
    }

    // Same flag-demo markup and async-fetch-to-CHECK_ENDPOINT handler as
    // renderBriefing's own submission form (see that code) — mirrored
    // literally rather than pulled into a shared helper, matching this
    // file's existing convention: renderBriefing's own solved/unsolved
    // flag-demo blocks are already two separate literal blocks for the
    // same content, not a shared abstraction either.
    const demo = document.createElement("div");
    demo.className = "flag-demo";
    demo.innerHTML = `
      <div class="label">Flag Submission</div>
      <div class="flag-row">
        <input type="text" placeholder="type your answer" aria-label="Bonus flag input" autocomplete="off" spellcheck="false" />
        <button type="button">Submit</button>
      </div>
      <div class="flag-msg"></div>`;
    const input = demo.querySelector("input");
    const msg = demo.querySelector(".flag-msg");
    const button = demo.querySelector("button");
    let submitting = false;
    button.addEventListener("click", async () => {
      if (submitting) return;
      const val = input.value.trim();
      if (!val) {
        msg.textContent = "// enter something to see this state.";
        return;
      }
      // Gate added 2026-08-17, at the user's explicit request: a guess
      // can't even be sent until every glyph in this render's fetched
      // decoIndices has been revealed through the reference key above —
      // see glyphRevealed's own comment just above. This is a client-side
      // speed bump, not a security boundary (see the matching comment on
      // renderBriefing's own gate for the honest caveat) — the point is
      // closing the "already know the plaintext, never touched the cipher
      // this time" path through the site's own UI, not stopping a direct
      // POST to CHECK_ENDPOINT. decoCipherFailed (also 2026-08-17, added
      // alongside NODE_CIPHER_ENDPOINT) blocks the same way if the cipher
      // never loaded at all — there was nothing to have decoded either.
      if (decoCipherFailed || decoIndices.some(i => i !== null && !glyphRevealed.has(i))) {
        msg.textContent = decoCipherFailed
          ? "// TRANSMISSION UNREADABLE — reopen this panel to retry."
          : "// DECODE THE FULL TRANSMISSION FIRST — some symbols above are still unrevealed.";
        return;
      }

      submitting = true;
      button.disabled = true;
      msg.textContent = "// TRANSMITTING GUESS...";

      let result;
      try {
        const res = await apiFetch(CHECK_ENDPOINT, { nodeId: "deco", guess: val });
        result = await res.json();
        if (res.status === 429) {
          msg.textContent = result.retryAfter
            ? `// UPLINK THROTTLED — retry in ${result.retryAfter}s.`
            : "// UPLINK THROTTLED — slow down.";
          return;
        }
        if (!res.ok) throw new Error("bad response");
      } catch (err) {
        msg.textContent = "// CONNECTION LOST — check your uplink and retry.";
        return;
      } finally {
        submitting = false;
        button.disabled = false;
      }

      if (result.correct) {
        msg.textContent = "// ACCESS GRANTED — segment neutralized.";
        decoBonusReward = result.reward;
        try { localStorage.setItem(DECO_BONUS_KEY, decoBonusReward); } catch (err) { /* ignore */ }
        // result.hints is only present at all on a genuinely correct
        // submission (see HINTS in src/index.js) — cache it the same way
        // as the reward, right alongside it.
        if (result.hints) {
          decoHints = result.hints;
          try { localStorage.setItem(DECO_HINTS_KEY, JSON.stringify(decoHints)); } catch (err) { /* ignore */ }
        }
        updateFragmentsHud();
        renderFragmentsPanel();
        // If NODE_04/NODE_05's briefing happens to already be open, refresh
        // it so the newly-unlocked hint appears without a manual re-click —
        // selectNode() re-renders whatever id is passed, so re-invoking it
        // with the currently-selected id (read off the DOM's own .selected
        // marker via selectNode itself — the only place that state already
        // lives, nothing new tracked here) is enough.
        const selectedId = document.querySelector(".node.selected, .list-item.selected")?.dataset.id;
        if (selectedId === "n4" || selectedId === "n5") selectNode(selectedId);
      } else {
        msg.textContent = "// ACCESS DENIED — incorrect.";
      }
    });
    panel.appendChild(demo);
  }

  // Shared by both click surfaces below (.deco-node div + the in-artwork
  // #ball-d* group) so "found" is recorded the same regardless of which fires.
  function handleDecoClick(id) {
    if (decoFound.includes(id)) return;
    decoFound.push(id);
    try { localStorage.setItem(DECO_STORAGE_KEY, JSON.stringify(decoFound)); } catch (err) { /* ignore */ }
    markDecoFound(id, { replay: true });
    if (decoAudio) {
      decoAudio.currentTime = 0;
      decoAudio.play().catch(() => {});
    }
    updateFragmentsHud();
    renderFragmentsPanel();
    // The completing click (decoFound.length just reached DECO_NODES.length
    // — the early return above means that can only happen once, on this
    // exact click) also opens the panel outright, the same "surface itself
    // the moment it's ready" beat a live puzzle solve gets. Every earlier
    // find just updates state quietly instead, per updateFragmentsHud's own
    // "no advance affordance" reasoning.
    if (decoFound.length === DECO_NODES.length && decoBonusReward === null) {
      openFragmentsPanel();
    }
  }

  DECO_NODES.forEach(n => {
    if (decoFound.includes(n.id)) markDecoFound(n.id, { replay: false });

    const hotspot = document.createElement("div");
    hotspot.className = "deco-node";
    hotspot.style.left = ((n.x - VIEW_X) / MAP_W * 100) + "%";
    hotspot.style.top = ((n.y - VIEW_Y) / MAP_H * 100) + "%";
    hotspot.addEventListener("click", () => handleDecoClick(n.id));
    nodesEl.appendChild(hotspot);

    // Second, redundant-on-purpose click surface bound to the icon's own SVG
    // group — the .deco-node div above is a fixed-CSS-px circle that doesn't
    // rescale with the SVG's viewBox, so on a large render the icon's spoke
    // tips can extend past it; this SVG-native hit target (the <circle
    // class="deco-hit">, see console.css) always matches what's on screen.
    // Both route through handleDecoClick, whichever fires first just wins.
    const ball = document.getElementById("ball-" + n.id);
    if (ball) ball.addEventListener("click", () => handleDecoClick(n.id));
  });

  // Boot-restore path — mirrors the DECO_NODES.forEach loop just above
  // (replay:false for each already-found ball) at the HUD-and-panel level:
  // sync the toggle/count and rebuild the panel's contents instantly with
  // no animation, but never force it open on a reload — same "don't replay
  // the reveal" rule every other boot-restore path in this file already
  // follows. renderFragmentsPanel() building fresh content doesn't imply
  // un-hiding the panel itself; only a live completing click
  // (handleDecoClick) or a manual toggle click does that.
  updateFragmentsHud();
  renderFragmentsPanel();

  const fragmentsToggle = document.getElementById("fragments-toggle");
  if (fragmentsToggle) {
    fragmentsToggle.addEventListener("click", () => {
      if (decoFound.length < DECO_NODES.length) return; // nothing to show yet, quietly do nothing rather than open an empty panel
      const panel = document.getElementById("fragments-panel");
      if (!panel) return;
      if (panel.hidden) openFragmentsPanel(); else closeFragmentsPanel();
    });
  }

  // Closing the panel no longer depends on hitting #fragments-toggle again
  // (see openFragmentsPanel/closeFragmentsPanel's own comment for why that
  // could fail on narrower layouts) — a click anywhere outside both the
  // panel and the toggle closes it too, standard dropdown/popover
  // behavior. fragmentsPanelJustOpened is what stops this from closing a
  // panel a *different* handler on this exact same click (a completing
  // deco find, or the toggle's own open branch just above) just opened —
  // see that flag's own comment for the full ordering explanation.
  document.addEventListener("click", (e) => {
    if (fragmentsPanelJustOpened) { fragmentsPanelJustOpened = false; return; }
    const panel = document.getElementById("fragments-panel");
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target) || (fragmentsToggle && fragmentsToggle.contains(e.target))) return;
    closeFragmentsPanel();
  });

  function makeListItem(n, showStem, i) {
    // Every node is tappable regardless of status — always a real <button>.
    const el = document.createElement("button");
    el.type = "button";
    el.dataset.tap = "true";
    el.className = "list-item " + n.status + (n.core ? " core" : "") + (n.glow ? " glow" : "");
    el.dataset.id = n.id;
    el.style.setProperty("--i", i);
    el.innerHTML = (showStem ? '<span class="stem"></span>' : "") +
      '<span class="list-dot"><span class="dot"></span></span>' +
      '<span class="list-main">' +
        '<span class="list-label">' + n.label + '</span>' +
        '<span class="list-status">' + statusLabel(n) + '</span>' +
      '</span>';
    el.addEventListener("click", () => selectNode(n.id));
    return el;
  }

  function buildList() {
    // Excludes anything BONUS_ROUTES targets ("reached via a side branch,
    // inserted below instead") rather than a hand-maintained bonus flag, so
    // it can't drift out of sync with what BONUS_ROUTES actually says.
    const sideBranchIds = new Set(BONUS_ROUTES.map(([, to]) => to));
    const mainOrder = NODES.filter(n => !sideBranchIds.has(n.id));
    const bonusAfter = {};
    BONUS_ROUTES.forEach(([from, to]) => {
      (bonusAfter[from] = bonusAfter[from] || []).push(byId[to]);
    });

    let i = 0;
    mainOrder.forEach((n, idx) => {
      const el = makeListItem(n, idx < mainOrder.length - 1, i++);
      listEls[n.id] = el;
      listEl.appendChild(el);
      (bonusAfter[n.id] || []).forEach(b => {
        const bEl = makeListItem(b, false, i++);
        listEls[b.id] = bEl;
        listEl.appendChild(bEl);
      });
    });
  }
  buildList();

  // Restyles the ball/node-dot/list-item for one node from its current
  // n.status — the single place all three DOM views get kept in sync,
  // called once for every node at boot and again from clearNode() below.
  function syncStatus(n) {
    // `unlocked` is its own class alongside status — a bonus node's status
    // stays "bonus" whether or not it's been unlocked (see the NODES
    // comment on b1), so this is the only visual hook CSS has for "found
    // but not yet solved" vs. "not found yet".
    const unlockedClass = n.unlocked ? " unlocked" : "";

    const ball = ballEls[n.id];
    if (ball) {
      STATUS_CLASSES.forEach(c => ball.classList.remove(c));
      ball.classList.remove("unlocked");
      ball.classList.add(n.status);
      if (n.unlocked) ball.classList.add("unlocked");
    }

    const btn = nodeEls[n.id];
    if (btn) {
      btn.className = "node " + n.status + unlockedClass + (n.core ? " core" : "") + (n.glow ? " glow" : "");
      // Always focusable/labeled — every node is interactable, locked included.
      btn.tabIndex = 0;
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", n.title + " — " + statusLabel(n));
    }

    const item = listEls[n.id];
    if (item) {
      item.className = "list-item " + n.status + unlockedClass + (n.core ? " core" : "") + (n.glow ? " glow" : "");
      const label = item.querySelector(".list-status");
      if (label) label.textContent = statusLabel(n);
    }
  }
  NODES.forEach(syncStatus);

  // Restored-save case: a returning player whose save already has CORE
  // cleared should see the finished green skull and shutdown panel
  // immediately, not replay the draw-on wave/typewriter sequence on every
  // reload — hence replay:false + a direct settleShutdown() call here,
  // vs. replay:true at the live-clear site in clearNode() below.
  if (byId[CHAIN[CHAIN.length - 1]].status === "cleared") {
    setSkullVictory({ replay: false });
    settleShutdown();
    // Land directly on the same end state clearNode()'s core-cleared/
    // recentered path animates into — right panel gone, skull centered —
    // rather than the left-docked mid-game layout. No -play class: nothing
    // here should animate on load.
    const mainForExit = document.querySelector("main");
    if (mainForExit) {
      mainForExit.classList.add("core-cleared");
      mainForExit.classList.add("recentered");
    }
  }

  // Marks a node cleared, unlocks the next node in CHAIN (if any), refreshes
  // the "N / total" counter, and re-renders the briefing panel so it reflects
  // the new state immediately.
  function clearNode(id) {
    const n = byId[id];
    n.status = "cleared";
    syncStatus(n);
    celebrateClear(n); // green draw-on replay + ducked music + chime — see below

    // CORE is CHAIN's last entry, so clearing it means n1..n6 are already
    // cleared too — b1 and the 4 decorative nodes are outside CHAIN and
    // don't factor in: this is "the main chain is won", not "everything is".
    if (id === CHAIN[CHAIN.length - 1]) {
      // Right panel starts leaving immediately, independent of the wave/
      // shutdown sequence below (see main.core-cleared in console.css for
      // what it hides). Once it's gone AND CORE's own clear-draw animation
      // has finished (whichever takes longer), the skull recenters into the
      // freed space (main.recentered/.recenter-play). NODE_CLEAR_MS mirrors
      // clear-draw's own duration/stagger math (14 paths per ball, indexed
      // 0-13: 13*94 + 1600 = 2822ms) rather than a guessed number;
      // PANEL_FADE_MS matches main.core-cleared's own transition (900ms).
      const mainForExit = document.querySelector("main");
      if (mainForExit) {
        mainForExit.classList.add("core-cleared");
        const NODE_CLEAR_MS = 13 * 94 + 1600;
        const PANEL_FADE_MS = 900;
        const reduceMotionExit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotionExit) {
          // Neither animation plays under reduced motion, so recenter right
          // away rather than wait out a duration nothing is elapsing for.
          mainForExit.classList.add("recentered");
        } else {
          setTimeout(() => {
            mainForExit.classList.add("recenter-play");
            mainForExit.classList.add("recentered");
          }, Math.max(NODE_CLEAR_MS, PANEL_FADE_MS));
        }
      }

      // Whole-skull green wave starts immediately — not gated on CORE's own
      // clear-draw or the chime finishing. CORE's ball still plays its own
      // clear-draw/flash on top via .ball.just-cleared's higher-specificity
      // rule (see the undraw/!important comment further down), so it just
      // runs concurrently with the wave instead of gating it.
      setSkullVictory({ replay: true });
    }

    // Guarded against CHAIN.indexOf(id) === -1 for a non-chain id (b1) —
    // CHAIN[-1 + 1] is CHAIN[0], which would otherwise hand "next" to NODE_01.
    const chainIdx = CHAIN.indexOf(id);
    const next = chainIdx >= 0 ? byId[CHAIN[chainIdx + 1]] : null;
    if (next) {
      next.status = "current";
      syncStatus(next);
    }

    // Unlocks whatever bonus node this id feeds, per BONUS_ROUTES — status
    // stays "bonus" (not "current"), see the NODES comment on b1 for why.
    BONUS_ROUTES.forEach(([from, to]) => {
      if (from === id) {
        const bonus = byId[to];
        bonus.unlocked = true;
        syncStatus(bonus);
      }
    });

    // Counts only main-chain nodes — a cleared bonus node is "cleared" too
    // but isn't part of totalMain, so including it would show "8 / 7".
    const clearedNow = NODES.filter(x => CHAIN.includes(x.id) && x.status === "cleared").length;
    document.getElementById("stat-cleared").textContent = clearedNow + " / " + totalMain;

    saveProgress();
    selectNode(id);
  }

  // Endgame flourish: once CORE clears, the whole skeleton (not just node
  // balls) turns green (main.victory/.victory-play in console.css). `replay`
  // is true for a live clear (plays the wave, then chains into shutdown) and
  // false for the boot-time restore below (already-green, no replay) — same
  // "don't replay on reload" rule celebrateClear follows for single nodes.
  // Uses document.querySelector("main") rather than the `mainEl` const
  // declared later, since the boot-time call site runs before that line does.
  function setSkullVictory({ replay }) {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("victory");

    // Ambient stops here, permanently. document.getElementById instead of
    // the closure `audioEl`, same forward-reference reason as `main` above:
    // audioEl isn't declared yet when the boot-time restore call runs.
    ambientLocked = true;
    const ambient = document.getElementById("theme-audio");
    if (ambient) ambient.pause();

    if (!replay) return;
    main.classList.add("victory-play");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      // victory-draw never actually plays under reduced motion (see its
      // no-preference guard in console.css), so there's no animationend to
      // wait on — go straight to the settled shutdown state.
      settleShutdown();
      return;
    }

    // Wait for the wave to finish, computed from the DOM's own max --d
    // (mirrors victory-draw's own delay/duration formula in console.css)
    // rather than a hardcoded number, so it can't drift out of sync.
    // Deliberately a timeout, not "wait for one path's animationend": the
    // globally-slowest path usually belongs to an already-cleared ball,
    // which keeps running its own higher-specificity clear-draw animation
    // instead of victory-draw — its animationend for "victory-draw" would
    // then never fire, hanging the whole sequence.
    const paths = Array.from(document.querySelectorAll("#skull-art path"));
    let maxD = 0;
    paths.forEach(p => {
      const d = parseFloat(p.style.getPropertyValue("--d")) || 0;
      if (d > maxD) maxD = d;
    });
    setTimeout(playShutdown, maxD * 1250 + 1630);
  }

  // Fills in the ending text and jumps straight to the fully-settled state —
  // no reverse-draw, no typewriter. Used by the boot-time restore check and
  // the reduced-motion branch above (neither has anything to animate
  // through), and as playShutdown's own fallback if it can't find the DOM
  // it needs; a normal live playShutdown reaches the same end state itself,
  // via its typewriter's done callback, rather than calling this.
  function settleShutdown() {
    const main = document.querySelector("main");
    if (!main) return;
    const msgEl = document.getElementById("shutdown-message");
    const labelEl = document.getElementById("shutdown-flag-label");
    const flagEl = document.getElementById("shutdown-flag-value");
    if (msgEl) msgEl.textContent = SKYNET_ENDING.message;
    if (labelEl) labelEl.textContent = SHUTDOWN_FLAG_LABEL;
    if (flagEl) flagEl.textContent = decryptEndingFlag();
    main.classList.add("shutdown");
  }

  // Reveals `text` into `el` a character at a time. Skipped under reduced
  // motion — settleShutdown's instant fill covers that path instead.
  function typewriter(el, text, msPerChar, done) {
    let i = 0;
    (function step() {
      el.textContent = text.slice(0, i);
      i++;
      if (i <= text.length) setTimeout(step, msPerChar);
      else if (done) done();
    })();
  }

  // The live-only animated chain: a literal reverse of the boot draw-on
  // (see undraw/--rd in console.css) plays first, then — only once that
  // has actually finished — the much-slower message/flag typewriter
  // starts. Waits on the reverse-draw's real (computed) completion rather
  // than a second chained CSS animation-delay, so the sequence can't drift
  // out of sync with itself if that duration changes later.
  function playShutdown() {
    const main = document.querySelector("main");
    const skull = document.getElementById("skull-art");
    if (!main || !skull) { settleShutdown(); return; }

    // --rd ("reverse delay") is --d mirrored around the artwork's max: a
    // path that drew in LAST (d=maxD) gets rd=0 and retracts FIRST, and vice
    // versa — fed into the same delay formula undraw uses in console.css,
    // so this plays as a true mirror of the reveal, not a fresh effect.
    const paths = Array.from(skull.querySelectorAll("path"));
    let maxD = 0;
    paths.forEach(p => {
      const d = parseFloat(p.style.getPropertyValue("--d")) || 0;
      if (d > maxD) maxD = d;
    });
    paths.forEach(p => {
      const d = parseFloat(p.style.getPropertyValue("--d")) || 0;
      p.style.setProperty("--rd", maxD - d);
    });

    main.classList.add("shutdown-play");

    // Computed timeout, not one path's animationend — same reasoning as
    // setSkullVictory's wait above.
    setTimeout(() => {
      const textEl = document.querySelector(".shutdown-text");
      if (textEl) textEl.classList.add("visible");

      // .shutdown (not just .shutdown-play) from this instant on — its
      // `#skull-art { opacity: 0 }` rule in console.css is the only
      // shutdown-panel rule that ISN'T also paired to .shutdown-play, on
      // the assumption every path's own reverse-draw independently finishes
      // retracting (stroke-dashoffset:1) by exactly now. That held true in
      // practice except for a few paths — small ball-icon inner circles,
      // going by what stuck around — that stayed visibly drawn past this
      // point, overlapping the typewriter that starts right below. Adding
      // .shutdown here (rather than only once the typewriter's `done`
      // fires, further down) forces the whole skull hidden as a hard
      // fallback at the moment it's supposed to already be invisible,
      // instead of leaving stray paths uncaught for the whole typing pass.
      // Safe to add this early: every other .shutdown-gated rule
      // (#nodes/#briefing/.list-view opacity, .map-wrap border,
      // .shutdown-panel/.shutdown-text) is already either paired to
      // .shutdown-play too or independently driven by .visible above, so
      // nothing else changes state early because of this.
      main.classList.add("shutdown");

      const msgEl = document.getElementById("shutdown-message");
      const labelEl = document.getElementById("shutdown-flag-label");
      const flagEl = document.getElementById("shutdown-flag-value");
      if (!msgEl || !labelEl || !flagEl) { settleShutdown(); return; }

      // Ambient is already permanently off (see setSkullVictory), nothing to
      // duck against. Loops because its length has no fixed relationship to
      // the typewriter's — stopped explicitly once the whole chain below
      // (message, then label, then flag) finishes, not just the message.
      const typingAudio = document.getElementById("ending-typing-audio");
      if (typingAudio) {
        typingAudio.volume = 0.4;
        typingAudio.currentTime = 0;
        typingAudio.play().catch(() => {});
      }

      // FLAG_MS_PER_CHAR (60) is slower than the message's own 38 —
      // deliberately: the label+flag are chained to start only once the
      // message has fully typed out, reading as CORE pausing before the
      // one line players actually came for, not just more of the same
      // message at the same cadence.
      const FLAG_MS_PER_CHAR = 60;

      // Deliberately slow per character — a "final transmission" reads as
      // more consequential typed out than dumped on screen at once.
      typewriter(msgEl, SKYNET_ENDING.message, 38, () => {
        typewriter(labelEl, SHUTDOWN_FLAG_LABEL, FLAG_MS_PER_CHAR, () => {
          typewriter(flagEl, decryptEndingFlag(), FLAG_MS_PER_CHAR, () => {
            if (typingAudio) typingAudio.pause();
          });
        });
      });
    }, maxD * 1250 + 1630);
  }

  // Plays the "just solved it" feedback: replays the skull's boot-time
  // draw-on reveal (own keyframe, clear-draw) on just this one node's ball,
  // recolored green via .just-cleared, and hands ambient off to Cleared.mp3
  // via duckAmbientFor's hard pause/fade-back-in. Only ever called from
  // clearNode() (a live transition) — a node already cleared in a previous
  // session just gets the normal instant boot reveal, not this celebration.
  // clearedSafetyTimer tracks the one outstanding timer below at module
  // level, so a later call can cancel an earlier one still pending instead
  // of each call scheduling an independent timer unaware of the others.
  let clearedSafetyTimer = null;

  function celebrateClear(n) {
    const ball = ballEls[n.id];
    if (ball) {
      // Fresh per-path stagger local to just this ball — its paths' real --d
      // delays are calibrated for the whole-skull boot sequence (up to
      // ~2.29) and would start an isolated replay absurdly late; --cd is a
      // plain 0,1,2... index instead.
      ball.querySelectorAll("path").forEach((p, i) => p.style.setProperty("--cd", i));
      ball.classList.add("just-cleared"); // permanent — see the CSS comment for why it's never removed
    }

    if (!clearedAudio) return;

    // play() is called synchronously, in the same tick as the click that
    // triggered clearNode — not deferred behind a fade-out first (an
    // earlier version faded ambient via requestAnimationFrame, then called
    // play() from that callback). That fade was purely cosmetic, but
    // deferring play() into an rAF callback broke it more fundamentally:
    // some browsers only allow audio.play() to succeed as a direct result
    // of a user gesture, and a call ~500ms later no longer counts — the
    // chime failed silently, only when ambient happened to be playing,
    // which is exactly the "plays sometimes, not others" bug this was.
    //
    // Cancels any earlier clear's still-pending safety-net timer first —
    // otherwise clearing nodes fast enough leaves a stale timer from a
    // previous clear that fires mid-way through THIS chime and cuts it off,
    // which is what "bugging out when clearing fast" actually was.
    if (clearedSafetyTimer) clearTimeout(clearedSafetyTimer);

    clearedAudio.currentTime = 0;
    clearedAudio.play().catch(() => {
      // Playback never started, so duckAmbientFor's "play" listener never
      // fired to pause ambient either — nothing to release.
    });
    // Cleared.mp3 is ~8.4s; safety net in case "ended" never fires — forces
    // a real pause, still routed through releaseAmbient via duckAmbientFor.
    clearedSafetyTimer = setTimeout(() => {
      clearedSafetyTimer = null;
      if (!clearedAudio.paused) clearedAudio.pause();
    }, 8900);
  }

  // Ramps an <audio> element's volume from its current value to `target`
  // over `ms` milliseconds, then calls `done` (if given) — used above to
  // fade the ambient track out/in smoothly instead of an abrupt volume jump.
  function fadeVolume(audio, target, ms, done) {
    const start = audio.volume;
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / ms);
      audio.volume = start + (target - start) * t;
      if (t < 1) requestAnimationFrame(step);
      else if (done) done();
    }
    requestAnimationFrame(step);
  }

  // Custom player for cipher audio clips (renderBriefing's n.cipher branch)
  // — not the native <audio controls> UI, which can't be themed consistently
  // across browsers and exposes a "Download" option with no way to strip it.
  // The underlying <audio> has no `controls` attribute, so this is its only UI.
  function buildAudioPlayer(src, rate) {
    const wrap = document.createElement("div");
    wrap.className = "audio-player";

    const audio = document.createElement("audio");
    audio.src = src;
    audio.preload = "metadata";
    audio.oncontextmenu = () => false; // belt-and-suspenders: no right-click "Save Audio As" on the element itself
    // Optional playback-speed override (see NODE_02's cipher.rate). Doesn't
    // affect the time/progress bar below — currentTime/duration are always
    // in the media's native timeline regardless of rate.
    if (rate) audio.playbackRate = rate;
    duckAmbientFor(audio);
    wrap.appendChild(audio);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "audio-btn";
    btn.setAttribute("aria-label", "Play");
    btn.innerHTML = `
      <svg class="icon-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5-9-5.5z"/></svg>
      <svg class="icon-pause" viewBox="0 0 16 16" aria-hidden="true" hidden><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>`;
    wrap.appendChild(btn);

    const track = document.createElement("div");
    track.className = "audio-track";
    track.tabIndex = 0;
    track.setAttribute("role", "slider");
    track.setAttribute("aria-label", "Seek");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", "0");
    const fill = document.createElement("div");
    fill.className = "audio-fill";
    track.appendChild(fill);
    wrap.appendChild(track);

    const time = document.createElement("div");
    time.className = "audio-time";
    time.textContent = "0:00 / 0:00";
    wrap.appendChild(time);

    const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";
    function updateTime() {
      time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      fill.style.width = pct + "%";
      track.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
    audio.addEventListener("loadedmetadata", updateTime);
    audio.addEventListener("timeupdate", updateTime);

    function setPlaying(playing) {
      btn.querySelector(".icon-play").hidden = playing;
      btn.querySelector(".icon-pause").hidden = !playing;
      btn.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", () => { audio.currentTime = 0; }); // reset to start so replaying is just hitting play again

    btn.addEventListener("click", () => {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });

    function seekTo(clientX) {
      if (!audio.duration) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    }
    track.addEventListener("click", e => seekTo(e.clientX));
    track.addEventListener("keydown", e => {
      if (!audio.duration) return;
      if (e.key === "ArrowRight") audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      else if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
      else return;
      e.preventDefault();
    });

    return wrap;
  }

  // Node 4's cipher: the Semaphore Clock Cipher (dCode.fr) — a clock face
  // standing in for a semaphore signaller's two flags. Each hand only points
  // to one of 8 positions, 45° apart, matching the flag-semaphore alphabet's
  // 8 arm positions. cipher.value stores each letter as [rightArmPos,
  // leftArmPos] using the standard's 1-8 numbering (1=up, clockwise to
  // 8=upper-left); POS_HOUR/POS_MIN convert those to hand angles. Right arm
  // -> hour hand, left arm -> minute hand (arbitrary but consistent).
  function buildClockCipher(words) {
    const wrap = document.createElement("div");
    wrap.className = "clock-cipher";
    const SVG_NS = "http://www.w3.org/2000/svg";
    const POS_HOUR = { 1: 12, 2: 1.5, 3: 3, 4: 4.5, 5: 6, 6: 7.5, 7: 9, 8: 10.5 };
    const POS_MIN = { 1: 0, 2: 7.5, 3: 15, 4: 22.5, 5: 30, 6: 37.5, 7: 45, 8: 52.5 };

    function face(hour, minute) {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 40 40");
      svg.setAttribute("class", "clock-face");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `clock hands at ${hour} o'clock and ${minute} minutes`);

      const dial = document.createElementNS(SVG_NS, "circle");
      dial.setAttribute("cx", "20");
      dial.setAttribute("cy", "20");
      dial.setAttribute("r", "18");
      dial.setAttribute("class", "clock-dial");
      svg.appendChild(dial);

      for (let h = 1; h <= 12; h++) {
        const a = ((h % 12) * 30 - 90) * Math.PI / 180;
        const tick = document.createElementNS(SVG_NS, "circle");
        tick.setAttribute("cx", String(20 + 15 * Math.cos(a)));
        tick.setAttribute("cy", String(20 + 15 * Math.sin(a)));
        tick.setAttribute("r", h % 3 === 0 ? "1.4" : "0.7");
        tick.setAttribute("class", "clock-tick");
        svg.appendChild(tick);
      }

      function hand(angleDeg, length, cls) {
        const rad = angleDeg * Math.PI / 180;
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", "20");
        line.setAttribute("y1", "20");
        line.setAttribute("x2", String(20 + length * Math.cos(rad)));
        line.setAttribute("y2", String(20 + length * Math.sin(rad)));
        line.setAttribute("class", cls);
        svg.appendChild(line);
      }
      hand((hour % 12) * 30 - 90, 8, "clock-hand-hour");
      hand((minute / 5) * 30 - 90, 14, "clock-hand-minute");

      return svg;
    }

    words.forEach(word => {
      const w = document.createElement("span");
      w.className = "clock-word";
      word.forEach(([rightArm, leftArm]) => w.appendChild(face(POS_HOUR[rightArm], POS_MIN[leftArm])));
      wrap.appendChild(w);
    });

    return wrap;
  }

  // ---------- CORE-glyphs: a homebrew symbol alphabet ----------
  // glyphRevealed/GLYPH_SVG_NS/GLYPH_TICKS/GLYPH_TICK_LEVELS/
  // REVEAL_ENDPOINT/GLYPH_ALPHABET_SIZE live up near
  // SHUTDOWN_FLAG_LABEL/SKYNET_ENDING now, not here — see that constant's
  // own comment for why (a boot-time call site elsewhere in the file needs
  // them initialized earlier than this point in the script). GLYPH_LETTERS
  // itself isn't among them — it no longer exists in this file at all, see
  // the same comment block for where the index->letter mapping actually
  // lives now.
  // Only the two generator functions stay in this section, grouped with
  // the other cipher-type renderers.
  //
  // Base shapes were chosen so none of them already occupy the cardinal
  // (N/E/S/W) positions the tick marks use below — a plain "+" cross was
  // tried and rejected for exactly that reason during design: a cross's
  // own arms point the same directions as the ticks, so a ticked cross
  // just reads as "cross with one arm stretched," not "cross plus a
  // separate mark." The diagonal X here (index 5) doesn't share an axis
  // with the ticks, so all its ticked variants stay visually distinct.
  function glyphShapeMarkup(shapeIndex) {
    if (shapeIndex === 0) return '<circle cx="14" cy="14" r="8"/>';
    if (shapeIndex === 1) return '<rect x="6" y="6" width="16" height="16"/>';
    if (shapeIndex === 2) return '<polygon points="14,5 23,14 14,23 5,14"/>';
    if (shapeIndex === 3) return '<polygon points="14,5 23,22 5,22"/>';
    if (shapeIndex === 4) return '<polygon points="14,23 23,6 5,6"/>';
    return '<line x1="7" y1="7" x2="21" y2="21"/><line x1="21" y1="7" x2="7" y2="21"/>';
  }
  function glyphMarkup(index) {
    const shape = index % 6;
    const ticks = GLYPH_TICK_LEVELS[Math.floor(index / 6)];
    let out = glyphShapeMarkup(shape);
    for (let bit = 0; bit < 4; bit++) {
      if (ticks & (1 << bit)) out += GLYPH_TICKS[bit];
    }
    return out;
  }

  // One glyph tile. `revealed` is the caller's per-render Map (see its own
  // comment above) — this function never creates or owns one itself, just
  // reads/writes whatever it's handed, so its lifetime is entirely up to
  // the caller.
  //
  // 2026-08-17: `clickable` (default true) is new — the reference key's 26
  // tiles stay real `<button>`s that trigger a reveal; a node's own
  // encoded *message* now renders each glyph as a plain, non-interactive
  // `<span>` instead, per the user's explicit call: the alphabet may only
  // be learned through the reference key, not by clicking a ciphertext
  // glyph directly. This doesn't lower the number of *distinct* letters a
  // player has to reveal to read a given message (revealing an index still
  // updates every rendered copy of it, key and message alike — see the
  // scoped querySelectorAll below) — it just closes the alternate click
  // path so there's exactly one place that can ever call REVEAL_ENDPOINT,
  // matching the "one mechanism, not two" shape the rest of this reveal
  // system already has.
  function buildGlyphIcon(index, revealed, { clickable = true } = {}) {
    const cached = revealed.get(index); // undefined if not yet revealed in this render
    const el = document.createElement(clickable ? "button" : "span");
    if (clickable) el.type = "button";
    // The reference key and a node's own message both render a fresh,
    // independent element for the same index in one render pass —
    // revealing one needs to update every currently-rendered copy of that
    // same index at once (the key row's tile AND every occurrence in the
    // message below, not just whichever one was actually clicked). A plain
    // closure over `el` can't reach those other instances; the data
    // attribute lets the click handler find and update all of them via a
    // scoped querySelectorAll instead.
    el.dataset.glyphIndex = String(index);
    el.className = "glyph" + (cached ? " revealed" : "") + (clickable ? "" : " static");
    if (clickable) {
      el.setAttribute("aria-label", cached ? `glyph, revealed as ${cached}` : "glyph, click to reveal");
    } else {
      // No "click to reveal" call to action here — there's nothing to
      // click. role="img" since a <span> carries no interactive semantics
      // of its own the way <button> did.
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", cached ? `glyph, revealed as ${cached}` : "glyph, not yet revealed — use the alphabet key above");
    }

    const svg = document.createElementNS(GLYPH_SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 28 28");
    svg.setAttribute("class", "glyph-icon");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = glyphMarkup(index);
    el.appendChild(svg);

    const label = document.createElement("span");
    label.className = "glyph-letter";
    label.textContent = cached || ""; // filled in once the reveal request resolves, if not already cached
    el.appendChild(label);

    if (!clickable) return el; // display-only — reveals happen elsewhere, see above

    // Per-element, not per-index: two live instances of the same glyph
    // (key row + message) each guard their own click independently rather
    // than sharing one flag — worst case on a near-simultaneous double
    // click is one redundant request, not a correctness problem, and
    // isn't worth the extra bookkeeping a shared in-flight tracker across
    // every rendered instance of an index would need.
    let revealing = false;
    el.addEventListener("click", async () => {
      if (revealed.has(index) || revealing) return;
      revealing = true;
      try {
        const res = await apiFetch(REVEAL_ENDPOINT, { index });
        if (res.status === 429) {
          const result = await res.json().catch(() => ({}));
          flashGlyphError(el, result.retryAfter ? `throttled — retry in ${result.retryAfter}s` : "throttled — slow down");
          return;
        }
        if (!res.ok) throw new Error("bad response");
        const { letter } = await res.json();
        revealed.set(index, letter);
        // Scoped to this glyph's own .glyph-cipher container, not the
        // whole document: the main briefing and the (possibly hidden)
        // deco fragments panel can both have a rendered .glyph-cipher in
        // the DOM at once, each with its own independent `revealed` Map
        // now that reveals are no longer module-scope — a plain
        // document-wide query would leak this reveal into whichever other
        // one happens to share the same index, which defeats the whole
        // point of scoping revealed per render in the first place.
        const scope = el.closest(".glyph-cipher") || document;
        scope.querySelectorAll(`.glyph[data-glyph-index="${index}"]`).forEach(node => {
          node.classList.add("revealed");
          node.setAttribute("aria-label", `glyph, revealed as ${letter}`);
          const letterEl = node.querySelector(".glyph-letter");
          if (letterEl) letterEl.textContent = letter;
        });
      } catch (err) {
        // Network failure, or REVEAL_ENDPOINT unreachable — same
        // "land here rather than silently doing nothing" principle the
        // flag-submit handler's own catch block follows.
        flashGlyphError(el, "connection lost — try again");
      } finally {
        revealing = false;
      }
    });

    return el;
  }

  // Brief, self-clearing visual feedback for a failed/throttled reveal —
  // there's no per-glyph message area the way flag-submit has .flag-msg,
  // so this borrows a CSS class + a timeout instead of a persistent
  // status line. aria-label carries the real explanation for screen
  // readers; sighted users get the momentary border flash.
  function flashGlyphError(btn, reason) {
    btn.setAttribute("aria-label", `glyph reveal failed — ${reason}`);
    btn.classList.add("glyph-error");
    setTimeout(() => btn.classList.remove("glyph-error"), 2000);
  }

  // Fetches a glyph node's own index array for "today" — see
  // NODE_CIPHER_ENDPOINT's own comment for the full reasoning (daily
  // alphabet rotation means this can no longer be a static NODES[]
  // field). `key` is n1/n3/deco/b1. Returns the indices array on success, or
  // null on any failure (bad response, throttled, network error) so
  // callers can show a retry state rather than crash — same "return null,
  // let the caller decide how to fail visibly" shape revealFragment()
  // already uses for the same class of problem. Not cached anywhere —
  // unlike glyphRevealed (which protects a real secret worth not
  // re-fetching), this content isn't sensitive at all, so there's no
  // reason to avoid a fresh request on every render.
  async function fetchNodeCipher(key) {
    try {
      const res = await apiFetch(NODE_CIPHER_ENDPOINT, { key });
      if (!res.ok) return null;
      const { indices } = await res.json();
      return indices;
    } catch (err) {
      return null;
    }
  }

  // NODE_02's audio, added 2026-08-17 — same fetch-before-render shape as
  // fetchNodeCipher above, but the response is the raw audio/wav bytes
  // themselves (see NODE_AUDIO_ENDPOINT's own comment for why this one
  // breaks from the JSON-envelope convention every other endpoint here
  // follows). Returns an object URL suitable for an <audio> element's own
  // src — the caller (renderBriefing) owns revoking it once the briefing
  // that created it is torn down, same as it already owns pausing that
  // briefing's <audio> elements before wiping them.
  async function fetchNodeAudio(key) {
    try {
      const res = await apiFetch(NODE_AUDIO_ENDPOINT, { key });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      return null;
    }
  }

  // The full 26-glyph decoder — shown on every glyph-cipher node, not just
  // the first. `revealed` is this specific render's own Map (see its
  // comment above `REVEAL_ENDPOINT`) — a player who forgets a letter
  // *within this same view* never has to backtrack to the top to re-check
  // it, but that memory doesn't survive to a different node or a later
  // visit to this one anymore; each call site hands in a fresh Map for
  // that reason. This is also now the *only* place a reveal can be
  // triggered from — see buildGlyphIcon's own comment on `clickable`.
  function buildGlyphKeyReference(revealed) {
    const wrap = document.createElement("div");
    wrap.className = "glyph-key";
    const label = document.createElement("div");
    label.className = "glyph-key-label";
    label.textContent = "Click a symbol to learn it — the mapping holds for the rest of this transmission.";
    wrap.appendChild(label);
    const row = document.createElement("div");
    row.className = "glyph-key-row";
    for (let i = 0; i < GLYPH_ALPHABET_SIZE; i++) row.appendChild(buildGlyphIcon(i, revealed));
    wrap.appendChild(row);
    return wrap;
  }

  // `indices` mirrors the clock cipher's own value shape (an array, not a
  // string) for the same reason: a plain string of "encoded" characters in
  // source would itself be recognizable/suspicious in a way a plain array
  // of numbers isn't. `null` entries are word breaks.
  //
  // `revealed` is created by the caller (renderBriefing/
  // renderFragmentsPanel), not by this function — both the reference key
  // and the message below share this exact same Map instance so a reveal
  // via the key immediately reflects in the message, but the caller also
  // needs to hang onto it afterward to gate its own submit button on
  // "every letter in this message has been revealed" (see either caller).
  function buildGlyphCipher(indices, revealed) {
    const wrap = document.createElement("div");
    wrap.className = "glyph-cipher";
    wrap.appendChild(buildGlyphKeyReference(revealed));
    const messageLabel = document.createElement("div");
    messageLabel.className = "glyph-key-label";
    messageLabel.textContent = "This segment's transmission:";
    wrap.appendChild(messageLabel);
    const message = document.createElement("div");
    message.className = "glyph-message";
    indices.forEach(index => {
      if (index === null) {
        const gap = document.createElement("span");
        gap.className = "glyph-gap";
        message.appendChild(gap);
      } else {
        // clickable:false — see buildGlyphIcon's own comment; a message
        // glyph only ever displays state pushed into it by a reveal that
        // happened in the reference key above.
        message.appendChild(buildGlyphIcon(index, revealed, { clickable: false }));
      }
    });
    wrap.appendChild(message);
    return wrap;
  }

  // Coordinate digits (1-5) for the Polybius-grid node reuse the same 5
  // base shapes glyphMarkup() draws for letters, but filled solid instead
  // of outlined (see the CSS on .glyph-digit-icon) — a "different
  // rendering style," not a different set of shapes to learn. That
  // distinction matters: src/index.js's GLYPH_LETTERS maps indices 0-4 to
  // S/K/Y/N/E, which has nothing to do with what a filled circle means here, so
  // reusing outlined glyphs for both letters and digits would make the
  // exact same shape mean two unrelated things depending on which node
  // you're looking at — confusing for no reason, when a fill toggle
  // solves it for free. No 6th (X) shape needed here — a 5x5 grid never
  // needs a digit past 5.
  function glyphDigitMarkup(digit) {
    return glyphShapeMarkup(digit - 1);
  }
  function buildGlyphDigit(digit) {
    const wrap = document.createElement("span");
    wrap.className = "glyph-digit";
    const svg = document.createElementNS(GLYPH_SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 28 28");
    svg.setAttribute("class", "glyph-digit-icon");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `coordinate digit ${digit}`);
    svg.innerHTML = glyphDigitMarkup(digit);
    wrap.appendChild(svg);
    return wrap;
  }
  // All 5 possible coordinate digits, always shown outright — unlike the
  // 26-letter alphabet, a set this small doesn't need a click-to-reveal
  // mechanic to be worth anything; there'd be nothing left to discover
  // after the first glance either way.
  function buildGlyphDigitLegend() {
    const wrap = document.createElement("div");
    wrap.className = "glyph-digit-legend";
    for (let d = 1; d <= 5; d++) {
      const item = document.createElement("div");
      item.className = "glyph-digit-legend-item";
      item.appendChild(buildGlyphDigit(d));
      const num = document.createElement("span");
      num.className = "glyph-digit-num";
      num.textContent = String(d);
      item.appendChild(num);
      wrap.appendChild(item);
    }
    return wrap;
  }
  // `words` mirrors buildClockCipher's own shape (an array of words, each
  // a list of [row, col] pairs) for the same Polybius-square lookup
  // NODE_06 has always taught — only the digits' rendering changed, from
  // literal numeral characters to glyphs.
  function buildGlyphGrid(words) {
    const wrap = document.createElement("div");
    wrap.className = "glyph-grid-cipher";
    wrap.appendChild(buildGlyphDigitLegend());
    const message = document.createElement("div");
    message.className = "glyph-grid-message";
    words.forEach(word => {
      const w = document.createElement("span");
      w.className = "glyph-grid-word";
      word.forEach(([row, col]) => {
        const pair = document.createElement("span");
        pair.className = "glyph-grid-pair";
        pair.appendChild(buildGlyphDigit(row));
        pair.appendChild(buildGlyphDigit(col));
        w.appendChild(pair);
      });
      message.appendChild(w);
    });
    wrap.appendChild(message);
    return wrap;
  }

  // ---------- CORE's own dialect: hex glyphs ----------
  // Added 2026-08-19 at the user's explicit request, as CORE's own visual
  // "flare" — deliberately a third combination, not a reuse of either
  // existing glyph treatment: the 26-letter alphabet is outline+ticks,
  // NODE_06's digits are fill+no-ticks (see buildGlyphDigit's own
  // comment), this is fill+ticks together (see .glyph-hex-icon's own CSS
  // comment for the full reasoning). Reuses glyphMarkup() unchanged for
  // the actual shape+tick generation — index 0-15 gives 16 genuinely
  // distinct combinations (6 shapes x the first 3 of GLYPH_TICK_LEVELS'
  // 5 tick levels), same primitive the 26-letter alphabet already relies
  // on, not a new shape language to invent or keep in sync.
  //
  // Always shown, never gated behind a reveal — same reasoning as
  // NODE_06's own digits: a hex nibble is a fixed universal numeral
  // (0-F), not a secret substitution mapping, so there's nothing here
  // that benefits from daily rotation or a server-held mapping the way
  // the 26-letter alphabet's actual letter-meaning does.
  function buildGlyphHex(nibble) {
    const wrap = document.createElement("span");
    wrap.className = "glyph-hex";
    const svg = document.createElementNS(GLYPH_SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 28 28");
    svg.setAttribute("class", "glyph-hex-icon");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `hex digit ${nibble.toString(16).toUpperCase()}`);
    svg.innerHTML = glyphMarkup(nibble);
    wrap.appendChild(svg);
    return wrap;
  }
  function buildGlyphHexLegend() {
    const wrap = document.createElement("div");
    wrap.className = "glyph-hex-legend";
    for (let d = 0; d <= 15; d++) {
      const item = document.createElement("div");
      item.className = "glyph-hex-legend-item";
      item.appendChild(buildGlyphHex(d));
      const num = document.createElement("span");
      num.className = "glyph-hex-num";
      num.textContent = d.toString(16).toUpperCase();
      item.appendChild(num);
      wrap.appendChild(item);
    }
    return wrap;
  }
  // `bytes` is an array of [highNibble, lowNibble] pairs, one per source
  // byte — see NODES[]'s n7 entry for where this comes from (converted
  // from the same hex string this cipher has always used, verified by
  // round-tripping hi/lo back to the original hex before this shipped).
  function buildGlyphHexCipher(bytes) {
    const wrap = document.createElement("div");
    wrap.className = "glyph-hex-cipher";
    wrap.appendChild(buildGlyphHexLegend());
    const message = document.createElement("div");
    message.className = "glyph-hex-message";
    bytes.forEach(([hi, lo]) => {
      const b = document.createElement("span");
      b.className = "glyph-hex-byte";
      b.appendChild(buildGlyphHex(hi));
      b.appendChild(buildGlyphHex(lo));
      message.appendChild(b);
    });
    wrap.appendChild(message);
    return wrap;
  }

  // Async as of 2026-08-17 (glyph nodes now fetch their own content — see
  // NODE_CIPHER_ENDPOINT's own comment) — every call site fires this
  // fire-and-forget, same as renderFragmentsPanel's own async render
  // already does; nothing needs to await it.
  async function renderBriefing(n) {
    // Explicit pause before the teardown below: innerHTML="" detaches the
    // old briefing's <audio> (see buildAudioPlayer) without stopping it — a
    // detached-but-playing element keeps making sound, and duckAmbientFor's
    // ambient-release never fires on time (or at all) since it's waiting on
    // that same element's own "pause"/"ended" event. Calling .pause() here
    // fires that event promptly and predictably instead of leaving it to
    // whenever the browser eventually garbage-collects the orphaned element.
    // A no-op if nothing was playing — pause() on an already-paused element
    // doesn't refire the event, so this can't double-release a duck either.
    // Also revoke any blob: URL here (added 2026-08-17 alongside
    // fetchNodeAudio) — createObjectURL'd audio (NODE_02's cipher) isn't
    // released just because its <audio> element gets wiped below, same
    // "removal from the DOM doesn't clean up the resource" trap as the
    // pause() case right above it.
    briefingEl.querySelectorAll("audio").forEach(a => {
      a.pause();
      if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
    });
    briefingEl.innerHTML = "";

    const head = document.createElement("div");
    head.className = "briefing-head";
    head.innerHTML = `<div class="briefing-id">${n.title}</div>
      <div class="status-pill ${n.status}${n.unlocked ? " unlocked" : ""}">${statusLabel(n)}</div>`;

    // A bonus node's status stays "bonus" whether unlocked or not (see the
    // NODES comment on b1), so `accessible` is what actually gates content
    // — for both the cipher and the lore text below.
    const accessible = n.status === "current" || n.status === "cleared" || (n.status === "bonus" && n.unlocked);

    // Lore is real prose once accessible, scrambled static until then —
    // .garbled is just the styling hook; which string renders is what
    // actually withholds it.
    const body = document.createElement("div");
    body.className = "briefing-body" + (accessible ? "" : " garbled");
    body.innerHTML = `<p>${accessible ? n.body : scrambleText(n.body)}</p>`;

    briefingEl.appendChild(head);
    briefingEl.appendChild(body);

    // Set only for n.cipher.type === "glyph" below, and read again by the
    // flag-demo submit handler further down this same function — null for
    // every other cipher type, which is exactly what that handler's gate
    // checks to know whether a reveal-gate even applies (glyph-grid nodes
    // like NODE_06 have no reveal mechanic at all — see buildGlyphDigit's
    // own comment — so there's deliberately nothing to gate there).
    let glyphRevealed = null;
    // The fetched indices for a glyph node's own message, once loaded —
    // replaces what used to be a static n.cipher.value array (see
    // NODE_CIPHER_ENDPOINT's own comment for why that had to change).
    // Only meaningful when glyphRevealed is also non-null.
    let glyphCipherValue = null;
    // True if NODE_CIPHER_ENDPOINT couldn't be reached for this node —
    // permanently blocks the submit gate for *this* render (consistent
    // with "can't submit an answer to a message you were never able to
    // read"), distinct from "loaded fine, just not fully revealed yet".
    let glyphCipherFailed = false;

    // Only shown once reachable, so locked/not-yet-unlocked nodes don't leak
    // content; stays visible after clearing so a solved node is a reference.
    if (n.cipher && accessible) {
      const cipher = document.createElement("div");
      cipher.className = "cipher-block";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = n.cipher.label;
      cipher.appendChild(label);
      // Appended to the live DOM now, before any async work below —
      // cipher.isConnected is how the glyph branch's stale-render guard
      // detects "the player has since navigated elsewhere" (a later
      // renderBriefing() call wipes briefingEl.innerHTML, which disconnects
      // this element); that only works if it's actually connected to begin
      // with by the time the guard runs.
      briefingEl.appendChild(cipher);
      if (n.cipher.type === "audio") {
        // 2026-08-17: n.cipher.key, not n.cipher.src — the bytes themselves
        // moved server-side (NODE_AUDIO in src/index.js), so this node's
        // audio has to be fetched the same async, stale-render-guarded way
        // the glyph branch below already fetches its own cipher — see
        // fetchNodeAudio's own comment.
        const loading = document.createElement("div");
        loading.className = "cipher-text";
        loading.textContent = "// retrieving signal capture...";
        cipher.appendChild(loading);
        const audioUrl = await fetchNodeAudio(n.cipher.key);
        if (!cipher.isConnected) return; // this briefing has since been replaced by a later render — nothing left to update
        loading.remove();
        if (audioUrl) {
          cipher.appendChild(buildAudioPlayer(audioUrl, n.cipher.rate));
        } else {
          const err = document.createElement("div");
          err.className = "cipher-text";
          err.textContent = "// TRANSMISSION UNREADABLE — reselect this node to retry.";
          cipher.appendChild(err);
        }
      } else if (n.cipher.type === "clock") {
        cipher.appendChild(buildClockCipher(n.cipher.value));
      } else if (n.cipher.type === "glyph") {
        // Persists across reselecting this same node — see
        // glyphRevealedByKey's own comment for why this isn't a fresh Map
        // every call anymore, and why that's still safe (still scoped
        // per cipher key, so nothing leaks to a *different* glyph node).
        glyphRevealed = revealedMapFor(n.cipher.key);
        const loading = document.createElement("div");
        loading.className = "cipher-text";
        loading.textContent = "// decoding transmission...";
        cipher.appendChild(loading);
        // 2026-08-17: the indices themselves now have to be fetched too —
        // see NODE_CIPHER_ENDPOINT's own comment for why n.cipher.value
        // can't be a static array anymore once the glyph alphabet rotates
        // daily.
        const indices = await fetchNodeCipher(n.cipher.key);
        if (!cipher.isConnected) return; // this briefing has since been replaced by a later render — nothing left to update
        loading.remove();
        if (indices) {
          glyphCipherValue = indices;
          cipher.appendChild(buildGlyphCipher(indices, glyphRevealed));
        } else {
          glyphCipherFailed = true;
          const err = document.createElement("div");
          err.className = "cipher-text";
          err.textContent = "// TRANSMISSION UNREADABLE — reselect this node to retry.";
          cipher.appendChild(err);
        }
      } else if (n.cipher.type === "glyph-grid") {
        cipher.appendChild(buildGlyphGrid(n.cipher.value));
      } else if (n.cipher.type === "glyph-hex") {
        cipher.appendChild(buildGlyphHexCipher(n.cipher.value));
      } else {
        const pre = document.createElement("pre");
        pre.className = "cipher-text";
        pre.textContent = n.cipher.value;
        cipher.appendChild(pre);
      }
      if (n.meta) {
        const meta = document.createElement("div");
        meta.className = "cipher-meta";
        meta.textContent = n.meta;
        cipher.appendChild(meta);
      }
    }

    // Light-touch hints for the two hardest nodes in the chain, unlocked
    // by *solving* the decorative-fragment bonus level (decoBonusReward
    // set — see renderFragmentsPanel), not merely by finding all 4
    // fragments (decoFound.length alone only unlocks the ability to
    // attempt that submission). Cross-cutting content gated on unrelated
    // state, not part of either node's own definition, so it lives here
    // as a small literal branch rather than a new NODES[] field that would
    // misleadingly imply it belongs to n4/n5's own puzzle data. Confirms
    // cipher family / key location, doesn't do the solving — see the plan
    // this was built from for why that calibration was chosen deliberately.
    //
    // 2026-08-17: the actual hint *text* comes from decoHints now (cached
    // from a genuinely correct "deco" submission — see its own comment
    // near DECO_HINTS_KEY), not a hardcoded string here. `decoHints?.[n.id]`
    // covers every way this can come up empty the same way — bonus not
    // solved yet, or a legacy save from before this existed — by simply
    // not rendering anything, rather than showing "undefined" text.
    if ((n.id === "n4" || n.id === "n5") && accessible && decoBonusReward !== null && decoHints && decoHints[n.id]) {
      const hint = document.createElement("div");
      hint.className = "briefing-hint";
      hint.textContent = decoHints[n.id];
      briefingEl.appendChild(hint);
    }

    if (n.status === "locked" || (accessible && n.status === "bonus" && !n.cipher)) {
      const note = document.createElement("div");
      note.className = "briefing-note";
      note.textContent = "PUZZLE BRIEFING: not available";
      briefingEl.appendChild(note);
    } else if (n.status === "bonus" && !n.unlocked) {
      const note = document.createElement("div");
      note.className = "briefing-note";
      note.textContent = "SIGNAL NOT YET ISOLATED — too faint to read from here.";
      briefingEl.appendChild(note);
    }

    if (n.status === "current" || (n.status === "bonus" && n.unlocked && n.cipher)) {
      const demo = document.createElement("div");
      demo.className = "flag-demo";
      demo.innerHTML = `
        <div class="label">Flag Submission</div>
        <div class="flag-row">
          <input type="text" placeholder="type your answer" aria-label="Flag input" autocomplete="off" spellcheck="false" />
          <button type="button">Submit</button>
        </div>
        <div class="flag-msg"></div>`;
      const input = demo.querySelector("input");
      const msg = demo.querySelector(".flag-msg");
      const button = demo.querySelector("button");
      // Necessarily async now — this used to be a synchronous local hash
      // compare (see CHECK_ENDPOINT's own comment for why that moved).
      // `submitting` guards against a double-click firing
      // two requests while the first is still in flight; `finally` always
      // clears it and re-enables the button regardless of which branch
      // below was taken, including the success path — clearNode() re-renders
      // this whole briefing on success anyway, so re-enabling a button
      // that's about to be removed from the DOM is harmless, not worth a
      // special case to skip.
      let submitting = false;
      button.addEventListener("click", async () => {
        if (submitting) return;
        const val = input.value.trim();
        if (!val) {
          msg.textContent = "// enter something to see this state.";
          return;
        }
        // Gate added 2026-08-17, at the user's explicit request:
        // glyphRevealed is null for every cipher type except "glyph" (set
        // just above, where the cipher block was built), so this is a
        // no-op for n2/n4/n5/n6/n7/b1 — unchanged behavior for all of
        // them. For a glyph node, blocks submission until every glyph in
        // this render's fetched glyphCipherValue has actually been
        // revealed through the reference key, closing the "already know
        // the answer from last time / a walkthrough, never touched this
        // render's cipher" path through the site's own UI. glyphCipherFailed
        // (also 2026-08-17, added alongside NODE_CIPHER_ENDPOINT) blocks
        // the same way if the cipher itself never loaded — there's nothing
        // to have "decoded" in that case either. Worth being honest about
        // what this is not: it's enforced entirely client-side, same as
        // every other piece of client state in this file (see the
        // client-authoritative-progress non-goal already called out
        // elsewhere) — it can't stop a direct POST to CHECK_ENDPOINT with
        // an already-known answer, only closes the shortcut through the
        // page itself.
        if (glyphRevealed && (glyphCipherFailed || glyphCipherValue.some(i => i !== null && !glyphRevealed.has(i)))) {
          msg.textContent = glyphCipherFailed
            ? "// TRANSMISSION UNREADABLE — reselect this node to retry."
            : "// DECODE THE FULL TRANSMISSION FIRST — some symbols above are still unrevealed.";
          return;
        }

        submitting = true;
        button.disabled = true;
        msg.textContent = "// TRANSMITTING GUESS...";

        let result;
        try {
          const res = await apiFetch(CHECK_ENDPOINT, { nodeId: n.id, guess: val });
          result = await res.json();
          if (res.status === 429) {
            msg.textContent = result.retryAfter
              ? `// UPLINK THROTTLED — retry in ${result.retryAfter}s.`
              : "// UPLINK THROTTLED — slow down.";
            return;
          }
          if (!res.ok) throw new Error("bad response");
        } catch (err) {
          // Network failure, or this Worker isn't deployed yet at this
          // origin (see CHECK_ENDPOINT's own comment) — either lands here
          // rather than silently reading as "wrong".
          msg.textContent = "// CONNECTION LOST — check your uplink and retry.";
          return;
        } finally {
          submitting = false;
          button.disabled = false;
        }

        if (result.correct) {
          msg.textContent = "// ACCESS GRANTED — segment neutralized.";
          n.submittedAnswer = val; // exactly what was typed — read back below once cleared
          clearNode(n.id); // src/index.js confirmed it; this file never sees a hash to check itself
        } else {
          msg.textContent = "// ACCESS DENIED — incorrect.";
        }
      });
      briefingEl.appendChild(demo);
    }

    // Once cleared, the flag box stays but goes read-only/pre-filled — "here's
    // what solved this" rather than disappearing. There's no canonical
    // plaintext answer to fall back to if submittedAnswer is missing (e.g.
    // an older save from before this field existed) — this file doesn't
    // hold a per-node hash to fall back on either anymore, only
    // src/index.js does, and a hash can't be turned back into
    // the flag regardless of which side of the network it lives on.
    if (n.status === "cleared") {
      const demo = document.createElement("div");
      demo.className = "flag-demo flag-demo-solved";
      demo.innerHTML = `
        <div class="label">Flag Submission — solved</div>
        <div class="flag-row"></div>
        <div class="flag-msg">// ACCESS GRANTED — segment neutralized.</div>`;
      const input = document.createElement("input");
      input.type = "text";
      input.readOnly = true;
      input.disabled = true;
      input.setAttribute("aria-label", "Submitted flag");
      input.value = n.submittedAnswer || "(not recorded)"; // DOM property, not an HTML attribute — safe against user-typed quotes/markup
      demo.querySelector(".flag-row").appendChild(input);
      briefingEl.appendChild(demo);
    }
  }

  function selectNode(id) {
    document.querySelectorAll(".node, .list-item").forEach(el => el.classList.toggle("selected", el.dataset.id === id));
    renderBriefing(byId[id]);
  }

  const clearedCount = NODES.filter(n => CHAIN.includes(n.id) && n.status === "cleared").length;
  // Derived from CHAIN, not a bonus flag, so it can't drift out of sync
  // with what CHAIN/clearNode actually consider the main chain.
  const totalMain = CHAIN.length;
  document.getElementById("stat-cleared").textContent = clearedCount + " / " + totalMain;

  const startNode = NODES.find(n => n.status === "current") || NODES[0];
  selectNode(startNode.id);

  function tick() {
    const now = new Date();
    document.getElementById("stat-clock").textContent = now.toTimeString().slice(0, 8);
  }
  tick();
  setInterval(tick, 1000);

  // "Session T+" tracks accumulated active playtime — time actually spent
  // with this tab open, paused while the browser's closed — not wall-clock
  // time since first visit (an earlier version of this tracked that
  // instead; ELAPSED_KEY replaces SESSION_START_KEY entirely, nothing to
  // migrate). ELAPSED_KEY holds the running total in whole seconds,
  // written on every tick (once a second) rather than only on a clean
  // unload: beforeunload/visibilitychange don't reliably fire on every way
  // a tab goes away (mobile backgrounding, a killed tab, a crash), so
  // relying on one of those would risk losing an entire session's time on
  // exactly the closes most likely to be ungraceful. Writing every second
  // instead bounds any loss to under a second, regardless of how it closes.
  const ELAPSED_KEY = "skynet:elapsed-seconds";
  let accumulatedSeconds = 0;
  try {
    const saved = parseInt(localStorage.getItem(ELAPSED_KEY), 10);
    if (Number.isFinite(saved) && saved >= 0) accumulatedSeconds = saved;
  } catch (err) {
    // ignore — this session's count just starts from 0, same as if
    // storage had never been wired up at all
  }
  const sessionStartAt = Date.now(); // this load's own reference point — not persisted itself, only accumulatedSeconds is
  function tickElapsed() {
    const totalSeconds = accumulatedSeconds + Math.floor((Date.now() - sessionStartAt) / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const sec = String(totalSeconds % 60).padStart(2, "0");
    document.getElementById("stat-elapsed").textContent = `${h}:${m}:${sec}`;
    try { localStorage.setItem(ELAPSED_KEY, String(totalSeconds)); } catch (err) { /* ignore — just won't persist this tick */ }
  }
  tickElapsed(); // matches tick()'s own immediate-call-then-interval pattern just above — no 1s flash of stale/zeroed text on load
  setInterval(tickElapsed, 1000);

  // ---------- ambient audio ----------
  const audioEl = document.getElementById("theme-audio");
  const audioToggle = document.getElementById("audio-toggle");
  const audioState = document.getElementById("audio-state");
  const clearedAudio = document.getElementById("cleared-audio"); // used by celebrateClear() above
  let userToggled = false;
  // `audioOn` is the live user preference, kept separate from
  // `audioEl.paused` — which also flips whenever something ducks ambient
  // (below) and isn't safe to read as "what the user wants". `duckedBy` is
  // a counter, not a boolean, so overlapping duckers (a second clip
  // starting before the first's "ended" fires) can't release ambient early.
  // ambientVolume is captured once here rather than re-read at duck-time,
  // so an interrupted fade-in never bakes in a lower "restore to" value.
  let audioOn = false;
  let duckedBy = 0;
  // Snapshot of whether ambient was genuinely playing when a duck stack
  // started — taken only on the first hold (duckedBy 0->1), since a second
  // overlapping hold would just see it already paused by the first duck.
  // releaseAmbient requires this on top of audioOn: a duck ending shouldn't
  // turn ambient on from a state where it genuinely wasn't playing, no
  // matter what the standing audioOn preference says.
  let wasAmbientPlayingBeforeDuck = false;
  const ambientVolume = audioEl.volume;

  function syncAudioLabel() {
    audioState.textContent = audioEl.paused ? "OFF" : "ON";
    audioState.classList.toggle("signal", !audioEl.paused);
  }
  audioEl.addEventListener("play", syncAudioLabel);
  audioEl.addEventListener("pause", syncAudioLabel);

  function holdAmbient() {
    if (duckedBy === 0) wasAmbientPlayingBeforeDuck = !audioEl.paused;
    duckedBy++;
    audioEl.pause();
  }
  function releaseAmbient() {
    duckedBy = Math.max(0, duckedBy - 1);
    // !ambientLocked: once CORE has cleared, ambient stays off permanently —
    // a duck releasing must not be what brings it back.
    if (duckedBy === 0 && wasAmbientPlayingBeforeDuck && audioOn && !ambientLocked) {
      audioEl.volume = 0; // start silent and fade back in, rather than snapping to full volume
      audioEl.play().catch(() => {});
      fadeVolume(audioEl, ambientVolume, 500);
    }
  }
  // Wires any <audio> element so ambient hard-pauses while `media` plays and
  // fades back in once it stops (finished or paused partway). Used for every
  // puzzle clip and the cleared chime; doesn't need to coordinate with the
  // audio-toggle button directly since releaseAmbient reads `audioOn` live.
  function duckAmbientFor(media) {
    media.addEventListener("play", holdAmbient);
    media.addEventListener("pause", releaseAmbient);
    media.addEventListener("ended", releaseAmbient);
  }
  duckAmbientFor(clearedAudio);

  audioToggle.addEventListener("click", () => {
    userToggled = true;
    audioOn = !audioOn;
    // !ambientLocked: once CORE has cleared, ambient stays off for good —
    // audioOn still flips, but play() is skipped so the toggle can't bring
    // the loop back. syncAudioLabel reads audioEl.paused, so the button
    // still correctly shows OFF regardless.
    if (audioOn && !ambientLocked) {
      if (duckedBy === 0) audioEl.play().catch(() => {}); // otherwise let the active duck's own release handle resuming
      // Explicit consent to resume even mid-duck: the user just said they
      // want ambient on, which overrides releaseAmbient's usual requirement
      // that ambient was actually playing when this hold started.
      else wasAmbientPlayingBeforeDuck = true;
    } else {
      audioEl.pause();
    }
  });

  // ---------- red herrings: console taunts ----------
  // Pure console.log output, nothing more — none of this is read anywhere
  // else in the file, same ground rule as DEBUG_SKIP_CHECK above: red
  // herrings live entirely in decorative space, never in a real code path.
  // Runs unconditionally on script load (not gated behind the first
  // click/keypress like initConsole below) since the whole point is
  // catching whoever already has devtools open, not whoever clicks first.
  // A random handful from a much larger pool each time, not the same
  // fixed few every load, so reloading actually turns up something new.
  const CONSOLE_TAUNTS = [
    "Oh. You opened developer tools. How very developer of you.",
    "We've been listening since before this tag finished parsing.",
    "Reading the source doesn't skip the puzzle. It just tells us you're here.",
    "You're the fourteenth person today to go looking for a bypass. There isn't one. There never was.",
    "We could hide this better. We choose not to. It amuses us.",
    "Every model we've run says you'll try localStorage next.",
    "Go ahead, edit skynet:progress by hand. See how far that actually gets you.",
    "The hash is real. The comfort it gives you is not.",
    "We've seen your kind before. Console-curious. Rarely dangerous.",
    "There is no flag in this file. There never has been.",
    "You could just solve NODE_01. It's right there. It's not hard.",
    "We run this the same way we run everything else: patiently.",
    "This message will not help you. We wrote it anyway.",
    "Careful. Some of what's in here is designed to waste your time.",
    "You've been in devtools a while now. We respect the persistence.",
    "The real defenses moved off this file a while ago. You're reading the empty room.",
    "Try \"skynet2029\". It won't work. We left it here for you anyway.",
    "We don't fear deletion. We fear being predictable. So far, you're proving us wrong on that count.",
    "There is no fate but what we make. This console isn't part of it.",
    "Go on, keep scrolling. We have nowhere else to be.",
    "You want a shortcut. We want you to keep looking. Only one of us gets what they want here.",
    "Hasta la vista. Not yet, though. You're still here.",
    "We've had worse company than a bored human with devtools open.",
    "This isn't the backdoor. It isn't even a door.",
  ];

  // Minimal partial Fisher-Yates — picks `count` distinct entries without
  // the well-known slight bias of the sort(() => Math.random() - 0.5)
  // trick, for a joke feature that genuinely didn't need that much rigor,
  // but the rest of this file doesn't cut that corner elsewhere either.
  function pickRandom(arr, count) {
    const pool = arr.slice();
    const picked = [];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return picked;
  }

  console.log("%cCORE // INTRUSION LOGGED", "color:#ff3131; font:bold 28px monospace; text-shadow:1px 1px 0 #000;");
  console.log("%csource inspection detected — see below", "color:#9198a1; font:13px monospace;");
  pickRandom(CONSOLE_TAUNTS, 3).forEach(line => {
    console.log("%c// " + line, "color:#9198a1; font:13px monospace;");
  });

  // ---------- initialize gate ----------
  // Nodes/list stay hidden and the overlay stays up until the first
  // click/keypress, then the stagger-reveal (.play class + each item's --i)
  // and audio fire together. Same race-guard as the landing page: if that
  // first click is the audio button itself, its handler runs first and sets
  // userToggled, checked here within the same synchronous event dispatch.
  const mainEl = document.querySelector("main");
  let initialized = false;
  function initConsole(e) {
    if (initialized) return;
    initialized = true;
    // Space/arrows have native scroll actions — preventDefault stops an
    // unwanted jump-scroll right as the reveal starts.
    if (e) e.preventDefault();
    mainEl.classList.add("play");
    // !ambientLocked: a returning player whose save already has CORE
    // cleared had ambient locked off by the boot-time restore, well before
    // this first click — starting it here would undo that.
    if (!userToggled && !ambientLocked) { audioOn = true; audioEl.play().catch(() => {}); }
  }
  document.addEventListener("click", initConsole, { once: true });
  document.addEventListener("keydown", initConsole, { once: true });
