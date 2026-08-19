  // Checked server-side now (added 2026-08-17) — this used to be a bare
  // `const ACCESS_PHRASE = "no fate"` compared directly against the
  // input, which was the single worst version of the "reading source
  // hands out the answer for free" leak this whole project has otherwise
  // closed everywhere else: not even a hash, the literal plaintext,
  // checked in code the player already has open. src/index.js's
  // GATE_ANSWER_HASH holds the only copy now; this file sends a raw guess
  // to CHECK_GATE_ENDPOINT and gets back {correct}, nothing else — same
  // shape as console.js's own CHECK_ENDPOINT round trip, for the same
  // reason.
  const CHECK_GATE_ENDPOINT = "/check-gate";

  // ---------- hidden access-phrase QR code (added 2026-08-18, made the
  // sole discovery channel 2026-08-19 — a sibling letterform-SVG hint that
  // used to live alongside this was removed) ----------
  // See index.html's own comment on .hidden-signal-qr for why this has to
  // be fetched from the Worker rather than shipped as static markup: a QR
  // module grid IS the fully-decoded payload the instant it's read, with
  // no "needs rendering to mean anything" gap the way traced letterform
  // paths would have. Fetched once, eagerly — not gated behind boot or
  // any interaction — only *revealing* it needs an outside tool, not
  // finding it. Fails silently on error/rate-limit: there's nothing
  // useful to show a player if it doesn't load, and retrying isn't worth
  // the added complexity for what's still just the front door, not real
  // puzzle content.
  const GATE_QR_ENDPOINT = "/gate-qr";
  const GATE_QR_NS = "http://www.w3.org/2000/svg";

  async function renderGateQr() {
    const container = document.querySelector(".hidden-signal-qr");
    if (!container) return;

    let payload;
    try {
      const res = await fetch(GATE_QR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      payload = await res.json();
    } catch {
      return;
    }

    const { size, rows } = payload || {};
    if (!Number.isInteger(size) || !Array.isArray(rows) || rows.length !== size) return;

    // QUIET_ZONE (added 2026-08-19, after a real scan attempt on the first
    // version came back unreadable): the QR standard requires a plain
    // margin of at least 4 modules around the actual code before any
    // real-world scanner will even locate it, not just decode it wrong —
    // this is the single most common reason an otherwise-correct QR image
    // fails to scan at all. GATE_QR_MODULES itself is exactly what the
    // `qrcode` library produces for the input, no margin included (kept
    // that way server-side deliberately — see its own comment), so the
    // margin is added here, at render time, rather than baked into the
    // server constant.
    const QUIET_ZONE = 4;
    const total = size + QUIET_ZONE * 2;

    // POLARITY (fixed 2026-08-19, after "screenshot, boost, scan" still
    // came back "no barcode found" from every real reader tried — jsQR had
    // been decoding it fine, which is what made this take a real decoder,
    // not just a second library, to actually catch): a rect gets drawn for
    // each LIGHT module and for the whole quiet zone, NOT for each dark
    // module — the inverse of what "draw the dark pixels" would naturally
    // suggest, and inverted from the very first version of this file.
    //
    // Why: --void is already close to the darkest a pixel on this page can
    // be, so the near-invisible signal this whole mechanism relies on can
    // only ever be a touch BRIGHTER than background — there's no room to
    // render "signal" as darker-than-background. That's fine for the
    // letterform hint, where a human eye just needs *any* detectable delta
    // and doesn't care which direction it goes. A QR decoder cares a great
    // deal: dark modules are defined as LOW reflectance, light modules
    // (and the quiet zone) as HIGH. Drawing the dark modules as the
    // brighter pixels — the first version of this code — produces a real,
    // scannable-looking QR grid that is exactly polarity-inverted from
    // what any decoder expects, and most real decoders don't try the
    // inverted case by default. Confirmed directly, not guessed: jsQR
    // (lenient, apparently does tolerate inverted input) decoded the old
    // version fine; zbar (the library many real scanner apps are actually
    // built on) failed on that exact same image at every tested delta up
    // to +20, lossless or through JPEG — and succeeded immediately, at the
    // original +2 delta, the moment the polarity below was corrected.
    // Dark modules are left undrawn on purpose — showing the page's own
    // raw background through, unmodified, is what makes them read as the
    // "low" value once boosted, without needing a second fill color.
    const svg = document.createElementNS(GATE_QR_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${total} ${total}`);
    for (let y = 0; y < total; y++) {
      for (let x = 0; x < total; x++) {
        const cx = x - QUIET_ZONE, cy = y - QUIET_ZONE;
        const inCore = cx >= 0 && cx < size && cy >= 0 && cy < size;
        const isDark = inCore && rows[cy][cx] === "1";
        if (isDark) continue; // leave dark modules as raw, undrawn background
        const rect = document.createElementNS(GATE_QR_NS, "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", 1);
        rect.setAttribute("height", 1);
        svg.appendChild(rect);
      }
    }
    container.appendChild(svg);
  }
  renderGateQr();

  const gate = document.getElementById("gate");
  const input = document.getElementById("gate-input");
  const row = gate.querySelector(".gate-row");
  const msg = document.getElementById("gate-msg");

  // Boot sequence + audio are both held until the first interaction, then
  // fired together — audio can't autoplay before that anyway (browser
  // policy), so the animation waits to match it rather than running ahead.
  const gateScreen = document.querySelector(".gate-screen");
  const gateAudio = document.getElementById("gate-audio");
  const headerEl = document.querySelector("header");

  // ---------- ambient audio toggle ----------
  // Same pattern as console.js's HUD audio button: userToggled is set
  // synchronously inside this click handler, which runs before the click
  // bubbles up to the document-level beginBoot listener below — so if the
  // first click is this button, beginBoot sees it and skips its own autoplay.
  const audioToggle = document.getElementById("audio-toggle");
  const audioState = document.getElementById("audio-state");
  let userToggled = false;

  function syncAudioLabel() {
    audioState.textContent = gateAudio.paused ? "OFF" : "ON";
    audioState.classList.toggle("signal", !gateAudio.paused);
  }
  gateAudio.addEventListener("play", syncAudioLabel);
  gateAudio.addEventListener("pause", syncAudioLabel);

  audioToggle.addEventListener("click", () => {
    userToggled = true;
    if (gateAudio.paused) gateAudio.play().catch(() => {});
    else gateAudio.pause();
  });

  let booted = false;
  function beginBoot(e) {
    if (booted) return;
    booted = true;
    // Space's native action is page-down scroll — prevent it so "press any
    // key" doesn't also jump-scroll the page (same fix as console.js's initConsole).
    if (e) e.preventDefault();
    gateScreen.classList.add("play");
    headerEl.classList.add("play");
    if (!userToggled) gateAudio.play().catch(() => {});
  }
  document.addEventListener("click", beginBoot, { once: true });
  document.addEventListener("keydown", beginBoot, { once: true });

  // Plays once on a correct answer; routing waits for it to actually finish
  // ("ended"), not a guessed setTimeout. play().catch() and the setTimeout
  // below are fallbacks if playback fails or stalls — `routed` ensures only
  // the first of the three ever navigates.
  const accessAudio = document.getElementById("access-audio");
  accessAudio.volume = 0.1;

  // submitting guards against a double-fire (fast repeat Enter, or a
  // click landing while a request is already in flight) now that this is
  // a real network round trip rather than an instant local comparison —
  // same guard shape console.js's own submit handlers already use.
  let submitting = false;
  gate.addEventListener("submit", async e => {
    e.preventDefault();
    if (submitting) return;
    const answer = input.value.trim();
    row.classList.remove("shake", "ok");
    if (!answer) return;

    submitting = true;
    input.disabled = true;
    msg.textContent = "AUTHENTICATING...";

    let result;
    try {
      const res = await fetch(CHECK_GATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: answer }),
      });
      if (res.status === 429) {
        const retry = await res.json().catch(() => ({}));
        row.classList.add("shake");
        msg.textContent = retry.retryAfter
          ? `UPLINK THROTTLED — retry in ${retry.retryAfter}s`
          : "UPLINK THROTTLED — slow down";
        return;
      }
      if (!res.ok) throw new Error("bad response");
      result = await res.json();
    } catch (err) {
      row.classList.add("shake");
      msg.textContent = "CONNECTION LOST — check your uplink and retry";
      return;
    } finally {
      submitting = false;
      input.disabled = false;
    }

    if (result.correct) {
      row.classList.add("ok");
      msg.classList.add("ok");
      msg.textContent = "ACCESS GRANTED — ROUTING TO NETWORK";
      input.disabled = true;
      gateAudio.pause(); // let the access chime play clean, not layered under the ambient loop

      let routed = false;
      function route() {
        if (routed) return;
        routed = true;
        window.location.href = "console.html";
      }
      accessAudio.addEventListener("ended", route, { once: true });
      accessAudio.play().catch(route);
      setTimeout(route, 2500); // clip is ~1.9s; safety net in case "ended" never fires
    } else {
      void row.offsetWidth; // restart the shake animation on back-to-back wrong guesses
      row.classList.add("shake");
      msg.classList.remove("ok");
      msg.textContent = "ACCESS DENIED — SEQUENCE REJECTED";
      input.select();
    }
  });
