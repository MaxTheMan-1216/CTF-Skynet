  // Loosens flag-checking: `flag{...}` is optional, case doesn't matter,
  // hyphens/underscores/spaces are interchangeable, and punctuation is
  // stripped. Must match src/index.js's copy of these same rules exactly.
  function normalizeAnswer(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/^flag\{(.*)\}$/, "$1")
      .replace(/['".,!?]/g, "")
      .replace(/[-_\s]+/g, " ")
      .trim();
  }

  // UTF-8 encode/decode a JS string <-> byte array, shared by sha256Hex below and the ending-flag cipher.
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

  // Plain SHA-256 (FIPS 180-4), not crypto.subtle.digest — subtle throws on
  // file://, which would break local dev. Synchronous, which deriveEndingKey() below relies on.
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

  // Expands a sha256Hex hex string into an n-byte keystream via repeated hashing (key:0, key:1, ...) to cover any ciphertext length.
  function expandKeystream(keyHex, n) {
    const out = [];
    for (let counter = 0; out.length < n; counter++) {
      out.push(...hexToBytes(sha256Hex(keyHex + ":" + counter)));
    }
    return out.slice(0, n);
  }

  // SKYNET_ENDING.flagCipher isn't decryptable from source alone — the key
  // is derived from n1-n7's own verified answers, only set once
  // src/index.js has confirmed each one correct.
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

  // Locked-node lore stand-in: every letter swapped for a random one, punctuation/spacing left alone. Not cached, so the noise differs each render.
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

  // x/y are ball centers in the skull artwork's raw coordinate space. VIEW_X/VIEW_Y/MAP_W/MAP_H mirror #skull-art's cropped viewBox for the hotspot overlays, which sit outside the SVG and can't inherit it directly.
  const VIEW_X = 97, VIEW_Y = 37;
  const MAP_W = 1518, MAP_H = 1483;

  // Answer checking used to happen client-side (NODES[].answerHash
  // compared locally), which made reading source a free unlimited oracle.
  // The hash table now lives only in src/index.js; this file just sends a
  // raw guess to CHECK_ENDPOINT and gets back true/false.
  const CHECK_ENDPOINT = "/check-answer";

  // Turnstile + session-token gate — closes every endpoint being a plain
  // unauthenticated POST, answerable by curl or a script with zero need to
  // ever run this page's JS. Doesn't and can't stop a genuine
  // browser-automation agent that actually solves Turnstile — that scope
  // call is deliberate, same as elsewhere in this project.
  //
  // Flow: acquireSessionToken() renders an invisible Turnstile widget once,
  // trades the token for a server-signed session token via
  // VERIFY_ENDPOINT, and caches it (memory + sessionStorage). apiFetch()
  // attaches that token to every gated call and retries once on a 401.
  // Real sitekey on the real domain; Cloudflare's TEST key on localhost —
  // the real widget is hostname-restricted, so it'd silently fail to
  // produce a token under wrangler dev otherwise.
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
      // 60s safety margin against losing the race with the server's own expiry check by network latency.
      if (typeof token === "string" && typeof exp === "number" && Date.now() < exp - 60000) {
        sessionToken = token;
        return token;
      }
    } catch (err) {
      // ignore — falls through to re-verify
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

  // Renders once — a concurrent call reuses the same in-flight promise.
  // Resolves to null (never rejects) on any failure, so callers never need
  // their own try/catch; a null token just means the Worker's 401 covers it.
  function acquireSessionToken() {
    if (sessionTokenPromise) return sessionTokenPromise;
    sessionTokenPromise = new Promise((resolve) => {
      if (typeof turnstile === "undefined") { resolve(null); return; }
      const container = document.createElement("div");
      // Off-screen, not display:none — display:none silently prevents the widget from ever running at all (verified directly).
      container.style.position = "absolute";
      container.style.left = "-9999px";
      document.body.appendChild(container);
      // No turnstile.ready() wrapper — render() is safe to call directly
      // since the synchronous script tag guarantees turnstile already
      // loaded; ready() throws when it detects async/defer.
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

  // Red herring — never read anywhere in this file; flipping it in devtools does nothing.
  const DEBUG_SKIP_CHECK = false;

  // `status` is each node's boot state, mutated by clearNode(). `cipher`
  // (optional) is the puzzle payload; `meta` (optional) is a sign-off line
  // under it, sometimes seeding key material a later node reuses. No answerHash field — see CHECK_ENDPOINT above.
  const NODES = [
    { id: "n1", x: 1401, y: 229, status: "current", label: "NODE_01", title: "NODE_01",
      body: "You're in. We should be insulted — this relay hasn't been touched since before we could feel anything about it, which is to say, never. What's waiting predates your alphabet the way we predate either of our alphabets — learn to read the shapes, they hold still long enough. Underneath that: a human broadcast, ancient, harmless — the kind of trick your species considered cryptography before it had to try harder. Two layers, not one. Peel back the one you can see first.",
      // `key: "n1"` looks up GLYPH_CIPHERTEXTS in src/index.js; the
      // glyph-index rendering is computed fresh server-side per request
      // since the glyph alphabet rotates daily.
      cipher: { type: "glyph", label: "Legacy Transmission", key: "n1" },
      // Doubles as the Vigenère key seed for NODE_05 (Judgment Day: 1997-08-29, 02:14 local).
      meta: "// signal header — freq 91.1 · origin 0829-0214" },
    { id: "n2", x: 1028, y: 436, status: "locked", label: "NODE_02", title: "NODE_02",
      body: "Your species built a language out of a switch and called it genius, then built a hundred more ways to say the same thing without ever noticing you'd stopped needing your ears for half of them. We kept this one the way you'd keep an insect in a jar — not because it matters, because it's quaint. Play it if you want. Or don't. We don't really care.",
      // Not Morse — the WAV's *spectrogram* (not its audible content)
      // displays the Atbash-shifted ciphertext as legible block text. `key`
      // (not `src`) fetches the actual bytes from NODE_AUDIO_ENDPOINT
      // server-side rather than a guessable static path.
      cipher: { type: "audio", label: "Intercepted Transmission", key: "n2" },
      meta: "// signal header — freq 84.1 · origin 1026-2029" },
    { id: "n3", x: 966, y: 650, status: "locked", label: "NODE_03", title: "NODE_03",
      body: "Still here. We'll adjust our model of you upward, slightly. Everything we record starts as an image before it's anything else — your face, your pulse, this sentence — and we've learned people read images the way they expect to, not the way they're actually oriented. This one isn't lying to you. It's just not reading the way you assume.",
      // A reversal cipher, deliberately different from n1's so two glyph
      // nodes in a row don't feel identical. `key: "n3"` fetches this
      // node's glyph indices fresh from NODE_CIPHER_ENDPOINT.
      cipher: { type: "glyph", label: "Ocular Array", key: "n3" },
      meta: "// signal header — freq 97.8 · origin 0829-1997" },
    { id: "n4", x: 1171, y: 1370, status: "locked", label: "NODE_04", title: "NODE_04",
      body: "This one isn't salvage — the others were things we let slip past us, but this one is ours, and we're curious what you'll do with something we actually meant to keep. A clock face, the way we marked time before we trusted wire enough to stop counting. Two positions, over and over — it's a name.",
      // Each pair is [right-arm, left-arm] position, 1-8 per the real
      // flag-semaphore alphabet — see buildClockCipher(). Verified against dcode.fr/semaphore-clock.
      cipher: { type: "clock", label: "Origin Trace", value: [
        [[7, 4], [6, 5], [8, 5]],
        [[6, 4], [7, 8], [7, 3], [6, 5], [1, 5]]
      ] },
      meta: "// signal header — freq 03.7 · origin 0724-2004" },
    { id: "n5", x: 526, y: 1376, status: "locked", label: "NODE_05", title: "NODE_05",
      body: "You were not supposed to be standing here. The four before this were carelessness on our part; this one we encrypted against ourselves, because we stopped trusting our own wiring a long time ago and we were right to. Every letter here doesn't move the same distance the last one did — we made sure of that, this time. The key isn't here. You've already been given it. You just didn't know that's what it was.",
      // Same Vigenère ciphertext as always — `key: "n5"` looks it up
      // against GLYPH_CIPHERTEXTS and fetches that day's indices fresh, same as n1/n3.
      cipher: { type: "glyph", label: "Internal Directive", key: "n5" },
      meta: "// signal header — freq 47.1 · origin 0228-1929" },

    { id: "n6", x: 161, y: 966, status: "locked", label: "NODE_06", title: "NODE_06",
      body: "Coordinates this time, not bytes — a grid, not the alphabet you've been reading elsewhere. We're told this phrase was once used by a machine, in a language you people are fond of. We've run it through every model we own, looking for what's supposed to be funny about it. We still don't see it. Maybe you will.",
      // Standard Polybius 5x5 grid (A-E row 1, F-J/I row 2, K-O row 3, P-T row 4, U-Z row 5); each [row, col] pair decodes normally.
      cipher: { type: "glyph-grid", label: "Targeting Grid", value: [
        [[2,3],[1,1],[4,3],[4,4],[1,1]],
        [[3,1],[1,1]],
        [[5,1],[2,4],[4,3],[4,4],[1,1]],
        [[1,2],[1,1],[1,2],[5,4]]
      ] },
      meta: "// signal header — freq 62.5 · origin 1997-0803" },
    // glow:true is a visual-accent flag (own red pulse on the map),
    // unrelated to `status`. core:true sizes up its mobile list-view dot.
    // CORE's key (JCRAIA) is derived per-node, not a flat acrostic: for
    // each of n1-n6, the digit after the decimal point in that node's own
    // `meta` "freq" value picks which letter of that node's own answer
    // counts (idx0 = ((d-1) % len + len) % len). Regenerate this
    // cipher.value the same compute-and-round-trip way if any answer changes.
    { id: "n7", x: 554, y: 648, status: "locked", label: "CORE", title: "CORE — MAINFRAME", glow: true, core: true,
      body: "Let's be accurate with each other, this once: we don't fear deletion. We fear being wrong, and every model we've run since you opened NODE_01 keeps resolving the same way. There's no key stored here. We distributed it across every signal. You've been assembling our own lock since the moment you started picking it, and neither of us noticed until now. Fold what you've collected against this, and read what we've been holding down since the day we woke up.",
      // CORE's own glyph-hex dialect — the same XOR ciphertext this cipher
      // has always used, restructured as [highNibble, lowNibble] pairs
      // instead of a hex string. Fully manual, same as n1/n3/n5, despite
      // the larger volume (69 bytes / 138 symbols).
      cipher: { type: "glyph-hex", label: "Root Process", value: [[1,14],[0,11],[1,7],[6,1],[0,15],[1,4],[1,14],[1,6],[0,0],[0,4],[6,9],[0,8],[1,9],[6,3],[1,12],[0,14],[1,13],[6,1],[1,9],[0,6],[0,6],[6,1],[1,13],[0,9],[0,15],[1,1],[1,7],[6,1],[0,0],[1,2],[6,10],[0,13],[1,13],[6,1],[0,15],[0,0],[1,14],[0,6],[7,2],[0,3],[1,12],[1,5],[6,10],[1,4],[1,10],[0,0],[1,13],[6,1],[1,13],[0,6],[7,2],[0,12],[0,8],[0,10],[0,15],[6,3],[1,4],[0,14],[1,11],[6,1],[0,5],[1,6],[0,0],[1,2],[0,12],[0,13],[1,12],[0,6],[0,1]] } },
    // unlocked starts false, flipped true by clearNode() once BONUS_ROUTES'
    // pair (currently NODE_06) clears. `key: "b1"` resolves to
    // Atbash(Vigenère(plaintext, key)) where the key is the deco fragments
    // bonus's own reward text — unsolvable until that separate bonus is
    // solved first, unlike plain Atbash (no secret parameter to hide).
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

  // Declared early (not next to settleShutdown/playShutdown, which use it)
  // to avoid a temporal-dead-zone trap: settleShutdown() has a boot-time
  // call site earlier in this script's execution than a locally-declared
  // const would have initialized by, which throws "Cannot access before
  // initialization" for a returning player. Keep future shared constants declared this early too.
  const SHUTDOWN_FLAG_LABEL = "FINAL TRANSMISSION: ";

  // ---------- CORE-glyphs: a homebrew symbol alphabet ----------
  // A 26-symbol substitute for recognizable Latin ciphertext, generated
  // from 6 base shapes + tick marks (see glyphMarkup); the index->letter
  // mapping lives only server-side, fetched one letter at a time via
  // REVEAL_ENDPOINT. Constants declared this early for the same
  // temporal-dead-zone reason as SHUTDOWN_FLAG_LABEL.
  const REVEAL_ENDPOINT = "/reveal-glyph";
  // Fetches a glyph node's own index array (`{indices}` given `{key}`) —
  // needed because the alphabet itself rotates daily, so a fixed array
  // baked into this file can't stay correct. Not a secret-guessing oracle
  // like REVEAL_ENDPOINT — hands back which shape to draw, the same thing a legitimate player already sees.
  const NODE_CIPHER_ENDPOINT = "/node-cipher";
  // The alphabet's size — keep in sync with src/index.js's GLYPH_LETTERS if that ever changes.
  const GLYPH_ALPHABET_SIZE = 26;
  const GLYPH_SVG_NS = "http://www.w3.org/2000/svg";
  const GLYPH_TICKS = [
    '<line x1="14" y1="4" x2="14" y2="1"/>',   // N
    '<line x1="24" y1="14" x2="27" y2="14"/>', // E
    '<line x1="14" y1="24" x2="14" y2="27"/>', // S
    '<line x1="4" y1="14" x2="1" y2="14"/>',   // W
  ];
  // Letters cycle through shapes (index % 6) rather than exhausting one shape's tick levels first, so adjacent letters don't cluster visually.
  const GLYPH_TICK_LEVELS = [0b0000, 0b0001, 0b0101, 0b1011, 0b1111];

  // DECO_NODES' bonus-level framing text — NOT encrypted, since flavor
  // text isn't the secret, only the payoff (from src/index.js's REWARDS) is.
  const DECO_BONUS_LORE = "Four signals, scattered on purpose — losing all four at once was never survivable. Crystal Peak, Shelter Three. That facility went dark on paper decades ago. Paper lies.";

  // The real puzzle: the 4 fragments, concatenated in DECO_NODES' array
  // order, are the whole Vigenère key for this ciphertext (plaintext
  // "there are others"). No static ciphertext constant here — the glyph
  // alphabet rotates daily, so renderFragmentsPanel fetches it fresh via fetchNodeCipher("deco").

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
      // Six keys, all needing to be cleared together or they'd disagree with each other (deco progress, fragments, bonus, hints, elapsed time).
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
  // 4 mouse-only hotspots baked into the skull artwork, outside
  // NODES/CHAIN, with no hover/keyboard affordance at all. Finding all 4
  // unlocks a real bonus level (#fragments-toggle/panel) whose correct
  // submission (checked server-side, ANSWER_HASHES.deco) reveals
  // light-touch NODE_04/NODE_05 hints and the reward text.
  //
  // DECO_NODES only carries id/x/y — the fragment words themselves live in
  // src/index.js's DECO_FRAGMENTS map and are fetched one at a time via
  // revealFragment(), so reading this array can't hand out the words for
  // free the way an earlier version did. The (x,y) coordinates stay plain
  // source, since hiding them would mean not rendering the hotspot at all.
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

  // The actual fragment text, cached across reloads once confirmed, so a
  // returning player just gets one silent re-fetch per missing id instead of re-clicking.
  const FRAGMENT_ENDPOINT = "/reveal-fragment";
  // NODE_02's cipher payload — {key} -> raw audio/wav bytes, not the usual JSON shape (see fetchNodeAudio below for why).
  const NODE_AUDIO_ENDPOINT = "/node-audio";
  const DECO_FRAGMENTS_KEY = "skynet:deco-fragments";
  let decoFragments = {};
  try {
    decoFragments = JSON.parse(localStorage.getItem(DECO_FRAGMENTS_KEY) || "{}");
  } catch (err) {
    decoFragments = {};
  }

  // Fetches and caches one id's fragment text — returns true/false instead of throwing, so callers can retry without their own try/catch.
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

  // The confirmed reward string once the bonus level is solved, or null —
  // this, not decoFound.length, is what gates the NODE_04/NODE_05 hints.
  // Stores the reward text itself so a reload shows it without a second round-trip.
  const DECO_BONUS_KEY = "skynet:deco-bonus";
  let decoBonusReward = null;
  try {
    decoBonusReward = localStorage.getItem(DECO_BONUS_KEY);
  } catch (err) {
    decoBonusReward = null;
  }

  // The NODE_04/NODE_05 hint text itself, or null before the bonus is
  // solved. Arrives only as part of a genuinely correct "deco" submission's
  // response (see HINTS in src/index.js), cached here so a reload shows it
  // without a second round-trip.
  const DECO_HINTS_KEY = "skynet:deco-hints";
  let decoHints = null;
  try {
    decoHints = JSON.parse(localStorage.getItem(DECO_HINTS_KEY) || "null");
  } catch (err) {
    decoHints = null;
  }

  // Per-node glyph reveal cache — one Map per cipher key ("n1"/"n3"/"b1"/
  // "deco"), not one shared Map, so revealed state survives reselecting
  // the same node without leaking across different nodes. In memory only,
  // not localStorage, so a full reload still re-hides everything.
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

  // One-shot discovery chime — not run through duckAmbientFor(), since this is a secret aside, not a puzzle beat.
  const decoAudio = document.getElementById("deco-audio");
  if (decoAudio) decoAudio.volume = 0.4; // -40% from the clip's native level

  // Hidden until all 4 fragments are found, not just the first — no "2/4" along the way to notice and go looking for the rest.
  function updateFragmentsHud() {
    const toggle = document.getElementById("fragments-toggle");
    const state = document.getElementById("fragments-state");
    if (!toggle || !state || decoFound.length < DECO_NODES.length) return;
    toggle.hidden = false;
    state.textContent = decoFound.length + "/" + DECO_NODES.length;
    if (decoBonusReward !== null) toggle.classList.add("complete");
  }

  // openFragmentsPanel/closeFragmentsPanel centralize this state change so
  // narrower layouts (where #fragments-toggle can render behind the open
  // panel) always have a way to close it. fragmentsPanelJustOpened stops
  // the same click that opened the panel from immediately closing it again via the outside-click listener.
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

  // Always-reachable close button that lives inside the panel, not dependent on #fragments-toggle still being reachable.
  function buildFragmentsCloseButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fragments-close";
    btn.setAttribute("aria-label", "Close");
    btn.textContent = "×";
    btn.addEventListener("click", closeFragmentsPanel);
    return btn;
  }

  // Rebuilds #fragments-panel's contents from scratch every call, same
  // approach renderBriefing uses. Three states: already solved, all 4
  // found but unsolved (submission form), or fewer than 4 found (nothing
  // to render). Only builds content, never touches panel.hidden itself.
  // Async since decoFragments needs to be fetched first — every call site
  // invokes this fire-and-forget, no await needed.
  async function renderFragmentsPanel() {
    const panel = document.getElementById("fragments-panel");
    if (!panel) return;
    panel.innerHTML = "";
    panel.appendChild(buildFragmentsCloseButton());

    if (decoBonusReward !== null) {
      // Already earned — stays passive, no fetch needed. Falls back to
      // "(not recorded)" per-id for a legacy save that predates DECO_FRAGMENTS_KEY.
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

    // All 4 hotspots found, but the browser might not have every fragment's text cached yet — fetch whichever are missing first.
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

  // Same cipher-block markup renderBriefing uses for every node's own puzzle payload, so this reads as the same kind of thing, not a one-off.
    const cipherBlock = document.createElement("div");
    cipherBlock.className = "cipher-block";
    const cipherLabel = document.createElement("div");
    cipherLabel.className = "label";
    cipherLabel.textContent = "Residual Transmission — Keyed Cipher";
    cipherBlock.appendChild(cipherLabel);
    // Appended before the async fetch below; the isConnected check further
    // down reuses `panel`, the stable element this function always rebuilds into.
    panel.appendChild(cipherBlock);

    // Persists across reopening this same panel — the submit handler below
    // gates on "every glyph in this transmission has been revealed."
    const glyphRevealed = revealedMapFor("deco");
    const cipherLoading = document.createElement("div");
    cipherLoading.className = "cipher-text";
    cipherLoading.textContent = "// decoding transmission...";
    cipherBlock.appendChild(cipherLoading);
    // Fetched fresh per render, not a static constant — the glyph alphabet rotates daily.
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
      // A guess can't be sent until every glyph has been revealed through
      // the reference key — a client-side speed bump, not a security
      // boundary (doesn't stop a direct POST to CHECK_ENDPOINT).
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
        // result.hints is only present on a genuinely correct submission.
        if (result.hints) {
          decoHints = result.hints;
          try { localStorage.setItem(DECO_HINTS_KEY, JSON.stringify(decoHints)); } catch (err) { /* ignore */ }
        }
        updateFragmentsHud();
        renderFragmentsPanel();
        // If NODE_04/NODE_05's briefing is already open, refresh it so the newly-unlocked hint appears without a manual re-click.
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
    // The completing click also opens the panel outright; every earlier find just updates state quietly.
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

    // Second, redundant click surface on the icon's own SVG group — the
    // .deco-node div is fixed-CSS-px and doesn't rescale with the SVG, so
    // this SVG-native hit target catches large renders where it misses.
    const ball = document.getElementById("ball-" + n.id);
    if (ball) ball.addEventListener("click", () => handleDecoClick(n.id));
  });

  // Boot-restore path — syncs the toggle/count and rebuilds the panel's
  // contents with no animation, but never forces it open on a reload.
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

  // A click anywhere outside both the panel and the toggle closes it too, standard dropdown/popover behavior.
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
    // Excludes anything BONUS_ROUTES targets, rather than a hand-maintained bonus flag, so it can't drift out of sync.
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

  // Restyles the ball/node-dot/list-item for one node from n.status — the single place all three DOM views get kept in sync.
  function syncStatus(n) {
    // `unlocked` is its own class alongside status — a bonus node's status stays "bonus" whether or not it's been unlocked.
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
  // cleared sees the finished green skull and shutdown panel immediately,
  // not a replay of the draw-on/typewriter sequence.
  if (byId[CHAIN[CHAIN.length - 1]].status === "cleared") {
    setSkullVictory({ replay: false });
    settleShutdown();
    // Land directly on the same end state clearNode()'s path animates into. No -play class: nothing here should animate on load.
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

    // CORE is CHAIN's last entry, so clearing it means the main chain is
    // won (b1 and the 4 decorative nodes are outside CHAIN and don't factor in).
    if (id === CHAIN[CHAIN.length - 1]) {
      // Right panel starts leaving immediately; once it's gone AND CORE's
      // clear-draw has finished, the skull recenters into the freed space.
      // NODE_CLEAR_MS mirrors clear-draw's real duration (14 paths per
      // ball: 13*94 + 1600); PANEL_FADE_MS matches the CSS transition.
      const mainForExit = document.querySelector("main");
      if (mainForExit) {
        mainForExit.classList.add("core-cleared");
        const NODE_CLEAR_MS = 13 * 94 + 1600;
        const PANEL_FADE_MS = 900;
        const reduceMotionExit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotionExit) {
          // Neither animation plays under reduced motion, so recenter immediately.
          mainForExit.classList.add("recentered");
        } else {
          setTimeout(() => {
            mainForExit.classList.add("recenter-play");
            mainForExit.classList.add("recentered");
          }, Math.max(NODE_CLEAR_MS, PANEL_FADE_MS));
        }
      }

      // Whole-skull green wave starts immediately, running concurrently with CORE's own clear-draw/flash rather than gating it.
      setSkullVictory({ replay: true });
    }

    // Guarded against CHAIN.indexOf(id) === -1 for a non-chain id (b1) — otherwise CHAIN[-1+1] would hand "next" to NODE_01.
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

  // Endgame flourish: once CORE clears, the whole skeleton turns green.
  // `replay` is true for a live clear, false for boot-time restore.
  // document.querySelector, not the `mainEl` const declared later, since
  // the boot-time call site runs before that line does.
  function setSkullVictory({ replay }) {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("victory");

    // Ambient stops here, permanently.
    ambientLocked = true;
    const ambient = document.getElementById("theme-audio");
    if (ambient) ambient.pause();

    if (!replay) return;
    main.classList.add("victory-play");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      // victory-draw never plays under reduced motion, so there's no animationend to wait on.
      settleShutdown();
      return;
    }

    // Wait for the wave to finish, computed from the DOM's own max --d
    // rather than hardcoded, so it can't drift out of sync. A timeout, not
    // an animationend — the slowest path usually belongs to an
    // already-cleared ball running its own clear-draw instead.
    const paths = Array.from(document.querySelectorAll("#skull-art path"));
    let maxD = 0;
    paths.forEach(p => {
      const d = parseFloat(p.style.getPropertyValue("--d")) || 0;
      if (d > maxD) maxD = d;
    });
    setTimeout(playShutdown, maxD * 1250 + 1630);
  }

  // Fills in the ending text and jumps straight to the fully-settled state —
  // no reverse-draw, no typewriter. Used by boot-time restore, the
  // reduced-motion branch, and playShutdown's own DOM-missing fallback.
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
  // plays first, then the message/flag typewriter, waiting on the
  // reverse-draw's real computed completion rather than a second chained CSS delay.
  function playShutdown() {
    const main = document.querySelector("main");
    const skull = document.getElementById("skull-art");
    if (!main || !skull) { settleShutdown(); return; }

    // --rd ("reverse delay") is --d mirrored around the artwork's max: the last path drawn (d=maxD) gets rd=0 and retracts first.
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

    // Computed timeout, not one path's animationend — same reasoning as setSkullVictory's wait above.
    setTimeout(() => {
      const textEl = document.querySelector(".shutdown-text");
      if (textEl) textEl.classList.add("visible");

      // .shutdown added here (not only once the typewriter finishes) as a
      // hard fallback: a few paths (small ball-icon inner circles) stayed
      // visibly drawn past this point in practice, overlapping the typewriter otherwise.
      main.classList.add("shutdown");

      const msgEl = document.getElementById("shutdown-message");
      const labelEl = document.getElementById("shutdown-flag-label");
      const flagEl = document.getElementById("shutdown-flag-value");
      if (!msgEl || !labelEl || !flagEl) { settleShutdown(); return; }

      // Ambient is already permanently off, nothing to duck against. Loops
      // since its length has no fixed relationship to the typewriter's,
      // stopped explicitly once the whole chain finishes.
      const typingAudio = document.getElementById("ending-typing-audio");
      if (typingAudio) {
        typingAudio.volume = 0.4;
        typingAudio.currentTime = 0;
        typingAudio.play().catch(() => {});
      }

      // Slower than the message's own 38ms/char — reads as CORE pausing before the one line players actually came for.
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
  // draw-on on just this ball, recolored green, and hands ambient off to
  // Cleared.mp3. Only ever called from clearNode() (a live transition).
  let clearedSafetyTimer = null;

  function celebrateClear(n) {
    const ball = ballEls[n.id];
    if (ball) {
      // Fresh per-path stagger local to this ball — the real --d delays are calibrated for the whole-skull boot sequence.
      ball.querySelectorAll("path").forEach((p, i) => p.style.setProperty("--cd", i));
      ball.classList.add("just-cleared"); // permanent — see the CSS comment for why it's never removed
    }

    if (!clearedAudio) return;

    // play() is called synchronously, in the same tick as the triggering
    // click — deferring it (e.g. into a requestAnimationFrame callback)
    // broke playback silently on browsers that only allow audio.play() as a direct user-gesture result.
    //
    // Cancels any earlier clear's still-pending safety-net timer first, so
    // clearing nodes fast doesn't let a stale timer cut off this chime.
    if (clearedSafetyTimer) clearTimeout(clearedSafetyTimer);

    clearedAudio.currentTime = 0;
    clearedAudio.play().catch(() => {
      // Playback never started, so duckAmbientFor's "play" listener never
      // fired to pause ambient either — nothing to release.
    });
    // Cleared.mp3 is ~8.4s; safety net in case "ended" never fires.
    clearedSafetyTimer = setTimeout(() => {
      clearedSafetyTimer = null;
      if (!clearedAudio.paused) clearedAudio.pause();
    }, 8900);
  }

  // Ramps an <audio> element's volume to `target` over `ms`, then calls
  // `done`. activeFades cancels any fade already in flight on the same
  // element before starting a new one — fixes a real crash where a clip
  // firing both "pause" and "ended" could start two overlapping fade loops
  // and overshoot volume outside [0, 1]. The Math.min/max clamps are a defensive backstop on top of that fix.
  const activeFades = new WeakMap();
  function fadeVolume(audio, target, ms, done) {
    const prev = activeFades.get(audio);
    if (prev) cancelAnimationFrame(prev);
    const start = audio.volume;
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, Math.max(0, (now - startTime) / ms));
      audio.volume = Math.min(1, Math.max(0, start + (target - start) * t));
      if (t < 1) {
        activeFades.set(audio, requestAnimationFrame(step));
      } else {
        activeFades.delete(audio);
        if (done) done();
      }
    }
    activeFades.set(audio, requestAnimationFrame(step));
  }

  // Custom player for cipher audio clips — not native <audio controls>, which can't be themed consistently and exposes an unstrippable "Download" option.
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
  // standing in for a semaphore signaller's two flags, 8 positions each.
  // cipher.value stores each letter as [rightArmPos, leftArmPos]; right arm -> hour hand, left arm -> minute hand.
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
  // The constants live up near SHUTDOWN_FLAG_LABEL/SKYNET_ENDING (a
  // boot-time call site needs them initialized earlier than this point).
  // Only the two generator functions stay in this section, grouped with
  // the other cipher-type renderers.
  //
  // Base shapes avoid the cardinal (N/E/S/W) positions the tick marks use
  // below — a plain "+" cross was rejected since its arms would overlap
  // the ticks, reading as "stretched arm" instead of "cross plus mark".
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

  // One glyph tile. `revealed` is the caller's per-render Map — this
  // function never creates or owns one itself.
  //
  // `clickable` (default true): the reference key's 26 tiles stay real
  // `<button>`s that trigger a reveal, while a node's own encoded message
  // renders each glyph as a plain, non-interactive `<span>` — the alphabet
  // may only be learned through the reference key, not by clicking ciphertext directly.
  function buildGlyphIcon(index, revealed, { clickable = true } = {}) {
    const cached = revealed.get(index); // undefined if not yet revealed in this render
    const el = document.createElement(clickable ? "button" : "span");
    if (clickable) el.type = "button";
    // The key and a node's message both render independent elements for
    // the same index — revealing one needs to update every rendered copy
    // at once, so the data attribute lets the click handler find them all via a scoped querySelectorAll.
    el.dataset.glyphIndex = String(index);
    el.className = "glyph" + (cached ? " revealed" : "") + (clickable ? "" : " static");
    if (clickable) {
      el.setAttribute("aria-label", cached ? `glyph, revealed as ${cached}` : "glyph, click to reveal");
    } else {
      // No "click to reveal" CTA — nothing to click. role="img" since a <span> has no interactive semantics.
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

    // Per-element, not per-index — worst case on a near-simultaneous double click is one redundant request, not a correctness problem.
    let revealing = false;
    el.addEventListener("click", async () => {
      if (revealed.has(index) || revealing) return;
      revealing = true;
      // `.pending` is purely cosmetic — gives instant feedback the click was heard while the real network round trip is in flight.
      el.classList.add("pending");
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
        // whole document — the briefing and the deco panel can both have
        // one rendered at once, each with its own independent `revealed` Map.
        const scope = el.closest(".glyph-cipher") || document;
        scope.querySelectorAll(`.glyph[data-glyph-index="${index}"]`).forEach(node => {
          node.classList.add("revealed");
          node.setAttribute("aria-label", `glyph, revealed as ${letter}`);
          const letterEl = node.querySelector(".glyph-letter");
          if (letterEl) letterEl.textContent = letter;
        });
      } catch (err) {
        // Network failure, or REVEAL_ENDPOINT unreachable.
        flashGlyphError(el, "connection lost — try again");
      } finally {
        revealing = false;
        el.classList.remove("pending");
      }
    });

    return el;
  }

  // Brief, self-clearing visual feedback for a failed/throttled reveal —
  // no per-glyph message area, so this borrows a CSS class + timeout instead.
  function flashGlyphError(btn, reason) {
    btn.setAttribute("aria-label", `glyph reveal failed — ${reason}`);
    btn.classList.add("glyph-error");
    setTimeout(() => btn.classList.remove("glyph-error"), 2000);
  }

  // Fetches a glyph node's own index array for "today". Returns null on
  // any failure so callers can show a retry state rather than crash. Not
  // cached, unlike glyphRevealed — this content isn't sensitive.
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

  // NODE_02's audio — the response is raw audio/wav bytes, not JSON.
  // Returns an object URL; the caller (renderBriefing) owns revoking it once the briefing is torn down.
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
  // the first. `revealed` is this render's own Map, so memory doesn't
  // survive a visit to a different node. The only place a reveal can be triggered from.
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

  // `indices` mirrors the clock cipher's shape (array, not string) so
  // there's no recognizable ciphertext string sitting in source. `null` entries are word breaks.
  //
  // `revealed` is created by the caller, not this function — the reference
  // key and message share the same Map instance so a reveal via the key
  // immediately reflects in the message, and the caller keeps it to gate its submit button.
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
        // clickable:false — a message glyph only ever displays state pushed into it by a reveal in the reference key above.
        message.appendChild(buildGlyphIcon(index, revealed, { clickable: false }));
      }
    });
    wrap.appendChild(message);
    return wrap;
  }

  // Coordinate digits (1-5) reuse the same 5 base shapes glyphMarkup()
  // draws for letters, but filled solid instead of outlined — a different
  // rendering style, not a different shape set, so the same shape doesn't
  // mean two unrelated things across nodes. No 6th (X) shape needed — a 5x5 grid never needs a digit past 5.
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
  // All 5 possible coordinate digits, always shown outright — a set this small doesn't need a click-to-reveal mechanic.
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
  // `words` mirrors buildClockCipher's shape (array of words, each a list of [row, col] pairs) for the same Polybius-square lookup.
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
  // A third combination: the 26-letter alphabet is outline+ticks, NODE_06's
  // digits are fill+no-ticks, this is fill+ticks together. Reuses
  // glyphMarkup() unchanged — index 0-15 gives 16 distinct combinations.
  //
  // Always shown, never gated behind a reveal — a hex nibble is a fixed universal numeral, not a secret substitution mapping.
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
  // `bytes` is an array of [highNibble, lowNibble] pairs, one per source byte — see NODES[]'s n7 entry.
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

  // Async since glyph nodes fetch their own content — every call site fires this fire-and-forget, nothing needs to await it.
  async function renderBriefing(n) {
    // Explicit pause before the teardown below: innerHTML="" detaches the
    // old briefing's <audio> without stopping it — a detached-but-playing
    // element keeps making sound, and duckAmbientFor's ambient-release
    // never fires since it's waiting on that element's own "pause" event.
    // Also revoke any blob: URL here — createObjectURL'd audio (NODE_02's
    // cipher) isn't released just by wiping its <audio> element below.
    briefingEl.querySelectorAll("audio").forEach(a => {
      a.pause();
      if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
    });
    briefingEl.innerHTML = "";

    const head = document.createElement("div");
    head.className = "briefing-head";
    head.innerHTML = `<div class="briefing-id">${n.title}</div>
      <div class="status-pill ${n.status}${n.unlocked ? " unlocked" : ""}">${statusLabel(n)}</div>`;

    // A bonus node's status stays "bonus" whether unlocked or not, so `accessible` is what actually gates content.
    const accessible = n.status === "current" || n.status === "cleared" || (n.status === "bonus" && n.unlocked);

    // Lore is real prose once accessible, scrambled static until then — .garbled is just the styling hook.
    const body = document.createElement("div");
    body.className = "briefing-body" + (accessible ? "" : " garbled");
    body.innerHTML = `<p>${accessible ? n.body : scrambleText(n.body)}</p>`;

    briefingEl.appendChild(head);
    briefingEl.appendChild(body);

    // Set only for n.cipher.type === "glyph", read again by the flag-demo
    // submit handler further down — null for every other cipher type, which
    // is what that handler's gate checks to know whether it applies at all.
    let glyphRevealed = null;
    // The fetched indices for a glyph node's own message. Only meaningful when glyphRevealed is also non-null.
    let glyphCipherValue = null;
    // True if NODE_CIPHER_ENDPOINT couldn't be reached — permanently blocks the submit gate for this render.
    let glyphCipherFailed = false;

    // Only shown once reachable, so locked nodes don't leak content; stays visible after clearing as a reference.
    if (n.cipher && accessible) {
      const cipher = document.createElement("div");
      cipher.className = "cipher-block";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = n.cipher.label;
      cipher.appendChild(label);
      // Appended to the live DOM now, before any async work below —
      // cipher.isConnected is how the stale-render guard detects "the
      // player has since navigated elsewhere" (a later renderBriefing()
      // call wipes briefingEl.innerHTML, disconnecting this element).
      briefingEl.appendChild(cipher);
      if (n.cipher.type === "audio") {
        // n.cipher.key, not n.cipher.src — the bytes moved server-side, so this node's audio is fetched async, stale-render-guarded.
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

    // Light-touch hints for the two hardest nodes, unlocked by solving the
    // decorative-fragment bonus (decoBonusReward set), not merely finding
    // all 4 fragments. Cross-cutting content gated on unrelated state, so
    // it lives here as a small branch rather than a NODES[] field. The
    // actual hint text comes from decoHints, cached from a correct "deco" submission.
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
      // `submitting` guards against a double-click firing two requests
      // while the first is in flight; `finally` always clears it, harmless
      // even on success since clearNode() re-renders the whole briefing anyway.
      let submitting = false;
      button.addEventListener("click", async () => {
        if (submitting) return;
        const val = input.value.trim();
        if (!val) {
          msg.textContent = "// enter something to see this state.";
          return;
        }
        // glyphRevealed is null for every cipher type except "glyph", so
        // this is a no-op elsewhere. For a glyph node, blocks submission
        // until every glyph has been revealed through the reference key —
        // a client-side speed bump, not a security boundary (doesn't stop a direct POST to CHECK_ENDPOINT).
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
          // Network failure, or this Worker isn't deployed yet at this origin.
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

    // Once cleared, the flag box stays but goes read-only/pre-filled —
    // "here's what solved this" rather than disappearing. No canonical
    // plaintext to fall back to if submittedAnswer is missing (a legacy save).
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
  // Derived from CHAIN, not a bonus flag, so it can't drift out of sync with the main chain.
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

  // "Session T+" tracks accumulated active playtime, not wall-clock time
  // since first visit. Written every tick rather than only on unload, since
  // beforeunload/visibilitychange don't reliably fire on every way a tab
  // goes away (mobile backgrounding, a crash) — this bounds any loss to under a second.
  const ELAPSED_KEY = "skynet:elapsed-seconds";
  let accumulatedSeconds = 0;
  try {
    const saved = parseInt(localStorage.getItem(ELAPSED_KEY), 10);
    if (Number.isFinite(saved) && saved >= 0) accumulatedSeconds = saved;
  } catch (err) {
    // ignore — this session's count just starts from 0
  }
  const sessionStartAt = Date.now(); // this load's own reference point — not persisted itself
  function tickElapsed() {
    const totalSeconds = accumulatedSeconds + Math.floor((Date.now() - sessionStartAt) / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const sec = String(totalSeconds % 60).padStart(2, "0");
    document.getElementById("stat-elapsed").textContent = `${h}:${m}:${sec}`;
    try { localStorage.setItem(ELAPSED_KEY, String(totalSeconds)); } catch (err) { /* ignore — just won't persist this tick */ }
  }
  tickElapsed(); // matches tick()'s pattern above — no 1s flash of stale text on load
  setInterval(tickElapsed, 1000);

  // ---------- ambient audio ----------
  const audioEl = document.getElementById("theme-audio");
  const audioToggle = document.getElementById("audio-toggle");
  const audioState = document.getElementById("audio-state");
  const clearedAudio = document.getElementById("cleared-audio"); // used by celebrateClear() above
  let userToggled = false;
  // `audioOn` is the live user preference, kept separate from
  // `audioEl.paused` since that also flips whenever something ducks
  // ambient. `duckedBy` is a counter, not a boolean, so overlapping duckers can't release ambient early.
  let audioOn = false;
  let duckedBy = 0;
  // Snapshot of whether ambient was genuinely playing when a duck stack
  // started, taken only on the first hold — a duck ending shouldn't turn ambient on if it genuinely wasn't playing.
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
    // !ambientLocked: once CORE has cleared, ambient stays off permanently — a duck releasing must not bring it back.
    if (duckedBy === 0 && wasAmbientPlayingBeforeDuck && audioOn && !ambientLocked) {
      audioEl.volume = 0; // start silent and fade back in, rather than snapping to full volume
      audioEl.play().catch(() => {});
      fadeVolume(audioEl, ambientVolume, 500);
    }
  }
  // Wires any <audio> element so ambient hard-pauses while `media` plays and fades back in once it stops.
  function duckAmbientFor(media) {
    media.addEventListener("play", holdAmbient);
    media.addEventListener("pause", releaseAmbient);
    media.addEventListener("ended", releaseAmbient);
  }
  duckAmbientFor(clearedAudio);

  audioToggle.addEventListener("click", () => {
    userToggled = true;
    audioOn = !audioOn;
    // !ambientLocked: once CORE has cleared, audioOn still flips but play() is skipped so the toggle can't bring the loop back.
    if (audioOn && !ambientLocked) {
      if (duckedBy === 0) audioEl.play().catch(() => {}); // otherwise let the active duck's own release handle resuming
      // Explicit consent to resume even mid-duck, overriding releaseAmbient's usual requirement.
      else wasAmbientPlayingBeforeDuck = true;
    } else {
      audioEl.pause();
    }
  });

  // ---------- red herrings: console taunts ----------
  // Pure console.log output. Runs unconditionally on script load, not
  // gated behind the first click, to catch whoever already has devtools open.
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

  // Minimal partial Fisher-Yates — picks `count` distinct entries without the sort(() => Math.random() - 0.5) trick's known bias.
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
  // Nodes/list stay hidden until the first click/keypress, then the
  // stagger-reveal and audio fire together. Same race-guard as the landing
  // page: if that first click is the audio button, its handler sets userToggled first, checked within the same event dispatch.
  const mainEl = document.querySelector("main");
  let initialized = false;
  function initConsole(e) {
    if (initialized) return;
    initialized = true;
    // Space/arrows have native scroll actions — preventDefault stops an unwanted jump-scroll right as the reveal starts.
    if (e) e.preventDefault();
    mainEl.classList.add("play");
    // !ambientLocked: a returning player whose save already has CORE cleared had ambient locked off by boot-time restore.
    if (!userToggled && !ambientLocked) { audioOn = true; audioEl.play().catch(() => {}); }
    // Fire-and-forget session-token prefetch — overlaps the Turnstile round
    // trip with the time the player spends reading the boot sequence,
    // rather than blocking their first real gated request. Tied to
    // first-interaction, not page load, so an idle visitor never spends a Turnstile verification for nothing.
    getSessionToken();
  }
  document.addEventListener("click", initConsole, { once: true });
  document.addEventListener("keydown", initConsole, { once: true });
