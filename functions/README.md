# Answer-checking Pages Function — setup

What this is and why it exists: see the comment block at the top of
`check-answer.js`. Short version — `scripts/console.js` used to ship every
node's `answerHash` straight to the browser and check guesses locally;
anyone who viewed source had the hash and the exact algorithm, so they
could verify candidate guesses against it for free, with no rate limit,
without ever using the site's own submit button. This function moves that
check off the client. The browser now sends a raw guess and gets back
`true`/`false`, nothing else.

Unlike a standalone backend, this needs **no separate deploy step**.
Cloudflare Pages auto-detects a `functions/` directory at your project's
root and deploys whatever's in it as part of the exact same build that
already deploys `index.html`/`console.html` — the same git push you're
already using. The only one-time setup is wiring up the KV store the rate
limiter reads/writes to, since that's a project-level setting that can't
be inferred from code alone.

## One-time setup: bind a KV namespace

All of this happens in the Cloudflare dashboard — no CLI or local install
required. (Dashboard navigation labels shift over time; search for "KV"
in the sidebar if these exact menu names don't match what you see.)

1. **Create the namespace.** In the Cloudflare dashboard, find **Storage &
   Databases → KV** (or similar — Cloudflare's nav has moved this around
   before) and create a new namespace. Name it anything recognizable, e.g.
   `ctf-rate-limit` — this label is just for you, it doesn't need to match
   anything in the code.

2. **Bind it to your Pages project.** Go to your Pages project →
   **Settings → Functions** (sometimes labeled **Bindings**) → **KV
   namespace bindings** → add one:
   - **Variable name:** `RATE_LIMIT` — this has to be exactly this,
     case-sensitive. It's what `env.RATE_LIMIT` in `check-answer.js`
     refers to.
   - **KV namespace:** the one you just created.

   Do this for the **Production** environment at minimum; add it for
   **Preview** too if you want rate limiting on preview/branch deployments
   as well (Cloudflare Pages keeps these separate).

3. **Trigger a fresh deployment.** Bindings apply to deployments made
   *after* they're added, not retroactively to whatever's already live —
   either push a commit (see below) or use the dashboard's "Retry
   deployment" on your latest one.

If you skip this entirely, or push before finishing it: answer-checking
still works. `check-answer.js` checks whether the `RATE_LIMIT` binding
exists before using it, and just skips rate limiting rather than erroring
if it isn't there yet — see the comment on `env.RATE_LIMIT` in that file.
So there's no rush or fragile ordering here; getting the binding wired up
before or after your first push is equally fine, correctness-wise. Not
having it just means guesses are unrateable in the meantime.

## Ship it

```bash
git add functions/ scripts/console.js
git commit -m "Move answer-checking server-side"
git push
```

That's the whole deploy. Cloudflare Pages picks up `functions/check-answer.js`
automatically on the next build.

## Verify it worked

In the Cloudflare dashboard, your Pages project's **Deployments** tab
should show a new deployment reaching **Success**. From there:

- Open the live site, try a wrong answer on NODE_01 — should show
  `// ACCESS DENIED — incorrect.` promptly.
- Try the real answer — should show `// ACCESS GRANTED` and the node
  should clear.
- Optional direct test, no browser needed (swap in your real domain):

  ```bash
  curl -X POST https://your-site.pages.dev/check-answer \
    -H "Content-Type: application/json" \
    -d '{"nodeId":"n1","guess":"wrong guess"}'
  # -> {"correct":false}
  ```

- To see the rate limiter trigger, run that same wrong-guess `curl` 21+
  times in under a minute — the response should switch to
  `{"error":"rate_limited","retryAfter":N}` with a `429` status past the
  20th (see the constants at the top of `check-answer.js` to tune that).
  This only actually triggers once the KV binding above is wired up and a
  deployment has gone out after it was added — before that, per the
  fail-safe behavior described above, every request just returns `200`.

## Local testing (optional, before pushing)

```bash
npx wrangler pages dev . --kv RATE_LIMIT
```

No install needed — `npx` fetches Wrangler on the fly. This serves the
whole repo (static files *and* `functions/`) locally, with a local KV
emulation standing in for the real one, so you can test the full flow
before it ever reaches Cloudflare.

## If a puzzle answer ever changes

`ANSWER_HASHES` in `check-answer.js` is the only place a per-node hash
lives — `NODES[]` in `scripts/console.js` has no `answerHash` field at
all. Regenerate the hash the same careful way CLAUDE.md already describes
(compute it, verify, don't hand-type it), update the value here, commit,
and push — same one-step deploy as above, nothing else to keep in sync.
