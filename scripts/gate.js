  // Checked server-side — sends a raw guess to CHECK_GATE_ENDPOINT and
  // gets back {correct}, nothing else, so source no longer hands out the
  // plaintext phrase for free.
  const CHECK_GATE_ENDPOINT = "/check-gate";

  // ---------- hidden access-phrase QR code (sole discovery channel) ----------
  // Fetched from the Worker rather than shipped as static markup, since a
  // QR module grid is itself the fully-decoded payload; fails silently on error/rate-limit.
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

    // QR standard requires a plain margin of at least 4 modules around the
    // code before a real scanner will even locate it — added at render
    // time since GATE_QR_MODULES itself has no margin.
    const QUIET_ZONE = 4;
    const total = size + QUIET_ZONE * 2;

    // Draws LIGHT modules and the quiet zone, not dark ones — this
    // near-black page can only render the signal brighter than
    // background, and drawing it the other way round is polarity-inverted
    // (fails on real decoders like zbar, though not the lenient jsQR).
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

  // Boot sequence + audio are both held until the first interaction, then fired together (browser autoplay policy).
  const gateScreen = document.querySelector(".gate-screen");
  const gateAudio = document.getElementById("gate-audio");
  const headerEl = document.querySelector("header");

  // ---------- ambient audio toggle ----------
  // userToggled is set synchronously here, before the click bubbles up to
  // beginBoot below, so clicking this button first skips beginBoot's own autoplay.
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

  // Plays once on a correct answer; routing waits for "ended", with the
  // setTimeout below as a fallback if playback fails or stalls.
  const accessAudio = document.getElementById("access-audio");
  accessAudio.volume = 0.1;

  // Guards against a double-fire (repeat Enter, or a click mid-request).
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
