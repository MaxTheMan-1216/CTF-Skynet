  // x/y are ball centers in the skull artwork's 1600x1557 viewBox; each node's
  // visual is the matching #ball-<id> group inside the inline SVG.
  const MAP_W = 1600, MAP_H = 1557;
  const NODES = [
    { id: "n1", x: 1401, y: 229, status: "cleared", label: "NODE_01", title: "NODE_01",
      body: "Segment neutralized. Puzzle type and write-up go here once the challenge is designed." },
    { id: "n2", x: 1028, y: 436, status: "cleared", label: "NODE_02", title: "NODE_02",
      body: "Segment neutralized. Puzzle type and write-up go here once the challenge is designed." },
    { id: "n3", x: 966, y: 650, status: "current", label: "NODE_03", title: "NODE_03",
      body: "Encryption on this segment is live — the right ocular array is watching. This is where a real challenge — and its flag check — will sit; the box below is a placeholder for that interaction, not a working validator yet." },
    { id: "n4", x: 1171, y: 1370, status: "locked", label: "NODE_04", title: "NODE_04",
      body: "Route not yet established. Clearing NODE_03 should be what unlocks this segment." },
    { id: "n5", x: 851, y: 1461, status: "locked", label: "NODE_05", title: "NODE_05",
      body: "Route not yet established." },
    { id: "n6", x: 161, y: 966, status: "locked", label: "NODE_06", title: "NODE_06",
      body: "Route not yet established." },
    { id: "n7", x: 160, y: 616, status: "locked", label: "CORE", title: "CORE — MAINFRAME", core: true,
      body: "The network's root process. Intended as the final challenge — clearing every prior node should be what exposes it." },
    { id: "b1", x: 554, y: 648, status: "bonus", label: "??", title: "UNKNOWN SIGNAL", bonus: true,
      body: "An anomalous return in the left ocular array. Reserved for an optional / bonus objective, if one gets designed." }
  ];

  const BONUS_ROUTES = [["n2","b1"]];

  const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
  const nodesEl = document.getElementById("nodes");
  const listEl = document.getElementById("list");
  const briefingEl = document.getElementById("briefing");

  // tint each artwork ball with its node's status
  NODES.forEach(n => {
    const g = document.getElementById("ball-" + n.id);
    if (g) g.classList.add(n.status);
  });

  function statusLabel(s) {
    return { cleared: "Cleared", current: "Active — Awaiting Input", locked: "Locked", bonus: "Hidden" }[s];
  }

  NODES.forEach((n, i) => {
    const wrap = document.createElement("div");
    wrap.style.position = "absolute";
    wrap.style.left = (n.x / MAP_W * 100) + "%";
    wrap.style.top = (n.y / MAP_H * 100) + "%";
    wrap.style.setProperty("--i", i);

    const btn = document.createElement("div");
    btn.className = "node " + n.status + (n.core ? " core" : "") + (n.bonus ? " bonus" : "");
    btn.style.left = "0px";
    btn.style.top = "0px";
    if (n.status === "current" || n.status === "cleared" || n.status === "bonus") {
      btn.tabIndex = 0;
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", n.title + " — " + statusLabel(n.status));
      btn.addEventListener("click", () => selectNode(n.id));
      btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectNode(n.id); } });
    }
    btn.dataset.id = n.id;

    const label = document.createElement("div");
    label.className = "node-label";
    label.textContent = n.label;

    wrap.appendChild(btn);
    wrap.appendChild(label);
    nodesEl.appendChild(wrap);
  });

  function makeListItem(n, showStem, i) {
    const tappable = n.status === "current" || n.status === "cleared" || n.status === "bonus";
    const el = document.createElement(tappable ? "button" : "div");
    if (tappable) { el.type = "button"; el.dataset.tap = "true"; }
    el.className = "list-item " + n.status + (n.core ? " core" : "") + (n.bonus ? " bonus" : "");
    el.dataset.id = n.id;
    el.style.setProperty("--i", i);
    el.innerHTML = (showStem ? '<span class="stem"></span>' : "") +
      '<span class="list-dot"><span class="dot"></span></span>' +
      '<span class="list-main">' +
        '<span class="list-label">' + n.label + '</span>' +
        '<span class="list-status">' + statusLabel(n.status) + '</span>' +
      '</span>';
    if (tappable) {
      el.addEventListener("click", () => selectNode(n.id));
    }
    return el;
  }

  function buildList() {
    const mainOrder = NODES.filter(n => !n.bonus);
    const bonusAfter = {};
    BONUS_ROUTES.forEach(([from, to]) => {
      (bonusAfter[from] = bonusAfter[from] || []).push(byId[to]);
    });

    let i = 0;
    mainOrder.forEach((n, idx) => {
      listEl.appendChild(makeListItem(n, idx < mainOrder.length - 1, i++));
      (bonusAfter[n.id] || []).forEach(b => listEl.appendChild(makeListItem(b, false, i++)));
    });
  }
  buildList();

  function renderBriefing(n) {
    briefingEl.innerHTML = "";

    const head = document.createElement("div");
    head.className = "briefing-head";
    head.innerHTML = `<div class="briefing-id">${n.title}</div>
      <div class="status-pill ${n.status}">${statusLabel(n.status)}</div>`;

    const body = document.createElement("div");
    body.className = "briefing-body";
    body.innerHTML = `<p>${n.body}</p>`;

    briefingEl.appendChild(head);
    briefingEl.appendChild(body);

    if (n.status === "locked") {
      const note = document.createElement("div");
      note.className = "briefing-note";
      note.textContent = "PUZZLE BRIEFING: not yet drafted.";
      briefingEl.appendChild(note);
    }

    if (n.status === "current") {
      const demo = document.createElement("div");
      demo.className = "flag-demo";
      demo.innerHTML = `
        <div class="label">Flag Submission — UI preview only</div>
        <div class="flag-row">
          <input type="text" placeholder="flag{...}" aria-label="Flag input" autocomplete="off" spellcheck="false" />
          <button type="button">Submit</button>
        </div>
        <div class="flag-msg"></div>`;
      const input = demo.querySelector("input");
      const msg = demo.querySelector(".flag-msg");
      demo.querySelector("button").addEventListener("click", () => {
        msg.textContent = input.value.trim()
          ? "// validation endpoint not wired yet — nothing checked."
          : "// enter something to see this state.";
      });
      briefingEl.appendChild(demo);
    }
  }

  function selectNode(id) {
    document.querySelectorAll(".node, .list-item").forEach(el => el.classList.toggle("selected", el.dataset.id === id));
    renderBriefing(byId[id]);
  }

  const clearedCount = NODES.filter(n => n.status === "cleared").length;
  const totalMain = NODES.filter(n => !n.bonus).length;
  document.getElementById("stat-cleared").textContent = clearedCount + " / " + totalMain;

  const startNode = NODES.find(n => n.status === "current") || NODES[0];
  selectNode(startNode.id);

  function tick() {
    const now = new Date();
    document.getElementById("stat-clock").textContent = now.toTimeString().slice(0, 8);
  }
  tick();
  setInterval(tick, 1000);

  const bootAt = Date.now();
  setInterval(() => {
    const s = Math.floor((Date.now() - bootAt) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    document.getElementById("stat-elapsed").textContent = `${h}:${m}:${sec}`;
  }, 1000);

  // ---------- ambient audio ----------
  const audioEl = document.getElementById("theme-audio");
  const audioToggle = document.getElementById("audio-toggle");
  const audioState = document.getElementById("audio-state");
  let userToggled = false;

  function syncAudioLabel() {
    audioState.textContent = audioEl.paused ? "OFF" : "ON";
    audioState.classList.toggle("signal", !audioEl.paused);
  }
  audioEl.addEventListener("play", syncAudioLabel);
  audioEl.addEventListener("pause", syncAudioLabel);

  audioToggle.addEventListener("click", () => {
    userToggled = true;
    if (audioEl.paused) audioEl.play().catch(() => {});
    else audioEl.pause();
  });

  // ---------- initialize gate ----------
  // Mirrors the landing page: nodes/list stay hidden and the overlay stays up
  // until the first click/keypress anywhere, then the stagger-reveal (driven
  // by the .play class + each item's --i, set above) and audio fire together.
  // Same race-guard as before: if that first click is the audio button itself,
  // its handler (above) runs first and sets userToggled — checked here, not
  // earlier, so it's caught within the same synchronous event dispatch.
  const mainEl = document.querySelector("main");
  let initialized = false;
  function initConsole() {
    if (initialized) return;
    initialized = true;
    mainEl.classList.add("play");
    if (!userToggled) audioEl.play().catch(() => {});
  }
  document.addEventListener("click", initConsole, { once: true });
  document.addEventListener("keydown", initConsole, { once: true });
