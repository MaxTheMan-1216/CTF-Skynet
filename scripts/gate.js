  // Extension point: swap this for the real puzzle answer once one is designed.
  const ACCESS_PHRASE = "no fate";

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

  gate.addEventListener("submit", e => {
    e.preventDefault();
    const answer = input.value.trim().toLowerCase();
    row.classList.remove("shake", "ok");

    if (answer && answer === ACCESS_PHRASE) {
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
