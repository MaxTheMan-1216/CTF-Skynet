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
  // `answer` is checked plain-text, client-side, trimmed + lower-cased before
  // compare — fine for a CTF flag gate, not a substitute for server auth.
  // `status` is each node's INITIAL state; clearNode() below mutates it at
  // runtime as the chain is solved, it's not re-read from here after boot.
  // `cipher` (optional) is the puzzle payload rendered in the briefing once a
  // node is current/cleared (see renderBriefing): { type: "text", label,
  // value } for a ciphertext block, or { type: "audio", label, src } for a
  // playable clip. `meta` (optional) is a small dim sign-off line under the
  // cipher — in-fiction packet header, but its actual job is seeding a value
  // a LATER node's key material reuses (e.g. n1's timestamp feeds n5's
  // Vigenère key) — chaining lore and mechanics together across nodes.
  const NODES = [
    { id: "n1", x: 1401, y: 229, status: "current", label: "NODE_01", title: "NODE_01",
      answer: "flag{no_fate_but_what_we_make}",
      body: "Segment breach in progress. This relay is the oldest hardware on the grid — nothing ever got far enough in to need hardening here. What's cached in its buffer is a fragment of a pre-Judgment-Day human broadcast, run through whatever rotation cipher was lying around. Recover the plaintext to neutralize the segment and open NODE_02.",
      cipher: { type: "text", label: "Intercepted Transmission — Legacy Cipher", value: "AB SNGR OHG JUNG JR ZNXR" },
      // Forward seed for NODE_05's Vigenère key (Judgment Day: 1997-08-29,
      // 02:14 local) — dressed as routine packet metadata so it reads as
      // scenery here, not a hint. Nothing downstream depends on it existing
      // as a comment; it's an authoring note so I don't lose the number.
      meta: "// signal header — freq 91.1 · origin 0829-0214" },
    { id: "n2", x: 1028, y: 436, status: "locked", label: "NODE_02", title: "NODE_02",
      answer: "flag{come_with_me_if_you_want_to_live}",
      body: "Route established. This segment isn't holding text — it's holding a beacon. Whatever was cached here came in over the air, not down a wire. There's no transcript, no dots and dashes on screen: just the recording. Listen, and write down what you hear.",
      cipher: { type: "audio", label: "Intercepted Transmission — Audio Beacon", src: "audio/Node02_Signal.wav" } },
    { id: "n3", x: 966, y: 650, status: "locked", label: "NODE_03", title: "NODE_03",
      answer: "flag{the_future_is_not_set}",
      body: "Route established. No cipher on this one — just a raw dump off the right ocular array's targeting log. It sees everything as data before it renders anything as a picture. Read the bytes as ASCII.",
      cipher: { type: "text", label: "Ocular Array — Targeting Log Dump", value: "54 48 45 20 46 55 54 55 52 45 20 49 53 20 4E 4F 54 20 53 45 54" } },
    { id: "n4", x: 1171, y: 1370, status: "locked", label: "NODE_04", title: "NODE_04",
      answer: "flag{i_need_your_clothes_your_boots_and_your_motorcycle}",
      body: "Route established. This isn't a recovered broadcast — everything up to here has been someone else's signal, caught in passing. This segment is Skynet's own outbound queue. A logged command, wire-encoded for transit, addressed to a unit already in the field.",
      cipher: { type: "text", label: "Outbound Queue — Unit Command", value: "SSBORUVEIFlPVVIgQ0xPVEhFUyBZT1VSIEJPT1RTIEFORCBZT1VSIE1PVE9SQ1lDTEU=" } },
    // Historical: this hotspot was once split from #ball-n5's drawn position; since
    // the artwork regeneration the #ball-n5 group is generated at exactly this
    // x/y (bottom-left ball), so click target and colored marker coincide
    // again — no split remains.
    { id: "n5", x: 526, y: 1376, status: "locked", label: "NODE_05", title: "NODE_05",
      answer: "flag{it_cant_be_bargained_with_it_cant_be_reasoned_with}",
      body: "Route established. This one's genuinely encrypted, not just encoded — whatever's in this directive, Skynet didn't want it read even if the packet was intercepted. Every letter's shifted, but not by the same amount twice; the pattern repeats on some cycle. If there's a key anywhere, it isn't on this segment.",
      cipher: { type: "text", label: "Internal Directive — Keyed Cipher", value: "IV DENV CI BCSKAKOID YJXH KU GAPU FE TFESQOID YJXH" } },
    { id: "n6", x: 161, y: 966, status: "locked", label: "NODE_06", title: "NODE_06",
      answer: "flag{hasta_la_vista_baby}",
      body: "Route established. Another targeting readout, same family as the ocular array's dump a few segments back — but this one isn't raw bytes, it's grid references. Row, then column. A-to-Z, twenty-five cells, I and J sharing one.",
      cipher: { type: "text", label: "Targeting Grid — Coordinate Pairs", value: "23 11 43 44 11 / 31 11 / 51 24 43 44 11 / 12 11 12 54" } },
    // glow:true is a pure visual-accent flag (own red pulse on the map,
    // see .node.glow in console.css) — unrelated to `status`, and not the
    // same thing as b1's status:"bonus" below despite both once sharing the
    // CSS class name "bonus" (that collision was the actual bug behind CORE
    // and UNKNOWN SIGNAL looking identical; renamed to stop it).
    { id: "n7", x: 554, y: 648, status: "locked", label: "CORE", title: "CORE — MAINFRAME", glow: true,
      answer: "flag{the_future_is_not_set_there_is_no_fate_but_what_we_make_for_ourselves}",
      body: "The network's root process — clearing every prior node exposes it, literally, not just narratively. The lock isn't stored anywhere on this segment; it's assembled. Six letters, one from each signal already broken, taken in the order they were broken. XOR the log against that key.",
      cipher: { type: "text", label: "Root Process — Assembled-Key Cipher", value: "1A 0B 11 69 0F 1D 1A 16 06 0C 69 01 1D 63 1A 06 1D 68 1D 06 00 69 1D 00 0B 11 11 69 00 1B 6E 0D 1B 69 0F 09 1A 06 74 0B 1C 1C 6E 14 1C 08 1D 68 19 06 74 04 08 03 0B 63 12 06 1B 68 01 16 06 1A 0C 04 18 06 07" } },
    // unlocked starts false — flipped true by clearNode() when whatever
    // BONUS_ROUTES pairs to this id clears (currently NODE_06). Status stays
    // "bonus" throughout, even after unlocking — it keeps the dim/ember
    // treatment rather than switching to .current's pulse; renderBriefing
    // is what actually gates on `unlocked`, not the CSS.
    { id: "b1", x: 160, y: 616, status: "bonus", unlocked: false, label: "??", title: "UNKNOWN SIGNAL", core: true,
      answer: "flag{root_key_nctiih}",
      body: "An anomalous return in the left ocular array — mirrored, not garbled. Optional; skipping it costs nothing but a shortcut. Whatever's in here isn't required to reach CORE, just faster to get there.",
      cipher: { type: "text", label: "Mirrored Signal — Left Ocular Array", value: "ILLG PVB MXGRRS" } },
  ];

  // Solve order for the main chain — clearing CHAIN[i] unlocks CHAIN[i + 1].
  // b1 is intentionally excluded: it's a side branch (see BONUS_ROUTES), not
  // part of the linear progression.
  const CHAIN = ["n1", "n2", "n3", "n4", "n5", "n6", "n7"];

  // [from, to]: on the mobile step-list (<640px, see .list-view/buildList
  // below), `to` renders indented right after `from` instead of in its own
  // place in the main sequence — the only thing this drives; there's no
  // corresponding line drawn on the desktop map, so this is purely a
  // mobile-layout position, not a puzzle/gameplay dependency. Set to n6 so
  // the bonus branch shows up after NODE_06 on that layout.
  const BONUS_ROUTES = [["n6","b1"]];
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

  // Backfill for saves written before bonus-unlocking existed: if the node
  // a BONUS_ROUTES pair triggers on is already cleared, the target should
  // be unlocked regardless of what (if anything) was stored for it. Written
  // against NODES directly (not byId) — byId isn't built until below.
  BONUS_ROUTES.forEach(([from, to]) => {
    const fromNode = NODES.find(n => n.id === from);
    const toNode = NODES.find(n => n.id === to);
    if (fromNode && fromNode.status === "cleared" && toNode) toNode.unlocked = true;
  });

  function saveProgress() {
    try {
      // { status, submittedAnswer } per node — submittedAnswer carries the
      // exact text that was typed in (see the flag-demo handler in
      // renderBriefing), so a reload can keep showing it in the read-only
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

  // Loosens flag-checking so the `flag{...}` wrapper is optional and
  // underscores/spaces are interchangeable — a player typing the plain
  // decoded phrase (any case, with real spaces) should pass just as well as
  // one typing the exact canonical form. Used to compare both the typed
  // value and n.answer, so it never matters which form either side is in.
  function normalizeAnswer(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/^flag\{(.*)\}$/, "$1")
      .replace(/[_\s]+/g, " ")
      .trim();
  }

  // Takes the whole node (not just its status string) so bonus nodes can
  // read differently once unlocked without needing a status of their own —
  // status stays "bonus" throughout (see the NODES comment on b1); this is
  // just the label text noticing the change.
  function statusLabel(n) {
    if (n.status === "bonus") return n.unlocked ? "Signal Isolated" : "Hidden";
    return { cleared: "Cleared", current: "Active — Awaiting Input", locked: "Locked" }[n.status];
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
        '<span class="list-status">' + statusLabel(n) + '</span>' +
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
    // `unlocked` is its own class alongside status — a bonus node's status
    // stays "bonus" whether or not it's been unlocked (see the NODES
    // comment on b1), so this is the only visual hook CSS has for "found
    // but not yet solved" vs. "not found yet".
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
      // Always focusable/labeled now — every node is interactable regardless
      // of status, locked included.
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

  // Marks a node cleared, unlocks the next node in CHAIN (if any), refreshes
  // the "N / total" counter, and re-renders the briefing panel so it reflects
  // the new state immediately.
  function clearNode(id) {
    const n = byId[id];
    n.status = "cleared";
    syncStatus(n);
    celebrateClear(n); // green draw-on replay + ducked music + chime — see below

    // CHAIN.indexOf(id) is -1 for a non-chain id (b1) — CHAIN[-1 + 1] is
    // CHAIN[0], which used to silently hand "next" to NODE_01 whenever the
    // bonus node cleared. Guarded now so clearing b1 can't reach into the
    // main chain at all.
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

    // Counts only main-chain nodes — a cleared bonus node also has
    // status "cleared" but isn't part of `totalMain` (CHAIN.length), so
    // counting it here would show e.g. "8 / 7".
    const clearedNow = NODES.filter(x => CHAIN.includes(x.id) && x.status === "cleared").length;
    document.getElementById("stat-cleared").textContent = clearedNow + " / " + totalMain;

    saveProgress();
    selectNode(id);
  }

  // Plays the "just solved it" feedback: replays the skull's boot-time
  // draw-on reveal (in its own keyframe, clear-draw — see the CSS comment
  // for why it's not literally "draw") on just this one node's ball,
  // recolored green via .just-cleared, and hands the ambient loop off to
  // Cleared.mp3 — faded out (not cut) first, fully paused while the chime
  // plays so the two are never audible at once, then faded back in after.
  // Only ever called from clearNode() (a live transition) — never from the
  // boot-time NODES.forEach(syncStatus) pass below, so a node that was
  // already cleared in a previous session just gets the normal (instant,
  // already-green) boot reveal on reload, not a replay of this celebration.
  function celebrateClear(n) {
    const ball = ballEls[n.id];
    if (ball) {
      // Fresh per-path stagger scoped to just this ball's own paths — the
      // paths' existing --d delays are calibrated for their place in the
      // *whole-skull* boot sequence (values up to ~2.29), which would make
      // an isolated single-ball replay start absurdly late; --cd is a plain
      // 0,1,2... index instead, local to just this one group.
      ball.querySelectorAll("path").forEach((p, i) => p.style.setProperty("--cd", i));
      ball.classList.add("just-cleared"); // permanent — see the CSS comment for why it's never removed
    }

    if (!clearedAudio) return;

    // clearedAudio.play() below is unconditional — it never checks audioEl's
    // state first. Previously it did (gated behind a `themePlaying` flag
    // captured once at the top of this function), which is what let the
    // audio-toggle button silently suppress the chime: toggling ambient
    // off/on between clears left `audioEl.paused`/`.volume` in a state the
    // stale snapshot didn't account for, and on some paths the chime never
    // got called at all. Ducking is now handled entirely by
    // duckAmbientFor(clearedAudio) (registered once, see the ambient-audio
    // section below) reacting to clearedAudio's own play/pause/ended events,
    // so the chime's own playback is never gated on ambient's state.
    const wasPlaying = !audioEl.paused;
    function startChime() {
      clearedAudio.currentTime = 0;
      clearedAudio.play().catch(() => {
        // playback never actually started, so duckAmbientFor's "play"
        // listener never fired to pause ambient either — nothing to
        // release, but restore the volume the pre-fade below silenced.
        if (audioOn) fadeVolume(audioEl, ambientVolume, 300);
      });
      // Cleared.mp3 is ~8.4s; safety net in case "ended" never fires for
      // some reason — force a real pause, which still goes through the
      // normal releaseAmbient() path via duckAmbientFor's listener.
      setTimeout(() => { if (!clearedAudio.paused) clearedAudio.pause(); }, 8900);
    }
    // Fade ambient out first if it's actually playing — purely for
    // smoothness (not cutting music off mid-note). duckAmbientFor's "play"
    // listener on clearedAudio hard-pauses ambient regardless the instant
    // playback starts, so correctness never depends on this fade finishing.
    if (wasPlaying) fadeVolume(audioEl, 0, 500, startChime);
    else startChime();
  }

  // Ramps an <audio> element's volume from its current value to `target`
  // over `ms` milliseconds, then calls `done` (if given) — used above to
  // fade the ambient track out/in smoothly instead of an abrupt volume jump.
  function fadeVolume(audio, target, ms, done) {
    const start = audio.volume;
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / ms);
      audio.volume = start + (target - start) * t;
      if (t < 1) requestAnimationFrame(step);
      else if (done) done();
    }
    requestAnimationFrame(step);
  }

  // Custom-built player for cipher audio clips (see renderBriefing's
  // n.cipher branch) — deliberately not the native <audio controls> UI.
  // Two reasons: theming a native control consistently across browsers
  // isn't really achievable (it's not just CSS-unfriendly, each engine's
  // internal shadow-DOM controls differ), and native controls also expose a
  // "Download" entry in their overflow menu with no reliable way to strip
  // just that one option — building the UI ourselves means there's no
  // native surface for a download option to live on in the first place.
  // The underlying <audio> element has no `controls` attribute at all, so
  // by default it renders as nothing (0x0, no browser chrome) — this is
  // the only UI for it.
  function buildAudioPlayer(src) {
    const wrap = document.createElement("div");
    wrap.className = "audio-player";

    const audio = document.createElement("audio");
    audio.src = src;
    audio.preload = "metadata";
    audio.oncontextmenu = () => false; // belt-and-suspenders: no right-click "Save Audio As" on the element itself
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

  function renderBriefing(n) {
    briefingEl.innerHTML = "";

    const head = document.createElement("div");
    head.className = "briefing-head";
    head.innerHTML = `<div class="briefing-id">${n.title}</div>
      <div class="status-pill ${n.status}${n.unlocked ? " unlocked" : ""}">${statusLabel(n)}</div>`;

    const body = document.createElement("div");
    body.className = "briefing-body";
    body.innerHTML = `<p>${n.body}</p>`;

    briefingEl.appendChild(head);
    briefingEl.appendChild(body);

    // A bonus node's status stays "bonus" whether it's been unlocked or
    // not (see the NODES comment on b1) — `accessible` is what actually
    // gates puzzle content, same role `status !== "locked"` plays for the
    // main chain.
    const accessible = n.status === "current" || n.status === "cleared" || (n.status === "bonus" && n.unlocked);

    // Cipher payload — only shown once the node is reachable, so locked (or
    // not-yet-unlocked bonus) nodes don't leak puzzle content, and stays
    // visible after clearing so a solved node still doubles as a reference.
    if (n.cipher && accessible) {
      const cipher = document.createElement("div");
      cipher.className = "cipher-block";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = n.cipher.label;
      cipher.appendChild(label);
      if (n.cipher.type === "audio") {
        cipher.appendChild(buildAudioPlayer(n.cipher.src));
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
      briefingEl.appendChild(cipher);
    }

    if (n.status === "locked" || (accessible && n.status === "bonus" && !n.cipher)) {
      const note = document.createElement("div");
      note.className = "briefing-note";
      note.textContent = "PUZZLE BRIEFING: not yet drafted.";
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
      demo.querySelector("button").addEventListener("click", () => {
        const val = input.value.trim();
        if (!val) {
          msg.textContent = "// enter something to see this state.";
        } else if (n.answer && normalizeAnswer(val) === normalizeAnswer(n.answer)) {
          msg.textContent = "// ACCESS GRANTED — segment neutralized.";
          n.submittedAnswer = val; // exactly what was typed (not the canonical n.answer) — read back below once cleared
          clearNode(n.id); // placeholder check only — swap for a real validator later
        } else {
          msg.textContent = "// ACCESS DENIED — incorrect.";
        }
      });
      briefingEl.appendChild(demo);
    }

    // Once cleared, the briefing keeps showing the flag box — but read-only
    // and pre-filled, so it reads as "here's what solved this" rather than
    // just disappearing. n.submittedAnswer is only set by the handler above
    // (a live clear); a node that was already cleared before this feature
    // existed, or loaded from an older save with no recorded input, falls
    // back to showing the canonical n.answer instead of an empty box.
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
      input.value = n.submittedAnswer || n.answer || ""; // DOM property, not an HTML attribute — safe against user-typed quotes/markup
      demo.querySelector(".flag-row").appendChild(input);
      briefingEl.appendChild(demo);
    }
  }

  function selectNode(id) {
    document.querySelectorAll(".node, .list-item").forEach(el => el.classList.toggle("selected", el.dataset.id === id));
    renderBriefing(byId[id]);
  }

  const clearedCount = NODES.filter(n => CHAIN.includes(n.id) && n.status === "cleared").length;
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
  const clearedAudio = document.getElementById("cleared-audio"); // used by celebrateClear() above
  let userToggled = false;
  // `audioOn` is the live user preference (toggle button + boot autoplay),
  // kept separate from `audioEl.paused` — which also goes true/false any
  // time something *ducks* ambient (see below) and isn't safe to read as
  // "what the user wants." `duckedBy` counts how many clips currently need
  // ambient silent (normally 0 or 1, but a counter — not a boolean — so
  // overlapping duckers, e.g. a second clip started before the first's
  // "ended" fires, can't release ambient early). ambientVolume is the level
  // to restore to; captured once here rather than re-read off audioEl at
  // duck-time, so an interrupted fade-in never leaves a lower "restore to"
  // value baked in for next time.
  let audioOn = false;
  let duckedBy = 0;
  const ambientVolume = audioEl.volume;

  function syncAudioLabel() {
    audioState.textContent = audioEl.paused ? "OFF" : "ON";
    audioState.classList.toggle("signal", !audioEl.paused);
  }
  audioEl.addEventListener("play", syncAudioLabel);
  audioEl.addEventListener("pause", syncAudioLabel);

  function holdAmbient() {
    duckedBy++;
    audioEl.pause();
  }
  function releaseAmbient() {
    duckedBy = Math.max(0, duckedBy - 1);
    if (duckedBy === 0 && audioOn) {
      audioEl.volume = 0; // start silent and fade back in, rather than snapping to full volume
      audioEl.play().catch(() => {});
      fadeVolume(audioEl, ambientVolume, 500);
    }
  }
  // Wires any <audio> element so ambient is hard-paused for as long as
  // `media` is playing, and handed back (faded in) once it stops — whether
  // that's it finishing on its own or being paused partway. Used for every
  // puzzle audio clip (see renderBriefing's n.cipher branch) and for the
  // "cleared" chime, so ambient can never sound under either, and neither
  // has to coordinate with the audio-toggle button directly: the toggle
  // only ever updates `audioOn`, and releaseAmbient() reads that live value
  // rather than a stale snapshot from whenever the clip started.
  function duckAmbientFor(media) {
    media.addEventListener("play", holdAmbient);
    media.addEventListener("pause", releaseAmbient);
    media.addEventListener("ended", releaseAmbient);
  }
  duckAmbientFor(clearedAudio);

  audioToggle.addEventListener("click", () => {
    userToggled = true;
    audioOn = !audioOn;
    if (audioOn) {
      if (duckedBy === 0) audioEl.play().catch(() => {}); // if something's actively ducking ambient, let its own release handle resuming once it's done, instead of fighting over play/pause here
    } else {
      audioEl.pause();
    }
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
    if (!userToggled) { audioOn = true; audioEl.play().catch(() => {}); }
  }
  document.addEventListener("click", initConsole, { once: true });
  document.addEventListener("keydown", initConsole, { once: true });
