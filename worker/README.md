# Answer-checking Worker — deploy walkthrough

What this is and why it exists: see the comment block at the top of
`src/index.js`. Short version — `scripts/console.js` used to ship every
node's `answerHash` straight to the browser and check guesses locally;
anyone who viewed source had the hash and the exact algorithm, so they
could verify candidate guesses against it for free, with no rate limit,
without ever using the site's own submit button. This Worker moves that
one check off the client. The browser now sends a raw guess and gets back
`true`/`false`, nothing else — there's no hash to read out of it, and this
is also the only place a real rate limit can actually be enforced, since
it isn't running inside code the player controls.

This doesn't change anything else about the game — progress, node
unlocking, and the ending-flag decryption all still work exactly as
before and stay entirely client-side (see `deriveEndingKey()` in
`scripts/console.js` — that mechanism was already designed to need no
server at all).

## Prerequisites

- Node.js installed (for `npm`/`npx`).
- A Cloudflare account — free tier is enough for this. Sign up at
  [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) if
  you don't have one. (Free-tier request/KV limits are generous — tens of
  thousands of requests a day — but check Cloudflare's current pricing
  page for exact numbers, since those do change.)

## One-time setup

All commands below run from inside this `worker/` directory.

```bash
cd worker
npm install
```

Installs Wrangler, Cloudflare's CLI — this is the tool that deploys the
Worker, manages its config, and tails its logs. It only lives in this
`worker/` folder; the static site itself still has no build step or
dependencies.

```bash
npx wrangler login
```

Opens a browser tab to authenticate the CLI against your Cloudflare
account. One-time; the resulting token is cached locally by Wrangler, not
stored in this repo.

```bash
npx wrangler kv namespace create RATE_LIMIT
```

Creates the KV (key-value) store the rate limiter reads/writes to — this
is where "how many guesses has this IP made in the last 60 seconds" gets
tracked. The command prints something like:

```
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "a1b2c3d4e5f6..."
```

Copy that `id` value into `wrangler.toml` in this directory, replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`. A namespace id is unique per
Cloudflare account, so there's no default that would've worked here.

Then edit `wrangler.toml` once more: set `ALLOWED_ORIGIN` to the exact
origin your static site is served from (e.g.
`https://your-username.github.io`, no trailing slash). This is what tells
the Worker which origin's browser JS is allowed to call it — see the
comment on `corsHeaders()` in `src/index.js` for what this does and
(honestly) doesn't protect against.

## Deploy

```bash
npx wrangler deploy
```

Pushes `src/index.js` to Cloudflare's edge and prints the Worker's live
URL, something like:

```
https://ctf-skynet-answers.<your-subdomain>.workers.dev
```

Copy that URL. Open `scripts/console.js`, find the `CHECK_ENDPOINT`
constant near the top of the file, and paste it in (append
`/check-answer` — see the comment there). That's the only change needed
on the static-site side to point it at your new backend.

Re-run `npx wrangler deploy` any time you edit `src/index.js` — nothing
deploys automatically.

## Testing it directly (no browser needed)

```bash
curl -X POST https://ctf-skynet-answers.<your-subdomain>.workers.dev/check-answer \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"n1","guess":"wrong guess"}'
# -> {"correct":false}

curl -X POST https://ctf-skynet-answers.<your-subdomain>.workers.dev/check-answer \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"n1","guess":"judgement day"}'
# -> {"correct":true}
```

Run the first `curl` command 21+ times in a row (a quick shell loop works)
to see the rate limiter kick in — the response should switch to
`{"error":"rate_limited","retryAfter":N}` with a `429` status once you're
over the limit (20 requests / 60s by default — see the constants at the
top of `src/index.js` if you want to tune that).

```bash
npx wrangler tail
```

Streams this Worker's live logs while it's deployed — useful for watching
real requests come in while you test from the actual site in a browser.

## Local dev (optional, before deploying)

```bash
npm run dev
```

Runs the Worker locally via `wrangler dev` — recent Wrangler versions
emulate KV locally by default so the rate limiter works the same way it
will in production; check `wrangler dev --help` if it doesn't seem to
persist counts between requests, since exact defaults do shift between
Wrangler versions. Point `CHECK_ENDPOINT` at the printed local URL (e.g.
`http://localhost:8787`) temporarily to test end-to-end before deploying
for real, then switch it back to the production URL.

## If a puzzle answer ever changes

`ANSWER_HASHES` in `src/index.js` is now the *only* place a per-node hash
lives — `NODES[]` in `scripts/console.js` no longer has an `answerHash`
field at all (that's the whole point of this Worker). Regenerate the hash
the same way CLAUDE.md already describes (don't hand-type it — compute it
and verify), update the value in `ANSWER_HASHES` here, then
`npx wrangler deploy` again. The static site needs no redeploy of its own
for this — nothing about a per-node answer lives there anymore.
