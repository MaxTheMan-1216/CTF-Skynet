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
  let booted = false;
  function beginBoot() {
    if (booted) return;
    booted = true;
    gateScreen.classList.add("play");
    gateAudio.play().catch(() => {});
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
