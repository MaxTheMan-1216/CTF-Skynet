# Skynet CTF

A Terminator/Skynet-themed capture-the-flag site, live at **[skynet-ctf.org](https://skynet-ctf.org)**.

Players pass a hidden-phrase landing gate, then work through a 7-node "infiltration console" — a stroked-skull node map where each node hides a cipher (ROT13, audio steganography, reversal, flag-semaphore, Vigenère, Polybius, XOR) behind a homebrew glyph alphabet, plus one optional bonus node and a 4-part decorative easter-egg hunt. Clearing all 7 main nodes decrypts a final flag.

## Stack

No framework — plain HTML/CSS/JS, two pages (`index.html` the gate, `console.html` the node map), sharing `styles/theme.css` for design tokens. Deploys as a **Cloudflare Worker with static assets** (`src/index.js`), not Cloudflare Pages: the Worker intercepts a handful of `POST` API routes (answer checking, cipher/audio delivery, rate limiting, a Turnstile session gate) and falls through to serving static files for everything else.

## Local development

```bash
npm install        # terser + clean-css, the only devDependencies
npm run build      # generates dist/ — required first
npx wrangler dev    # serves the Worker + dist/ together, matching production
```

For a quick static-only preview (no API routes, so answer submission won't work):

```bash
python -m http.server 8000
```

To skip the landing gate during dev, open `console.html` directly.

## Contributing / internals

See [CLAUDE.md](CLAUDE.md) for the full architecture write-up — puzzle/cipher system, build pipeline, rate limiting, and the session/Turnstile gate.
