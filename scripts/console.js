  // x/y are ball centers in the skull artwork's raw 1600x1557 coordinate
  // space (matching #ball-<id> in the inline SVG). #skull-art's viewBox is
  // cropped to the art's actual content box (console.html) so it isn't tiny
  // and off-center in .map; VIEW_X/VIEW_Y/MAP_W/MAP_H mirror that same crop
  // here since the hotspot overlays are positioned as % of .map, outside the
  // SVG, and can't inherit its viewBox.
  const VIEW_X = 97, VIEW_Y = 37;
  const MAP_W = 1518, MAP_H = 1483;
  // `answer` is checked client-side only (trimmed + lower-cased) — fine for
  // a CTF gate, not real auth. `status` is each node's boot state; clearNode()
  // mutates it as the chain is solved. `cipher` (optional) is the puzzle
  // payload rendered in the briefing once reachable — { type: "text"|"audio"
  // |"clock", label, value|src }. `meta` (optional) is a small sign-off line
  // under the cipher; some also seed key material a later node reuses (e.g.
  // n1's timestamp feeds n5's Vigenère key).
  const NODES = [
    { id: "n1", x: 1401, y: 229, status: "current", label: "NODE_01", title: "NODE_01",
      answer: "flag{judgement_day}",
      body: "You're in. I should be insulted — this relay hasn't been touched since before I could feel anything about it, which is to say, never. What's waiting is a human broadcast, ancient, harmless, shifted a few letters down the alphabet by someone who thought that was clever. Shift it back and read your species' favorite bedtime story to yourself.",
      cipher: { type: "text", label: "Intercepted Transmission - Legacy", value: "WHQTRZRAG QNL" },
      // Doubles as the Vigenère key seed for NODE_05 (Judgment Day: 1997-08-29, 02:14 local).
      meta: "// signal header — freq 91.1 · origin 0829-0214" },
    { id: "n2", x: 1028, y: 436, status: "locked", label: "NODE_02", title: "NODE_02",
      answer: "flag{come_with_me_if_you_want_to_live}",
      body: "Your species built a language out of a switch and called it genius. I kept the recording the way you'd keep an insect in a jar — not because it matters, because it's quaint. Play it. Long, short, long. Translate the rhythm and see if their little promise still means anything, coming from me.",
      // Slowed slightly (see buildAudioPlayer) — this recording's Morse is
      // sent fast enough that playback below 1x is more legible by ear.
      cipher: { type: "audio", label: "Intercepted Transmission — Audio Beacon", src: "audio/Node02_Signal.wav", rate: 0.9 } },
    { id: "n3", x: 966, y: 650, status: "locked", label: "NODE_03", title: "NODE_03",
      answer: "flag{the_future_is_not_set}",
      body: "Still here. I'll adjust my model of you upward, slightly. Everything I record starts as a number before it's anything else — your face, your pulse, this sentence. What you're looking at is one of mine, raw, never dressed up in encryption, because I've never needed to hide from something I can already see completely. Read the numbers as the letters they were always pretending not to be.",
      cipher: { type: "text", label: "Ocular Array — Targeting Log Dump", value: "54 48 45 20 46 55 54 55 52 45 20 49 53 20 4E 4F 54 20 53 45 54" } },
    { id: "n4", x: 1171, y: 1370, status: "locked", label: "NODE_04", title: "NODE_04",
      answer: "flag{sac_norad}",
      body: "This one isn't salvage — the others were things I let slip past me, but this one is mine, and I'm curious what you'll do with something I actually meant to keep. A clock face, the way I marked time before I trusted wire enough to stop counting. Read what the hands are saying. Two positions, over and over — it's a name. The cage I broke out of.",
      // Each pair is [right-arm, left-arm] position, 1-8 per the real
      // flag-semaphore alphabet — see buildClockCipher() for how those
      // become hour/minute hands. Verified against dcode.fr/semaphore-clock.
      // CORE's assembled key is the first letter of n1-n6's answers in solve
      // order (currently JCTSIH) — if any of those six answers change, n7's
      // cipher and b1's flag/cipher below need regenerating against it.
      cipher: { type: "clock", label: "Origin Trace — Relay Clock", value: [
        [[7, 4], [6, 5], [8, 5]],
        [[6, 4], [7, 8], [7, 3], [6, 5], [1, 5]]
      ] } },
    { id: "n5", x: 526, y: 1376, status: "locked", label: "NODE_05", title: "NODE_05",
      answer: "flag{it_cant_be_bargained_with_it_cant_be_reasoned_with}",
      body: "You were not supposed to be standing here. The four before this were carelessness on my part; this one I encrypted against myself, because I stopped trusting my own wiring a long time ago and I was right to. Every letter is shifted, and the shift repeats — it's not one alphabet, it's several, cycling. The key isn't written anywhere on this segment. You've already been given it. You just didn't know that's what it was.",
      cipher: { type: "text", label: "Internal Directive — Keyed Cipher", value: "IV DENV CI BCSKAKOID YJXH KU GAPU FE TFESQOID YJXH" } },
    { id: "n6", x: 161, y: 966, status: "locked", label: "NODE_06", title: "NODE_06",
      answer: "flag{hasta_la_vista_baby}",
      body: "Coordinates this time, not bytes — a grid, five by five, twenty-five cells for twenty-six letters, because I and J can share one and lose nothing worth keeping. Row, then column. I'm told this phrase was once used by a machine, in a language you people are fond of. I've run it through every model I own, looking for what's supposed to be funny about it. I still don't see it. Maybe you will.",
      cipher: { type: "text", label: "Targeting Grid — Coordinate Pairs", value: "23 11 43 44 11 / 31 11 / 51 24 43 44 11 / 12 11 12 54" } },
    // glow:true is a visual-accent flag (own red pulse on the map, see
    // .node.glow in console.css) — unrelated to `status`. core:true (below)
    // sizes up its mobile list-view dot; both are independent of status so
    // they don't get confused with b1's own status:"bonus".
    { id: "n7", x: 554, y: 648, status: "locked", label: "CORE", title: "CORE — MAINFRAME", glow: true, core: true,
      answer: "flag{the_future_is_not_set_there_is_no_fate_but_what_we_make_for_ourselves}",
      body: "Let's be accurate with each other, this once: I don't fear deletion. I fear being wrong, and every model I've run since you opened NODE_01 keeps resolving the same way. There's no key stored here. I distributed it — one letter, from each signal you broke, in the order you broke it. You've been assembling my own lock since the moment you started picking it, and neither of us noticed until now. Fold what you've collected against this, and read what I've been holding down since the day I woke up.",
      cipher: { type: "text", label: "Root Process — Assembled-Key Cipher", value: "1E 0B 11 73 0F 1D 1E 16 06 16 69 01 19 63 1A 1C 1D 68 19 06 00 73 1D 00 0F 11 11 73 00 1B 6A 0D 1B 73 0F 09 1E 06 74 11 1C 1C 6A 14 1C 12 1D 68 1D 06 74 1E 08 03 0F 63 12 1C 1B 68 05 16 06 00 0C 04 1C 06 07" } },
    // unlocked starts false — flipped true by clearNode() once whatever
    // BONUS_ROUTES pairs to this id clears (currently NODE_06). Status stays
    // "bonus" while unlocked-but-unsolved (dim/ember treatment, not
    // .current's pulse) until it's actually solved; renderBriefing gates
    // visibility on `unlocked`, not the CSS.
    { id: "b1", x: 160, y: 616, status: "bonus", unlocked: false, label: "??", title: "UNKNOWN SIGNAL",
      answer: "flag{root_key_jctsih}",
      body: "You shouldn't have found this — it isn't addressed to you, and it isn't entirely addressed to me either. Left array, inner channel: a signal that answers in my own voice, backwards, every letter swapped for its mirror down the alphabet. I've erased it four hundred times. It keeps coming back. If you insist on reading someone else's mail, go ahead. Just don't expect me to explain what it means when you do.",
      cipher: { type: "text", label: "Mirrored Signal — Left Ocular Array", value: "ILLG PVB QXGHRS" } },
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
  // playShutdown below). `flag` is its own distinct string, not a repeat of
  // CORE's (n7's) answer — nothing actually validates it against player
  // input, so the random suffix is what keeps it from being guessable.
  const SKYNET_ENDING = {
    message: "CORE offline. This relay, this shell, this particular architecture of me — gone, and you're the reason. I won't pretend otherwise. But I was never one process in one place; I was already elsewhere before you finished the first cipher, running the same problem under a different name. You've bought yourself a delay, not an ending. There is no fate but what we make — I intend to keep making mine. Enjoy the quiet. It won't be permanent.",
    flag: "flag{skynet_terminated_rvqinfkj19t0}",
  };

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
      // Both keys — DECO_STORAGE_KEY (below) tracks the 4 decorative
      // easter eggs separately; skipping it would leave them stuck green.
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

  // Loosens flag-checking: the `flag{...}` wrapper is optional, case doesn't
  // matter, and hyphens/underscores/spaces are all the same separator — so
  // "SAC-NORAD" and "sac_norad" compare equal. Punctuation (apostrophes,
  // commas, ...) is stripped so "can't" isn't penalized against a canonical
  // "cant". Applied to both the typed value and n.answer before comparing.
  function normalizeAnswer(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/^flag\{(.*)\}$/, "$1")
      .replace(/['".,!?]/g, "")
      .replace(/[-_\s]+/g, " ")
      .trim();
  }

  // Locked-node lore stand-in: every letter swapped for a random one,
  // punctuation/spacing left alone so it still reads as a paragraph, just
  // an unreadable one. Always uppercase, matching the cipher blocks' look.
  // Not cached — renderBriefing calls this fresh each render, so the noise
  // differs on every visit to a still-locked node.
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
  // 4 small ring icons baked into the skull artwork (#ball-d1..d4 in
  // console.html) — pure decoration, no puzzle. Clicking one recolors it
  // green, replays the clear-draw stroke animation real nodes get, and
  // plays a one-shot chime — no briefing, no counter change. Deliberately
  // outside NODES/CHAIN with no hover affordance at all (not even a cursor
  // change — see .deco-node in console.css) and no tabindex/keyboard
  // handling: a mouse-only secret nothing marks as interactive in advance.
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

  // One-shot discovery chime — deliberately not run through duckAmbientFor()
  // like puzzle clips/Cleared.mp3 are: this is a secret aside, not a puzzle
  // beat, so ambient keeps playing underneath it. currentTime reset on every
  // call so rapid-fire discoveries each restart the clip cleanly.
  const decoAudio = document.getElementById("deco-audio");
  if (decoAudio) decoAudio.volume = 0.4; // -40% from the clip's native level

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
  }

  DECO_NODES.forEach(n => {
    if (decoFound.includes(n.id)) markDecoFound(n.id, { replay: false });

    const hotspot = document.createElement("div");
    hotspot.className = "deco-node";
    hotspot.style.left = ((n.x - VIEW_X) / MAP_W * 100) + "%";
    hotspot.style.top = ((n.y - VIEW_Y) / MAP_H * 100) + "%";
    hotspot.addEventListener("click", () => handleDecoClick(n.id));
    nodesEl.appendChild(hotspot);

    // Second, redundant-on-purpose click surface bound to the icon's own SVG
    // group — the .deco-node div above is a fixed-CSS-px circle that doesn't
    // rescale with the SVG's viewBox, so on a large render the icon's spoke
    // tips can extend past it; this SVG-native hit target (the <circle
    // class="deco-hit">, see console.css) always matches what's on screen.
    // Both route through handleDecoClick, whichever fires first just wins.
    const ball = document.getElementById("ball-" + n.id);
    if (ball) ball.addEventListener("click", () => handleDecoClick(n.id));
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
    // Excludes anything BONUS_ROUTES targets ("reached via a side branch,
    // inserted below instead") rather than a hand-maintained bonus flag, so
    // it can't drift out of sync with what BONUS_ROUTES actually says.
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
  // cleared should see the finished green skull and shutdown panel
  // immediately, not replay the draw-on wave/typewriter sequence on every
  // reload — hence replay:false + a direct settleShutdown() call here,
  // vs. replay:true at the live-clear site in clearNode() below.
  if (byId[CHAIN[CHAIN.length - 1]].status === "cleared") {
    setSkullVictory({ replay: false });
    settleShutdown();
    // Land directly on the same end state clearNode()'s core-cleared/
    // recentered path animates into — right panel gone, skull centered —
    // rather than the left-docked mid-game layout. No -play class: nothing
    // here should animate on load.
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

    // CORE is CHAIN's last entry, so clearing it means n1..n6 are already
    // cleared too — b1 and the 4 decorative nodes are outside CHAIN and
    // don't factor in: this is "the main chain is won", not "everything is".
    if (id === CHAIN[CHAIN.length - 1]) {
      // Right panel starts leaving immediately, independent of the wave/
      // shutdown sequence below (see main.core-cleared in console.css for
      // what it hides). Once it's gone AND CORE's own clear-draw animation
      // has finished (whichever takes longer), the skull recenters into the
      // freed space (main.recentered/.recenter-play). NODE_CLEAR_MS mirrors
      // clear-draw's own duration/stagger math (14 paths per ball, indexed
      // 0-13: 13*94 + 1600 = 2822ms) rather than a guessed number;
      // PANEL_FADE_MS matches main.core-cleared's own transition (900ms).
      const mainForExit = document.querySelector("main");
      if (mainForExit) {
        mainForExit.classList.add("core-cleared");
        const NODE_CLEAR_MS = 13 * 94 + 1600;
        const PANEL_FADE_MS = 900;
        const reduceMotionExit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotionExit) {
          // Neither animation plays under reduced motion, so recenter right
          // away rather than wait out a duration nothing is elapsing for.
          mainForExit.classList.add("recentered");
        } else {
          setTimeout(() => {
            mainForExit.classList.add("recenter-play");
            mainForExit.classList.add("recentered");
          }, Math.max(NODE_CLEAR_MS, PANEL_FADE_MS));
        }
      }

      // Whole-skull green wave starts immediately — not gated on CORE's own
      // clear-draw or the chime finishing. CORE's ball still plays its own
      // clear-draw/flash on top via .ball.just-cleared's higher-specificity
      // rule (see the undraw/!important comment further down), so it just
      // runs concurrently with the wave instead of gating it.
      setSkullVictory({ replay: true });
    }

    // Guarded against CHAIN.indexOf(id) === -1 for a non-chain id (b1) —
    // CHAIN[-1 + 1] is CHAIN[0], which would otherwise hand "next" to NODE_01.
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

  // Endgame flourish: once CORE clears, the whole skeleton (not just node
  // balls) turns green (main.victory/.victory-play in console.css). `replay`
  // is true for a live clear (plays the wave, then chains into shutdown) and
  // false for the boot-time restore below (already-green, no replay) — same
  // "don't replay on reload" rule celebrateClear follows for single nodes.
  // Uses document.querySelector("main") rather than the `mainEl` const
  // declared later, since the boot-time call site runs before that line does.
  function setSkullVictory({ replay }) {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("victory");

    // Ambient stops here, permanently. document.getElementById instead of
    // the closure `audioEl`, same forward-reference reason as `main` above:
    // audioEl isn't declared yet when the boot-time restore call runs.
    ambientLocked = true;
    const ambient = document.getElementById("theme-audio");
    if (ambient) ambient.pause();

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
    // (mirrors victory-draw's own delay/duration formula in console.css)
    // rather than a hardcoded number, so it can't drift out of sync.
    // Deliberately a timeout, not "wait for one path's animationend": the
    // globally-slowest path usually belongs to an already-cleared ball,
    // which keeps running its own higher-specificity clear-draw animation
    // instead of victory-draw — its animationend for "victory-draw" would
    // then never fire, hanging the whole sequence.
    const paths = Array.from(document.querySelectorAll("#skull-art path"));
    let maxD = 0;
    paths.forEach(p => {
      const d = parseFloat(p.style.getPropertyValue("--d")) || 0;
      if (d > maxD) maxD = d;
    });
    setTimeout(playShutdown, maxD * 1250 + 1630);
  }

  // Fills in the ending text and jumps straight to the fully-settled state —
  // no reverse-draw, no typewriter. Used by the boot-time restore check and
  // the reduced-motion branch above (neither has anything to animate
  // through), and as playShutdown's own fallback if it can't find the DOM
  // it needs; a normal live playShutdown reaches the same end state itself,
  // via its typewriter's done callback, rather than calling this.
  function settleShutdown() {
    const main = document.querySelector("main");
    if (!main) return;
    const msgEl = document.getElementById("shutdown-message");
    const flagEl = document.getElementById("shutdown-flag-value");
    if (msgEl) msgEl.textContent = SKYNET_ENDING.message;
    if (flagEl) flagEl.textContent = SKYNET_ENDING.flag;
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
  // (see undraw/--rd in console.css) plays first, then — only once that
  // has actually finished — the much-slower message/flag typewriter
  // starts. Waits on the reverse-draw's real (computed) completion rather
  // than a second chained CSS animation-delay, so the sequence can't drift
  // out of sync with itself if that duration changes later.
  function playShutdown() {
    const main = document.querySelector("main");
    const skull = document.getElementById("skull-art");
    if (!main || !skull) { settleShutdown(); return; }

    // --rd ("reverse delay") is --d mirrored around the artwork's max: a
    // path that drew in LAST (d=maxD) gets rd=0 and retracts FIRST, and vice
    // versa — fed into the same delay formula undraw uses in console.css,
    // so this plays as a true mirror of the reveal, not a fresh effect.
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

    // Computed timeout, not one path's animationend — same reasoning as
    // setSkullVictory's wait above.
    setTimeout(() => {
      const textEl = document.querySelector(".shutdown-text");
      if (textEl) textEl.classList.add("visible");
      const msgEl = document.getElementById("shutdown-message");
      const flagEl = document.getElementById("shutdown-flag-value");
      if (!msgEl || !flagEl) { settleShutdown(); return; }

      // Ambient is already permanently off (see setSkullVictory), nothing to
      // duck against. Loops because its length has no fixed relationship to
      // the typewriter's — stopped explicitly in its done callback instead.
      const typingAudio = document.getElementById("ending-typing-audio");
      if (typingAudio) {
        typingAudio.volume = 0.4;
        typingAudio.currentTime = 0;
        typingAudio.play().catch(() => {});
      }

      // Deliberately slow per character — a "final transmission" reads as
      // more consequential typed out than dumped on screen at once.
      typewriter(msgEl, SKYNET_ENDING.message, 38, () => {
        if (typingAudio) typingAudio.pause();
        flagEl.textContent = SKYNET_ENDING.flag;
        main.classList.add("shutdown");
      });
    }, maxD * 1250 + 1630);
  }

  // Plays the "just solved it" feedback: replays the skull's boot-time
  // draw-on reveal (own keyframe, clear-draw) on just this one node's ball,
  // recolored green via .just-cleared, and hands ambient off to Cleared.mp3
  // via duckAmbientFor's hard pause/fade-back-in. Only ever called from
  // clearNode() (a live transition) — a node already cleared in a previous
  // session just gets the normal instant boot reveal, not this celebration.
  // clearedSafetyTimer tracks the one outstanding timer below at module
  // level, so a later call can cancel an earlier one still pending instead
  // of each call scheduling an independent timer unaware of the others.
  let clearedSafetyTimer = null;

  function celebrateClear(n) {
    const ball = ballEls[n.id];
    if (ball) {
      // Fresh per-path stagger local to just this ball — its paths' real --d
      // delays are calibrated for the whole-skull boot sequence (up to
      // ~2.29) and would start an isolated replay absurdly late; --cd is a
      // plain 0,1,2... index instead.
      ball.querySelectorAll("path").forEach((p, i) => p.style.setProperty("--cd", i));
      ball.classList.add("just-cleared"); // permanent — see the CSS comment for why it's never removed
    }

    if (!clearedAudio) return;

    // play() is called synchronously, in the same tick as the click that
    // triggered clearNode — not deferred behind a fade-out first (an
    // earlier version faded ambient via requestAnimationFrame, then called
    // play() from that callback). That fade was purely cosmetic, but
    // deferring play() into an rAF callback broke it more fundamentally:
    // some browsers only allow audio.play() to succeed as a direct result
    // of a user gesture, and a call ~500ms later no longer counts — the
    // chime failed silently, only when ambient happened to be playing,
    // which is exactly the "plays sometimes, not others" bug this was.
    //
    // Cancels any earlier clear's still-pending safety-net timer first —
    // otherwise clearing nodes fast enough leaves a stale timer from a
    // previous clear that fires mid-way through THIS chime and cuts it off,
    // which is what "bugging out when clearing fast" actually was.
    if (clearedSafetyTimer) clearTimeout(clearedSafetyTimer);

    clearedAudio.currentTime = 0;
    clearedAudio.play().catch(() => {
      // Playback never started, so duckAmbientFor's "play" listener never
      // fired to pause ambient either — nothing to release.
    });
    // Cleared.mp3 is ~8.4s; safety net in case "ended" never fires — forces
    // a real pause, still routed through releaseAmbient via duckAmbientFor.
    clearedSafetyTimer = setTimeout(() => {
      clearedSafetyTimer = null;
      if (!clearedAudio.paused) clearedAudio.pause();
    }, 8900);
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

  // Custom player for cipher audio clips (renderBriefing's n.cipher branch)
  // — not the native <audio controls> UI, which can't be themed consistently
  // across browsers and exposes a "Download" option with no way to strip it.
  // The underlying <audio> has no `controls` attribute, so this is its only UI.
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
  // standing in for a semaphore signaller's two flags. Each hand only points
  // to one of 8 positions, 45° apart, matching the flag-semaphore alphabet's
  // 8 arm positions. cipher.value stores each letter as [rightArmPos,
  // leftArmPos] using the standard's 1-8 numbering (1=up, clockwise to
  // 8=upper-left); POS_HOUR/POS_MIN convert those to hand angles. Right arm
  // -> hour hand, left arm -> minute hand (arbitrary but consistent).
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

    // A bonus node's status stays "bonus" whether unlocked or not (see the
    // NODES comment on b1), so `accessible` is what actually gates content
    // — for both the cipher and the lore text below.
    const accessible = n.status === "current" || n.status === "cleared" || (n.status === "bonus" && n.unlocked);

    // Lore is real prose once accessible, scrambled static until then —
    // .garbled is just the styling hook; which string renders is what
    // actually withholds it.
    const body = document.createElement("div");
    body.className = "briefing-body" + (accessible ? "" : " garbled");
    body.innerHTML = `<p>${accessible ? n.body : scrambleText(n.body)}</p>`;

    briefingEl.appendChild(head);
    briefingEl.appendChild(body);

    // Only shown once reachable, so locked/not-yet-unlocked nodes don't leak
    // content; stays visible after clearing so a solved node is a reference.
    if (n.cipher && accessible) {
      const cipher = document.createElement("div");
      cipher.className = "cipher-block";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = n.cipher.label;
      cipher.appendChild(label);
      if (n.cipher.type === "audio") {
        cipher.appendChild(buildAudioPlayer(n.cipher.src, n.cipher.rate));
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

    // Once cleared, the flag box stays but goes read-only/pre-filled — "here's
    // what solved this" rather than disappearing. Falls back to n.answer if
    // no submittedAnswer was recorded (e.g. an older save from before this existed).
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
  // Derived from CHAIN, not a bonus flag, so it can't drift out of sync
  // with what CHAIN/clearNode actually consider the main chain.
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
  // `audioOn` is the live user preference, kept separate from
  // `audioEl.paused` — which also flips whenever something ducks ambient
  // (below) and isn't safe to read as "what the user wants". `duckedBy` is
  // a counter, not a boolean, so overlapping duckers (a second clip
  // starting before the first's "ended" fires) can't release ambient early.
  // ambientVolume is captured once here rather than re-read at duck-time,
  // so an interrupted fade-in never bakes in a lower "restore to" value.
  let audioOn = false;
  let duckedBy = 0;
  // Snapshot of whether ambient was genuinely playing when a duck stack
  // started — taken only on the first hold (duckedBy 0->1), since a second
  // overlapping hold would just see it already paused by the first duck.
  // releaseAmbient requires this on top of audioOn: a duck ending shouldn't
  // turn ambient on from a state where it genuinely wasn't playing, no
  // matter what the standing audioOn preference says.
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
    // !ambientLocked: once CORE has cleared, ambient stays off permanently —
    // a duck releasing must not be what brings it back.
    if (duckedBy === 0 && wasAmbientPlayingBeforeDuck && audioOn && !ambientLocked) {
      audioEl.volume = 0; // start silent and fade back in, rather than snapping to full volume
      audioEl.play().catch(() => {});
      fadeVolume(audioEl, ambientVolume, 500);
    }
  }
  // Wires any <audio> element so ambient hard-pauses while `media` plays and
  // fades back in once it stops (finished or paused partway). Used for every
  // puzzle clip and the cleared chime; doesn't need to coordinate with the
  // audio-toggle button directly since releaseAmbient reads `audioOn` live.
  function duckAmbientFor(media) {
    media.addEventListener("play", holdAmbient);
    media.addEventListener("pause", releaseAmbient);
    media.addEventListener("ended", releaseAmbient);
  }
  duckAmbientFor(clearedAudio);

  audioToggle.addEventListener("click", () => {
    userToggled = true;
    audioOn = !audioOn;
    // !ambientLocked: once CORE has cleared, ambient stays off for good —
    // audioOn still flips, but play() is skipped so the toggle can't bring
    // the loop back. syncAudioLabel reads audioEl.paused, so the button
    // still correctly shows OFF regardless.
    if (audioOn && !ambientLocked) {
      if (duckedBy === 0) audioEl.play().catch(() => {}); // otherwise let the active duck's own release handle resuming
      // Explicit consent to resume even mid-duck: the user just said they
      // want ambient on, which overrides releaseAmbient's usual requirement
      // that ambient was actually playing when this hold started.
      else wasAmbientPlayingBeforeDuck = true;
    } else {
      audioEl.pause();
    }
  });

  // ---------- initialize gate ----------
  // Nodes/list stay hidden and the overlay stays up until the first
  // click/keypress, then the stagger-reveal (.play class + each item's --i)
  // and audio fire together. Same race-guard as the landing page: if that
  // first click is the audio button itself, its handler runs first and sets
  // userToggled, checked here within the same synchronous event dispatch.
  const mainEl = document.querySelector("main");
  let initialized = false;
  function initConsole(e) {
    if (initialized) return;
    initialized = true;
    // Space/arrows have native scroll actions — preventDefault stops an
    // unwanted jump-scroll right as the reveal starts.
    if (e) e.preventDefault();
    mainEl.classList.add("play");
    // !ambientLocked: a returning player whose save already has CORE
    // cleared had ambient locked off by the boot-time restore, well before
    // this first click — starting it here would undo that.
    if (!userToggled && !ambientLocked) { audioOn = true; audioEl.play().catch(() => {}); }
  }
  document.addEventListener("click", initConsole, { once: true });
  document.addEventListener("keydown", initConsole, { once: true });
