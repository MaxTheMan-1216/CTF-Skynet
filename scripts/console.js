  // x/y are ball centers in the skull artwork's raw 1600x1557 coordinate
  // space; each node's visual is the matching #ball-<id> group inside the
  // inline SVG. The artwork's actual drawn geometry only fills a fraction of
  // that raw space (content bounding box was x:[117,1595] y:[57,1500] — real
  // dead space on every side, worst on the left), which is why it read both
  // off-center and too small inside .map. #skull-art's viewBox is cropped
  // down to that content box (+20px padding) rather than the full raw
  // canvas, in console.html — no path or ball coordinate moves, only the
  // visible *window* onto them shrinks. VIEW_X/VIEW_Y/MAP_W/MAP_H mirror that
  // same window here, since the invisible hotspot overlays are positioned as
  // % of .map (not inside the SVG) and have to track it independently.
  const VIEW_X = 97, VIEW_Y = 37;
  const MAP_W = 1518, MAP_H = 1483;
  // `answer` is a placeholder check only (plain-text, client-side, trimmed +
  // lower-cased before compare) — swap in real puzzles/validation later.
  // `status` is each node's INITIAL state; clearNode() below mutates it at
  // runtime as the chain is solved, it's not re-read from here after boot.
  const NODES = [
    { id: "n1", x: 1401, y: 229, status: "current", label: "NODE_01", title: "NODE_01",
      answer: "flag{node_01}",
      body: "Segment breach in progress. Placeholder challenge — enter the placeholder flag below to clear it and unlock NODE_02." },
    { id: "n2", x: 1028, y: 436, status: "locked", label: "NODE_02", title: "NODE_02",
      answer: "flag{node_02}",
      body: "Route not yet established. Clearing NODE_01 unlocks this segment." },
    { id: "n3", x: 966, y: 650, status: "locked", label: "NODE_03", title: "NODE_03",
      answer: "flag{node_03}",
      body: "Encryption on this segment is live — the right ocular array is watching. This is where a real challenge — and its flag check — will sit." },
    { id: "n4", x: 1171, y: 1370, status: "locked", label: "NODE_04", title: "NODE_04",
      answer: "flag{node_04}",
      body: "Route not yet established. Clearing NODE_03 unlocks this segment." },
    { id: "n5", x: 851, y: 1461, status: "locked", label: "NODE_05", title: "NODE_05",
      answer: "flag{node_05}",
      body: "Route not yet established." },
    { id: "n6", x: 161, y: 966, status: "locked", label: "NODE_06", title: "NODE_06",
      answer: "flag{node_06}",
      body: "Route not yet established." },
    // glow:true is a pure visual-accent flag (own red pulse on the map,
    // see .node.glow in console.css) — unrelated to `status`, and not the
    // same thing as b1's status:"bonus" below despite both once sharing the
    // CSS class name "bonus" (that collision was the actual bug behind CORE
    // and UNKNOWN SIGNAL looking identical; renamed to stop it).
    { id: "n7", x: 554, y: 648, status: "locked", label: "CORE", title: "CORE — MAINFRAME", glow: true,
      answer: "flag{core}",
      body: "The network's root process. Intended as the final challenge — clearing every prior node exposes it." },
    { id: "b1", x: 160, y: 616, status: "bonus", label: "??", title: "UNKNOWN SIGNAL", core: true,
      body: "An anomalous return in the left ocular array. Reserved for an optional / bonus objective, if one gets designed." },
  ];

  // Solve order for the main chain — clearing CHAIN[i] unlocks CHAIN[i + 1].
  // b1 is intentionally excluded: it's a side branch (see BONUS_ROUTES), not
  // part of the linear progression.
  const CHAIN = ["n1", "n2", "n3", "n4", "n5", "n6", "n7"];

  const BONUS_ROUTES = [["n2","b1"]];
  const STATUS_CLASSES = ["cleared", "current", "locked", "bonus"];

  // ---------- session retention ----------
  // Progress (each node's status) is saved to localStorage so a reload picks
  // up where the player left off instead of resetting to NODE_01. localStorage
  // (not sessionStorage) on purpose: it survives closing the tab/browser, not
  // just this visit — matches "the player's session is saved", not "saved for
  // this one tab". Everything here is wrapped in try/catch: storage can throw
  // (private browsing, disabled storage, quota) and a failure here should
  // just mean "progress doesn't persist", never break the rest of the page.
  const STORAGE_KEY = "skynet:progress";

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      NODES.forEach(n => {
        if (STATUS_CLASSES.includes(saved[n.id])) n.status = saved[n.id];
      });
    } catch (err) {
      // ignore — falls back to each node's coded-in default status
    }
  }
  loadProgress(); // must run before any DOM is built below, so first render reflects it

  function saveProgress() {
    try {
      const state = Object.fromEntries(NODES.map(n => [n.id, n.status]));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // ignore — this session just won't persist
    }
  }

  // ---------- DEV ONLY: reset progress ----------
  // Testing aid — remove this whole block plus the #reset-progress button
  // (console.html) and its .hud-reset rules (console.css) once the site
  // goes live; requested as a temporary, not permanent, feature. Clearing
  // the saved state and reloading is enough to get back to node 1 — no
  // need to duplicate NODES' coded-in defaults here, loadProgress() above
  // just won't find anything to override them with.
  const resetBtn = document.getElementById("reset-progress");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Reset all node progress? This can't be undone.")) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
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

  function statusLabel(s) {
    return { cleared: "Cleared", current: "Active — Awaiting Input", locked: "Locked", bonus: "Hidden" }[s];
  }

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
    // Every node is clickable regardless of status now — locked ones just
    // show their (unclearable) briefing instead of a flag box; see
    // renderBriefing's status==="locked" branch. No live status guard needed
    // here anymore.
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

  function makeListItem(n, showStem, i) {
    // Every node is tappable regardless of status now — always a real
    // <button>, not conditionally a plain <div> for locked ones.
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
        '<span class="list-status">' + statusLabel(n.status) + '</span>' +
      '</span>';
    el.addEventListener("click", () => selectNode(n.id));
    return el;
  }

  function buildList() {
    // mainOrder used to be NODES.filter(n => !n.bonus) — that read n7's old
    // visual-accent flag (see the note by NODES above), which only
    // coincidentally shared its name with this concept. It excluded n7
    // (CORE) from the list entirely, while b1 — which has no bonus:true
    // property at all, only status:"bonus" — was never excluded and ended
    // up rendered twice (once here, once via bonusAfter below). Deriving the
    // exclusion from BONUS_ROUTES' own targets is what this filter actually
    // means: "skip nodes reached via a side branch, they're inserted below
    // instead" — fixes both bugs at once.
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

  // Restyles the ball/node-dot/list-item for one node from its current
  // n.status — the single place all three DOM views get kept in sync,
  // called once for every node at boot and again from clearNode() below.
  function syncStatus(n) {
    const ball = ballEls[n.id];
    if (ball) {
      STATUS_CLASSES.forEach(c => ball.classList.remove(c));
      ball.classList.add(n.status);
    }

    const btn = nodeEls[n.id];
    if (btn) {
      btn.className = "node " + n.status + (n.core ? " core" : "") + (n.glow ? " glow" : "");
      // Always focusable/labeled now — every node is interactable regardless
      // of status, locked included.
      btn.tabIndex = 0;
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", n.title + " — " + statusLabel(n.status));
    }

    const item = listEls[n.id];
    if (item) {
      item.className = "list-item " + n.status + (n.core ? " core" : "") + (n.glow ? " glow" : "");
      const label = item.querySelector(".list-status");
      if (label) label.textContent = statusLabel(n.status);
    }
  }
  NODES.forEach(syncStatus);

  // Marks a node cleared, unlocks the next node in CHAIN (if any), refreshes
  // the "N / total" counter, and re-renders the briefing panel so it reflects
  // the new state immediately.
  function clearNode(id) {
    const n = byId[id];
    n.status = "cleared";
    syncStatus(n);

    const next = byId[CHAIN[CHAIN.indexOf(id) + 1]];
    if (next) {
      next.status = "current";
      syncStatus(next);
    }

    const clearedNow = NODES.filter(x => x.status === "cleared").length;
    document.getElementById("stat-cleared").textContent = clearedNow + " / " + totalMain;

    saveProgress();
    selectNode(id);
  }

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
        const val = input.value.trim();
        if (!val) {
          msg.textContent = "// enter something to see this state.";
        } else if (n.answer && val.toLowerCase() === n.answer.toLowerCase()) {
          msg.textContent = "// ACCESS GRANTED — segment neutralized.";
          clearNode(n.id); // placeholder check only — swap for a real validator later
        } else {
          msg.textContent = "// ACCESS DENIED — incorrect.";
        }
      });
      briefingEl.appendChild(demo);
    }
  }

  function selectNode(id) {
    document.querySelectorAll(".node, .list-item").forEach(el => el.classList.toggle("selected", el.dataset.id === id));
    renderBriefing(byId[id]);
  }

  const clearedCount = NODES.filter(n => n.status === "cleared").length;
  // CHAIN is already exactly "the main-chain node ids" (see its definition
  // above) — using it here instead of a bonus-flag filter means this counter
  // can't drift out of sync with what CHAIN/clearNode actually consider the
  // main chain, the way the old !n.bonus filter just did (see buildList's
  // comment for the story on that).
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
  function initConsole(e) {
    if (initialized) return;
    initialized = true;
    // Space/arrow keys/etc all have native scroll actions (Space = page
    // down); left un-prevented this fired invisibly for years because the
    // page was pinned to a fixed 100vh with clipped overflow, so there was
    // nowhere to scroll to. Fixing that clipping (see the 760px map rules)
    // finally made the browser's default action visible as an unwanted
    // jump-scroll right as the reveal starts — preventDefault stops it.
    if (e) e.preventDefault();
    mainEl.classList.add("play");
    if (!userToggled) audioEl.play().catch(() => {});
  }
  document.addEventListener("click", initConsole, { once: true });
  document.addEventListener("keydown", initConsole, { once: true });
