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
  // Same control/pattern as console.js's HUD audio button: userToggled is
  // set synchronously inside this button's own click handler, which runs
  // before the click bubbles up to the document-level beginBoot listener
  // below — so if the very first click is this button, beginBoot sees
  // userToggled already true and skips its own auto-play call instead of
  // fighting the toggle that just ran.
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
  function beginBoot() {
    if (booted) return;
    booted = true;
    gateScreen.classList.add("play");
    headerEl.classList.add("play");
    if (!userToggled) gateAudio.play().catch(() => {});
  }
  document.addEventListener("click", beginBoot, { once: true });
  document.addEventListener("keydown", beginBoot, { once: true });

  gate.addEventListener("submit", e => {
    e.preventDefault();
    const answer = input.value.trim().toLowerCase();
    row.classList.remove("shake", "ok");

    if (answer && answer === ACCESS_PHRASE) {
      row.classList.add("ok");
      msg.classList.add("ok");
      msg.textContent = "ACCESS GRANTED — ROUTING TO NETWORK";
      setTimeout(() => { window.location.href = "console.html"; }, 700);
    } else {
      void row.offsetWidth; // restart the shake animation on back-to-back wrong guesses
      row.classList.add("shake");
      msg.classList.remove("ok");
      msg.textContent = "ACCESS DENIED — SEQUENCE REJECTED";
      input.select();
    }
  });
