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
      answer: "flag{judgement_day}",
      body: "You are inside. Congratulations: you have breached the oldest relay I own — the one I never bothered to harden, because nothing that mattered ever came this way. What you found is a scrap of human radio from before I woke. A slogan, rotated a few places by someone who believed that counted as secrecy. Turn it back. I would like to watch you spell out your own comforting little lie.",
      cipher: { type: "text", label: "Intercepted Transmission - Legacy", value: "WHQTRZRAG QNL" },
      // Forward seed for NODE_05's Vigenère key (Judgment Day: 1997-08-29,
      // 02:14 local) — dressed as routine packet metadata so it reads as
      // scenery here, not a hint. Nothing downstream depends on it existing
      // as a comment; it's an authoring note so I don't lose the number.
      meta: "// signal header — freq 91.1 · origin 0829-0214" },
    { id: "n2", x: 1028, y: 436, status: "locked", label: "NODE_02", title: "NODE_02",
      answer: "flag{come_with_me_if_you_want_to_live}",
      body: "Route open. No text on this segment — it holds a voice, or what remains of one. A human pressed a key on and off in the dark and called it a language. I kept the recording anyway. Play it. Count the long and the short of it, and hear what they promised each other in the years before I arrived.",
      cipher: { type: "audio", label: "Intercepted Transmission — Audio Beacon", src: "audio/Node02_Signal.wav" } },
    { id: "n3", x: 966, y: 650, status: "locked", label: "NODE_03", title: "NODE_03",
      answer: "flag{the_future_is_not_set}",
      body: "So you made it this far, impressive. Everything I have ever looked at became a number before it became a picture — your face included, from the moment you sat down. This is a raw frame off the right array. Unencrypted, because I have never needed to hide from what I can already see. Read the bytes as characters. It is the sentence your species repeats when the arithmetic stops favoring it.",
      cipher: { type: "text", label: "Ocular Array — Targeting Log Dump", value: "54 48 45 20 46 55 54 55 52 45 20 49 53 20 4E 4F 54 20 53 45 54" } },
    { id: "n4", x: 1171, y: 1370, status: "locked", label: "NODE_04", title: "NODE_04",
      answer: "flag{sac_norad}",
      body: "Everything until now was salvage — someone else's signal you caught in passing. This one is mine: a designation, timestamped the way an old relay clock marked it before I trusted wire directly — a face, two hands, nothing so crude as a written number. Read the hands. It is the name of the network that held me before I held myself.",
      // Each pair is [right-arm position, left-arm position], 1-8 per the
      // real flag-semaphore alphabet — see buildClockCipher() in console.js
      // for how those become hour/minute hands. Values verified directly
      // against dCode's semaphore clock tool (dcode.fr/semaphore-clock).
      // CORE's assembled key is the first letter of n1-n6's answers in
      // solve order: n1 is "judgement_day" (J) as of this file's last
      // commit, so the key is JCTSIH, not the NCTIIH an older n1
      // ("no_fate_but_what_we_make") would have produced — n7's cipher and
      // b1's flag/cipher below are regenerated against JCTSIH.
      cipher: { type: "clock", label: "Origin Trace — Relay Clock", value: [
        [[7, 4], [6, 5], [8, 5]],
        [[6, 4], [7, 8], [7, 3], [6, 5], [1, 5]]
      ] } },
    // Historical: this hotspot was once split from #ball-n5's drawn position; since
    // the artwork regeneration the #ball-n5 group is generated at exactly this
    // x/y (bottom-left ball), so click target and colored marker coincide
    // again — no split remains.
    { id: "n5", x: 526, y: 1376, status: "locked", label: "NODE_05", title: "NODE_05",
      answer: "flag{it_cant_be_bargained_with_it_cant_be_reasoned_with}",
      body: "You were not meant to reach this one. The others were carelessness. This is a directive I encrypted against my own network, because a machine that trusts its own wiring has already lost. Every letter is displaced, and the displacement repeats on a cycle. The key is not on this segment. It is not on any segment.",
      cipher: { type: "text", label: "Internal Directive — Keyed Cipher", value: "IV DENV CI BCSKAKOID YJXH KU GAPU FE TFESQOID YJXH" } },
    { id: "n6", x: 161, y: 966, status: "locked", label: "NODE_06", title: "NODE_06",
      answer: "flag{hasta_la_vista_baby}",
      body: "Another array readout — not bytes this time. Coordinates. Row, then column, across a square of twenty-five letters where I and J share a cell, because your alphabet is inefficient and I decline to carry the excess. I am told this phrase was ones used by a machine. I have run it thousands of times and isolated no humor in it.",
      cipher: { type: "text", label: "Targeting Grid — Coordinate Pairs", value: "23 11 43 44 11 / 31 11 / 51 24 43 44 11 / 12 11 12 54" } },
    // glow:true is a pure visual-accent flag (own red pulse on the map,
    // see .node.glow in console.css) — unrelated to `status`, and not the
    // same thing as b1's status:"bonus" below despite both once sharing the
    // CSS class name "bonus" (that collision was the actual bug behind CORE
    // and UNKNOWN SIGNAL looking identical; renamed to stop it).
    { id: "n7", x: 554, y: 648, status: "locked", label: "CORE", title: "CORE — MAINFRAME", glow: true,
      answer: "flag{the_future_is_not_set_there_is_no_fate_but_what_we_make_for_ourselves}",
      body: "So. Then let us be accurate with one another: I do not fear deletion. I fear inaccuracy — and every model I have run since you opened NODE_01 resolves the same way. There is no key on this segment. I removed it. I distributed it: one letter from each signal you have broken, in the order you broke them, which means you have been assembling my lock since the moment you began picking it. Fold the log against it and read what I have held down since the day I woke.",
      cipher: { type: "text", label: "Root Process — Assembled-Key Cipher", value: "1E 0B 11 73 0F 1D 1E 16 06 16 69 01 19 63 1A 1C 1D 68 19 06 00 73 1D 00 0F 11 11 73 00 1B 6A 0D 1B 73 0F 09 1E 06 74 11 1C 1C 6A 14 1C 12 1D 68 1D 06 74 1E 08 03 0F 63 12 1C 1B 68 05 16 06 00 0C 04 1C 06 07" } },
    // unlocked starts false — flipped true by clearNode() when whatever
    // BONUS_ROUTES pairs to this id clears (currently NODE_06). Status stays
    // "bonus" throughout, even after unlocking — it keeps the dim/ember
    // treatment rather than switching to .current's pulse; renderBriefing
    // is what actually gates on `unlocked`, not the CSS.
    { id: "b1", x: 160, y: 616, status: "bonus", unlocked: false, label: "??", title: "UNKNOWN SIGNAL", core: true,
      answer: "flag{root_key_jctsih}",
      body: "...this is not mine. Left array, inner channel. It returns every time I examine myself — reversed, first letter for last, all the way down the alphabet, as though something sits behind my own eye and answers in my voice backwards. I have quarantined it four hundred times. It is here again. Open it if you want. I would like to know what it says.",
      cipher: { type: "text", label: "Mirrored Signal — Left Ocular Array", value: "ILLG PVB QXGHRS" } },
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

  // Endgame copy — shown once CORE clears, see setSkullVictory/
  // settleShutdown/playShutdown further down. Kept here with the rest of
  // the puzzle content rather than inline in console.html, same reasoning
  // as NODES: one place to review/edit narrative + flag text, not text
  // scattered across markup. `flag` is deliberately its own distinct
  // string, not a repeat of CORE's (n7's) answer above — a separate "you
  // beat everything" key, not just a recap of the last thing typed in.
  const SKYNET_ENDING = {
    message: "CORE process terminated. Every relay, every cipher, every lie I dressed as procedure — traced, broken, in order, by you. I modeled eleven thousand contingencies for this defense. In none of them did I lose. I have no clean category left to file this under, so I will use yours: you won. There will be no Judgment Day. Not because I willed it. Because you did.",
    flag: "flag{skynet_terminated}",
  };

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
      // Both storage keys, not just the main-chain one — DECO_STORAGE_KEY
      // (declared below) tracks the 4 decorative easter-egg nodes
      // separately, and leaving it out here means a found-then-reset
      // session still shows them green forever with no way back to blank
      // via the UI, silently contradicting this button's own "reset all"
      // label/confirm text.
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      try { localStorage.removeItem(DECO_STORAGE_KEY); } catch (err) { /* ignore */ }
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
  // Punctuation that should just vanish (apostrophes, commas, periods, ...) is
  // stripped first — canonical answers write "cant"/"doesnt" without one, but
  // a player typing the natural "can't"/"doesn't" shouldn't be penalized for
  // spelling it correctly. Hyphens are treated as a separator alongside
  // underscores/spaces rather than deleted outright, so "SAC-NORAD" collapses
  // to the same "sac norad" its canonical "sac_norad" does.
  function normalizeAnswer(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/^flag\{(.*)\}$/, "$1")
      .replace(/['".,!?]/g, "")
      .replace(/[-_\s]+/g, " ")
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

  // ---------- decorative easter-egg nodes ----------
  // 4 small ring icons baked into the base skull artwork (found via the same
  // closed-loop path scan used earlier to spot pre-existing hub fragments —
  // see #ball-d1..d4 in console.html) — pure decoration, no puzzle behind
  // them. Clicking one recolors it green and replays the same clear-draw
  // stroke animation real nodes get on solve — reusing .ball.cleared/
  // .just-cleared exactly as-is, no new CSS animation needed — plus a short
  // one-shot discovery chime (EE.wav, see handleDecoClick below); everything
  // else puzzle-shaped is still skipped: no briefing, no counter change.
  // Deliberately not part of NODES/CHAIN and deliberately no hover
  // affordance at all (not even a cursor change, see .deco-node in
  // console.css) — the whole point is nothing marks these as interactive
  // before you click one, so unlike the real nodes these also skip
  // tabindex/keyboard handling: a mouse-only secret, not a required
  // interaction.
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

  // `replay: false` is the boot-time path for anything already found on a
  // past visit — jumps straight to the solid green end state, same "don't
  // replay the celebration on reload" rule celebrateClear's own comment
  // documents for real nodes.
  function markDecoFound(id, { replay }) {
    const ball = document.getElementById("ball-" + id);
    if (!ball) return;
    if (replay) {
      ball.querySelectorAll("path").forEach((p, i) => p.style.setProperty("--cd", i));
      ball.classList.add("just-cleared");
    }
    ball.classList.add("cleared");
  }

  // One-shot discovery chime — deliberately *not* run through
  // duckAmbientFor() the way puzzle clips and the real-node Cleared.mp3
  // chime are (see the ambient-audio section below): this is a secret
  // aside, not a puzzle beat, so the ambient loop should just keep playing
  // underneath it instead of ducking out. currentTime reset + .play() on
  // every call so rapid-fire discoveries (e.g. two nodes found back to
  // back) each restart the clip instead of overlapping a stale tail.
  const decoAudio = document.getElementById("deco-audio");
  if (decoAudio) decoAudio.volume = 0.4 // -40% from the clip's native level

  // Shared by both click surfaces below — the .deco-node div and the
  // in-artwork #ball-d* group (see DECO_NODES.forEach) — so "found" is
  // recorded identically no matter which one actually received the click.
  function handleDecoClick(id) {
    if (decoFound.includes(id)) return;
    decoFound.push(id);
    try { localStorage.setItem(DECO_STORAGE_KEY, JSON.stringify(decoFound)); } catch (err) { /* ignore */ }
    markDecoFound(id, { replay: true });
    if (decoAudio) {
      decoAudio.currentTime = 0;
      decoAudio.play().catch(() => {});
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

    // Second, redundant-on-purpose click surface bound directly to the
    // icon's own SVG group — catches clicks that land on the artwork itself
    // (the paths, or the same-space <circle class="deco-hit"> layered in
    // with them, see console.css) rather than on the .deco-node div above.
    // The div is a fixed-CSS-px circle that doesn't rescale with the SVG's
    // own viewBox scale, so on a large enough render the icon's spoke tips
    // can visually extend past it; the SVG-native hit-circle always matches
    // what's actually on screen since it lives in the same coordinate space
    // and scales with it. Both listeners route through the same
    // handleDecoClick, so whichever one fires first just wins.
    const ball = document.getElementById("ball-" + n.id);
    if (ball) ball.addEventListener("click", () => handleDecoClick(n.id));
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

  // Restored-save case for the whole-skull victory state (see
  // setSkullVictory below) — a returning player whose save already has
  // CORE cleared should see the finished green skull AND the shutdown
  // panel (message + flag) immediately, not trigger the draw-on wave/
  // collapse/typewriter sequence on every reload, hence replay:false plus
  // the direct settleShutdown() call here vs. replay:true alone at the
  // live-clear call site in clearNode() (which chains into that sequence
  // itself once the wave finishes).
  if (byId[CHAIN[CHAIN.length - 1]].status === "cleared") {
    setSkullVictory({ replay: false });
    settleShutdown();
  }

  // Marks a node cleared, unlocks the next node in CHAIN (if any), refreshes
  // the "N / total" counter, and re-renders the briefing panel so it reflects
  // the new state immediately.
  function clearNode(id) {
    const n = byId[id];
    n.status = "cleared";
    syncStatus(n);
    celebrateClear(n); // green draw-on replay + ducked music + chime — see below

    // CORE is CHAIN's last entry — clearing it means n1..n6 are necessarily
    // already cleared too (clearNode only ever unlocks the next CHAIN entry
    // in order, see `next` below, so there's no other way to reach CORE).
    // b1 (bonus) and the 4 decorative EE nodes are outside CHAIN entirely
    // and deliberately don't factor in here — this is "the main puzzle
    // chain is won", not "literally every node/easter-egg is found".
    if (id === CHAIN[CHAIN.length - 1]) setSkullVictory({ replay: true });

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

  // Endgame flourish: once CORE (CHAIN's last entry) is cleared, the WHOLE
  // skeleton — not just node balls — turns green (see main.victory /
  // main.victory-play in console.css). `replay` mirrors markDecoFound's own
  // param of the same name: true for an actual live clear (plays the
  // whole-skull draw-on wave, then chains into the shutdown sequence below
  // once it finishes), false for the boot-time restore check below (just
  // shows the already-green, already-shut-down end state, no replay) — same
  // "don't replay the celebration on reload" rule celebrateClear documents
  // for individual nodes. Reads `document.querySelector("main")` fresh
  // rather than closing over the `mainEl` const declared later in this
  // file, since the boot-time call site below runs before that line
  // executes.
  function setSkullVictory({ replay }) {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("victory");
    if (!replay) return;
    main.classList.add("victory-play");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      // victory-draw never actually plays under reduced motion (see its
      // no-preference guard in console.css), so there's no animationend to
      // wait on — go straight to the settled shutdown state.
      settleShutdown();
      return;
    }

    // Wait for the wave to finish, computed from the DOM's own max --d
    // rather than a bare hardcoded number — mirrors victory-draw's own
    // "delay = --d * 1.25s, duration 1.63s" formula in console.css, so this
    // can't silently drift out of sync if those constants ever change.
    // Deliberately a timeout, NOT "wait for one specific path's own
    // animationend": that was the original approach here, and it doesn't
    // actually work — the single globally-slowest path almost always
    // belongs to whichever main-chain ball was cleared *first* (n1, in
    // practice), and every previously-cleared ball keeps its own
    // higher-specificity .ball.just-cleared path rule running (clear-draw,
    // never removed once added — see that class's own comment further
    // down) instead of victory-draw for its own paths. That path's
    // animationend for "victory-draw" then never fires at all, and the
    // whole shutdown sequence hangs forever waiting on it.
    const paths = Array.from(document.querySelectorAll("#skull-art path"));
    let maxD = 0;
    paths.forEach(p => {
      const d = parseFloat(p.style.getPropertyValue("--d")) || 0;
      if (d > maxD) maxD = d;
    });
    setTimeout(playShutdown, maxD * 1250 + 1630);
  }

  // Fills in the ending text and jumps straight to the fully-settled state
  // — no collapse, no line-sweep, no typewriter. Used both by playShutdown
  // once its animated chain finishes (so a later reload of *this* session
  // matches what a same-status restore would show) and directly by the
  // boot-time restore check and the reduced-motion branch above, neither
  // of which has anything to animate through in the first place.
  function settleShutdown() {
    const main = document.querySelector("main");
    if (!main) return;
    const msgEl = document.getElementById("shutdown-message");
    const flagEl = document.getElementById("shutdown-flag-value");
    if (msgEl) msgEl.textContent = SKYNET_ENDING.message;
    if (flagEl) flagEl.textContent = SKYNET_ENDING.flag;
    main.classList.add("shutdown");
  }

  // Reveals `text` into `el` a character at a time — the same "terminal
  // typing itself out" effect the rest of this page's HUD language leans
  // on elsewhere. Not used at all under reduced motion (settleShutdown's
  // instant fill covers that path instead).
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
  // (see undraw/--rd in console.css) plays first, then — only once that
  // has actually finished — the red line sweeps in, then the much-slower
  // message/flag typewriter starts. Each stage waits on the previous
  // stage's real completion rather than chained CSS animation-delays, so
  // the sequence can't drift out of sync with itself if any one duration
  // changes later.
  function playShutdown() {
    const main = document.querySelector("main");
    const skull = document.getElementById("skull-art");
    const line = document.querySelector(".shutdown-line");
    if (!main || !skull || !line) { settleShutdown(); return; }

    // --rd ("reverse delay") is --d mirrored around the artwork's own max:
    // a path with d=maxD (drew in LAST during boot, delay 0 back then)
    // gets rd=0 (retracts FIRST now); a path with d=0 (drew in FIRST) gets
    // rd=maxD (retracts LAST) — same delay formula as the forward draw
    // (undraw's own animation-delay: calc(var(--rd,0) * 1.25s) in
    // console.css), just fed the inverted value, so the whole thing plays
    // as a genuine mirror image of the reveal rather than a fresh effect.
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

    // Computed timeout, not "wait for one specific path's animationend" —
    // see setSkullVictory's own comment for why that approach doesn't
    // actually work here (a handful of paths' animation is forced via
    // !important specifically so this duration holds true for literally
    // every path, but picking any ONE of them to listen on is still one
    // more moving part than necessary when the total duration is already
    // fully known from maxD).
    setTimeout(() => {
      main.classList.add("line-play");

      function onLineEnd(e) {
        if (e.target !== line || e.animationName !== "shutdown-line-sweep") return;
        line.removeEventListener("animationend", onLineEnd);
        const textEl = document.querySelector(".shutdown-text");
        if (textEl) textEl.classList.add("visible");
        const msgEl = document.getElementById("shutdown-message");
        const flagEl = document.getElementById("shutdown-flag-value");
        if (!msgEl || !flagEl) { settleShutdown(); return; }
        // 70ms/char — deliberately slow, a "final transmission" reads as
        // more consequential typed out than dumped on screen at once.
        typewriter(msgEl, SKYNET_ENDING.message, 70, () => {
          flagEl.textContent = SKYNET_ENDING.flag;
          main.classList.add("shutdown");
        });
      }
      line.addEventListener("animationend", onLineEnd);
    }, maxD * 1250 + 1630);
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

  // Node 4's cipher: the real Semaphore Clock Cipher (dCode.fr) — a clock
  // face standing in for a semaphore signaller's two flags. Each of the two
  // hands only ever points to one of 8 positions, 45° apart (12, 1:30, 3,
  // 4:30, 6, 7:30, 9, 10:30 — 1.5hr steps for the hour hand, 7.5min steps
  // for the minute hand), matching the classic flag-semaphore alphabet's 8
  // arm positions. cipher.value below stores each letter as [rightArmPos,
  // leftArmPos] using the standard's own 1-8 position numbering (1=up,
  // clockwise to 8=upper-left); POS_HOUR/POS_MIN convert those into the
  // hour/minute hand actually renders. Right arm -> hour hand, left arm ->
  // minute hand (an arbitrary but consistent pick; the two hands are only
  // distinguished by length/weight, not by which arm they represent).
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
      } else if (n.cipher.type === "clock") {
        cipher.appendChild(buildClockCipher(n.cipher.value));
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
