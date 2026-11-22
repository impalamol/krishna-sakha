// SANATAN avatar: holographic starfield (canvas) + rishi face (SVG) with flowing Sanskrit verses:
// blink, gaze, breathing, lip-sync with moving beard, and a "reading" pose.
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stage = document.getElementById("stage");
  const canvas = document.getElementById("halo");
  const ctx = canvas.getContext("2d");
  const svg = document.getElementById("avatar");
  const $ = (id) => document.getElementById(id);
  const headGroup = $("headGroup"), headShape = $("headShape");

  const lipLower = $("lipLowerPath"), cavity = $("mouthCavity"), shine = $("lipShine");
  const teeth = $("teeth"), mouthClip = $("mouthClipPath"), beard = $("beard");
  const lids = svg.querySelectorAll(".lid");
  const pupils = svg.querySelectorAll(".pupil");
  const browL = $("browL"), browR = $("browR"), bindu = $("bindu");

  // ---------------- state ----------------
  let state = "idle";              // idle | listening | thinking | speaking
  let reading = false;             // learner is reading a book
  let meditate = 0;                // 0 = eyes open … 1 = eyes closed in meditation
  let engagedUntil = 0;            // someone is talking with him: stay awake until this time
  const meditating = () => reading && state === "idle" && Date.now() > engagedUntil && !celebrating();
  let smileAmt = 0;                                    // 0 … 1 (smiles when a book is finished or someone arrives)
  let smileUntil = 0;
  const pointer = { x: 0, y: 0, t: 0 };                // last mouse / finger position on the stage
  const look = { x: 0, y: 0 };                         // eased head turn toward the pointer (-1..1)
  const mouth = { open: 0, wide: 0.5, tOpen: 0, tWide: 0.5 };
  let energy = 0;
  let blink = 0, nextBlink = performance.now() + 2500, blinkStart = 0;
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };

  // ---------------- aura geometry ----------------
  let W = 0, H = 0, head = { cx: 0, cy: 0, rx: 70, ry: 90 };
  let motes = [];

  function layout() {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const hb = headShape.getBoundingClientRect();
    head = { cx: hb.left - r.left + hb.width / 2, cy: hb.top - r.top + hb.height / 2, rx: hb.width / 2, ry: hb.height / 2 };
    build();
    buildRows();
  }

  function rand(seed) { const x = Math.sin(seed * 9301.17 + 49297.3) * 233280.5; return x - Math.floor(x); }

  function build() {
    motes = [];
    const M = Math.round(Math.max(70, Math.min(220, (W * H) / 5000)));
    for (let i = 0; i < M; i++) {
      const big = rand(i * 19) > 0.9;
      motes.push({ x: rand(i * 3) * W, y: rand(i * 7) * H, r: big ? 1.8 + rand(i * 11) * 3 : 0.5 + rand(i * 11) * 1.4,
        s: 0.04 + rand(i * 13) * 0.22, ph: rand(i * 17) * 6.28, blur: big });
    }
  }

  function tint() {
    if (state === "listening") return [120, 240, 255];
    if (state === "thinking" || reading) return [110, 200, 255];
    return [60, 150, 255];
  }

  // Deep-space hologram backdrop: soft blue glow behind the head + drifting light particles.
  // Study ring = reading progress. A faint full track, and a bright golden arc that grows from the top
  // as pages are read. When a book is finished the circle closes and flares (see celebrate()).
  let ringGlow = 0, progress = 0, shownProgress = 0, celebrateUntil = 0, celebrateStart = 0;
  const celebrating = () => Date.now() < celebrateUntil;
  function drawStudyRing(t, k) {
    const cx = head.cx, cy = head.cy - head.ry * 0.28;  // a little above the face so it circles the jata too
    const R = head.ry * 1.22;
    const party = celebrating();
    const burst = party ? Math.max(0, 1 - (Date.now() - celebrateStart) / 1500) : 0; // flash right at completion
    const pulse = reduceMotion ? 1 : (party ? 0.92 + 0.08 * Math.sin(t * 0.008) : 0.85 + 0.15 * Math.sin(t * 0.002));
    shownProgress += ((party ? 1 : progress) - shownProgress) * ease(600);
    const start = -Math.PI / 2, end = start + Math.PI * 2 * Math.max(0.002, Math.min(1, shownProgress));
    const glow = k * (party ? 1.6 : 1);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // soft golden bloom (much stronger when the book is complete)
    const bloom = ctx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R * (1.25 + burst * 0.5));
    bloom.addColorStop(0, "rgba(255,200,90,0)");
    bloom.addColorStop(0.45, `rgba(255,200,90,${Math.min(0.75, 0.22 * glow * pulse + burst * 0.4)})`);
    bloom.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(cx, cy, R * (1.25 + burst * 0.5), 0, Math.PI * 2); ctx.fill();
    // faint full track
    ctx.lineWidth = Math.max(2, R * 0.016);
    ctx.strokeStyle = `rgba(255,214,120,${0.18 * k})`;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // bright progress arc
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(3, R * (party ? 0.03 : 0.022));
    ctx.strokeStyle = `rgba(255,${party ? 226 : 214},${party ? 150 : 120},${Math.min(1, 0.9 * glow * pulse)})`;
    ctx.shadowColor = "rgba(255,190,80,0.95)"; ctx.shadowBlur = (party ? 46 : 28) * k;
    ctx.beginPath(); ctx.arc(cx, cy, R, start, end); ctx.stroke();
    // the "pen" at the tip of the arc while reading
    if (!party && shownProgress < 0.995) {
      const tx = cx + Math.cos(end) * R, ty = cy + Math.sin(end) * R;
      ctx.fillStyle = `rgba(255,248,220,${0.9 * k})`; ctx.shadowBlur = 20 * k;
      ctx.beginPath(); ctx.arc(tx, ty, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    // thin inner ring
    ctx.shadowBlur = 10 * k; ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255,230,170,${0.4 * k * (party ? 1.5 : 1)})`;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.94, 0, Math.PI * 2); ctx.stroke();
    // points of light along the finished part of the ring
    const n = 27, rot = reduceMotion ? 0 : t * (party ? 0.0005 : 0.00012);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rot;
      const along = ((a - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (!party && along > (end - start)) continue;
      const tw = reduceMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.003 + i * 1.7);
      ctx.fillStyle = `rgba(255,240,200,${Math.min(1, (0.4 + 0.6 * tw) * glow)})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 2.2 + tw * 1.6 + burst * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawAura(t) {
    ctx.clearRect(0, 0, W, H);
    const [r, g, b] = tint();
    const R = Math.max(head.rx, head.ry);
    const boost = energy * 0.6 + (state === "listening" ? 0.2 : 0) + (reading ? 0.12 : 0);
    const flick = reduceMotion ? 1 : 0.94 + 0.06 * Math.sin(t * 0.013) * Math.sin(t * 0.0021);

    const glow = ctx.createRadialGradient(head.cx, head.cy + R * 0.4, R * 0.2, head.cx, head.cy + R * 0.4, R * 3.4);
    glow.addColorStop(0, `rgba(${r},${g},${b},${(0.32 + boost * 0.3) * flick})`);
    glow.addColorStop(0.4, `rgba(20,70,200,0.12)`);
    glow.addColorStop(1, "rgba(0,0,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // golden ring (prabhamandal) around the head while he studies
    // visible while he studies, and always during the "book finished" celebration
    ringGlow += ((meditating() || celebrating() ? 1 : 0) - ringGlow) * ease(450);
    if (ringGlow > 0.01) drawStudyRing(t, ringGlow);

    for (const m of motes) {
      if (!reduceMotion) {
        m.y -= m.s * (1 + energy * 3 + (reading ? 0.8 : 0));
        m.x += Math.sin(t * 0.0004 + m.ph) * 0.08;
        if (m.y < -6) { m.y = H + 6; m.x = Math.random() * W; }
      }
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.0011 + m.ph));
      if (m.blur) {
        const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 2.4);
        gr.addColorStop(0, `rgba(140,210,255,${0.35 * tw})`);
        gr.addColorStop(1, "rgba(140,210,255,0)");
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 2.4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(160,220,255,${0.25 + 0.55 * tw})`;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ---------------- flowing Sanskrit verses inside the silhouette ----------------
  const VERSES = [
    "ॐ भूर्भुवः स्वः तत्सवितुर्वरेण्यं भर्गो देवस्य धीमहि धियो यो नः प्रचोदयात्",
    "ॐ पूर्णमदः पूर्णमिदं पूर्णात्पूर्णमुदच्यते पूर्णस्य पूर्णमादाय पूर्णमेवावशिष्यते",
    "असतो मा सद्गमय तमसो मा ज्योतिर्गमय मृत्योर्मा अमृतं गमय",
    "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन",
    "सर्वे भवन्तु सुखिनः सर्वे सन्तु निरामयाः",
    "अहं ब्रह्मास्मि · तत्त्वमसि · प्रज्ञानं ब्रह्म · अयमात्मा ब्रह्म",
    "ॐ नमः शिवाय · ॐ नमो भगवते वासुदेवाय · ॐ गं गणपतये नमः",
    "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत",
    "ॐ शान्तिः शान्तिः शान्तिः",
  ];
  // Mantras drift upward across the whole background, behind the face.
  // Each row is a long line of verses; rows sit at different depths (size, brightness, speed).
  const MANTRAS = VERSES.join("  ·  ") + "  ·  ";
  let ALL = MANTRAS;                     // what drifts behind him: mantras, or the words he is reading now
  let rows = [], scroll = 0, lastT = 0, rowGap = 28, bandH = 0;
  let ALL_LONG = ALL, charsPerRow = 300;
  function buildRows() {
    rows = [];
    // enough characters to span the full width even for the smallest font, plus the start offset
    charsPerRow = Math.ceil((W + 500) / 5) + 40;
    ALL_LONG = ALL.repeat(Math.ceil((charsPerRow * 2) / ALL.length) + 1);
    rowGap = Math.max(22, Math.min(34, H / 26));
    const n = Math.ceil(H / rowGap) + 2;
    bandH = n * rowGap;
    for (let i = 0; i < n; i++) {
      const depth = rand(i * 5 + 1);                    // 0 far … 1 near
      rows.push({
        y: i * rowGap,
        size: 10 + depth * 7,
        alpha: 0.05 + depth * 0.13,
        shift: -rand(i * 7 + 3) * 400,                  // horizontal start offset
        drift: (rand(i * 11) - 0.5) * 0.012,             // slow sideways drift
        start: Math.floor(rand(i * 13) * ALL.length),
      });
    }
  }
  function drawVerses(t) {
    const dt = Math.min(64, t - (lastT || t)); lastT = t;
    if (!reduceMotion) scroll = (scroll + dt * (0.008 + energy * 0.03 + (reading ? 0.025 : 0))) % bandH;
    const boost = energy * 0.6 + (reading ? 0.35 : 0) + (state === "listening" ? 0.2 : 0);
    ctx.save();
    ctx.textBaseline = "middle";
    for (const r of rows) {
      let y = r.y - scroll;
      if (y < -rowGap) y += bandH;
      // fade out near top and bottom edges
      const edge = Math.min(1, y / (H * 0.18), (H - y) / (H * 0.18));
      if (edge <= 0) continue;
      ctx.font = `${r.size.toFixed(1)}px "Noto Sans Devanagari", sans-serif`;
      ctx.fillStyle = `rgba(130,200,255,${(r.alpha * (1 + boost) * edge).toFixed(3)})`;
      const text = ALL_LONG.slice(r.start, r.start + charsPerRow);
      const x = r.shift + (reduceMotion ? 0 : t * r.drift) % 300;
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  // ---------------- face ----------------
  // smile: 0..1 lifts the corners and shows a little more of the lower lip and teeth
  function mouthPaths(open, wide, smile = 0) {
    const cx = 200, cy = 240;
    const w = 12 + Math.max(wide, smile) * 5 + smile * 2 - (open > 0.5 && wide < 0.3 ? 2.5 : 0);
    const o = Math.max(open * 10, smile * 3.2);
    const L = cx - w, R = cx + w;
    const cc = cy - smile * 4.5; // corner height
    const cav = `M${L},${cc} Q${cx},${cy - o * 0.6 - smile} ${R},${cc} Q${cx},${cy + o * 1.9 + smile * 3} ${L},${cc} Z`;
    const lower = `M${L - 1},${cc} Q${cx},${cy + o * 1.9 + smile * 3} ${R + 1},${cc}` +
      ` C${R - 3},${cy + 7 + o + smile * 2} ${L + 3},${cy + 7 + o + smile * 2} ${L - 1},${cc} Z`;
    const shn = `M${cx - w * 0.4},${cy + 4 + o * 0.95} Q${cx},${cy + 6 + o} ${cx + w * 0.4},${cy + 4 + o * 0.95}` +
      ` Q${cx},${cy + 5 + o * 0.95} ${cx - w * 0.4},${cy + 4 + o * 0.95} Z`;
    return { cav, lower, shn, top: cy - o * 0.3, o };
  }

  function drawFace(t) {
    mouth.open += (mouth.tOpen - mouth.open) * 0.35;
    mouth.wide += (mouth.tWide - mouth.wide) * 0.35;
    if (state !== "speaking") { mouth.tOpen *= 0.8; mouth.tWide += (0.5 - mouth.tWide) * 0.1; }
    energy += ((state === "speaking" ? mouth.open : 0) - energy) * 0.08;

    smileAmt += ((celebrating() || Date.now() < smileUntil ? 1 : 0) - smileAmt) * ease(300);
    const p = mouthPaths(mouth.open, mouth.wide, smileAmt);
    cavity.setAttribute("d", p.cav);
    mouthClip.setAttribute("d", p.cav);
    lipLower.setAttribute("d", p.lower);
    shine.setAttribute("d", p.shn);
    teeth.setAttribute("y", p.top - 1);
    teeth.setAttribute("height", Math.max(0, p.o * 0.32));
    beard.setAttribute("transform", `translate(0,${(mouth.open * 5).toFixed(2)})`);

    // blink (reading: slower, softer lids)
    if (!reduceMotion && !meditating() && t > nextBlink && !blinkStart) blinkStart = t;
    if (blinkStart) {
      const e = (t - blinkStart) / 150;
      blink = e < 1 ? e : e < 2 ? 2 - e : 0;
      if (e >= 2) { blinkStart = 0; nextBlink = t + 2400 + Math.random() * 4200; if (Math.random() < 0.15) nextBlink = t + 260; }
    }
    // studying = meditating: eyes gently close; otherwise calm, slightly lowered lids
    meditate += ((meditating() ? 1 : 0) - meditate) * ease(250);
    const rest = Math.max(state === "thinking" ? 0.22 : 0.12, smileAmt * 0.3); // happy eyes narrow a little when he smiles
    const lidH = Math.max(blink, rest, meditate) * 18;
    lids.forEach((l) => l.setAttribute("height", lidH.toFixed(1)));

    // where the visitor's mouse / finger is, relative to his face (-1..1); only while awake
    const follow = !reduceMotion && !meditating() && Date.now() - pointer.t < 5000;
    let fx = 0, fy = 0;
    if (follow) {
      fx = Math.max(-1, Math.min(1, (pointer.x - head.cx) / (W * 0.45)));
      fy = Math.max(-1, Math.min(1, (pointer.y - (head.cy - head.ry * 0.2)) / (H * 0.45)));
    }
    look.x += (fx - look.x) * ease(220); look.y += (fy - look.y) * ease(220);

    // gaze: follow the cursor; reading looks down and scans left to right; otherwise calm wandering
    if (follow) {
      gaze.tx = fx * 3.4; gaze.ty = fy * 2.6;
    } else if (meditating() && !reduceMotion) {
      gaze.tx = Math.sin(t * 0.0016) * 2.6; gaze.ty = 2.2;
    } else if (t > gaze.next) {
      const calm = state === "listening" || state === "speaking";
      gaze.tx = calm ? 0 : (Math.random() - 0.5) * 3.5;
      gaze.ty = calm ? 0 : state === "thinking" ? -1.8 : (Math.random() - 0.5) * 1.4;
      gaze.next = t + 1400 + Math.random() * 2800;
    }
    gaze.x += (gaze.tx - gaze.x) * 0.08; gaze.y += (gaze.ty - gaze.y) * 0.08;
    pupils.forEach((pp) => pp.setAttribute("transform", `translate(${gaze.x.toFixed(2)},${gaze.y.toFixed(2)})`));

    const lift = (state === "listening" ? 2 : 0) + energy * 2.5 - (reading ? 1 : 0);
    browL.setAttribute("transform", `translate(0,${(-lift).toFixed(2)})`);
    browR.setAttribute("transform", `translate(0,${(-lift).toFixed(2)})`);

    if (!reduceMotion) {
      const by = Math.sin(t * 0.0011) * 1.8;
      const nod = reading ? 1.2 : 0;
      // speaking sway continues on top of turning toward the cursor, so he never stops talking to look
      const rot = Math.sin(t * 0.0006) * 0.6 + (state === "speaking" ? Math.sin(t * 0.004) * energy * 1 : 0) + look.x * 4;
      const hx = look.x * 7, hy = by + nod + look.y * 5;
      headGroup.setAttribute("transform", `translate(${hx.toFixed(2)},${hy.toFixed(2)}) rotate(${rot.toFixed(2)} 200 330)`);
    }
    bindu.setAttribute("opacity", (0.75 + 0.25 * Math.sin(t * 0.003) + energy * 0.2).toFixed(2));
  }

  let lastFrame = 0, dtF = 16;
  const ease = (ms) => 1 - Math.exp(-dtF / ms); // time-based easing: same speed on fast and slow devices
  function frame(t) {
    dtF = Math.min(1000, t - (lastFrame || t)); lastFrame = t;
    drawFace(t);
    drawAura(t);
    drawVerses(t);
    requestAnimationFrame(frame);
  }

  window.SanatanAvatar = {
    setState(s) { state = s; },
    getState() { return state; },
    /** open: 0..1 jaw opening; wide: 0 (rounded "oo") .. 1 (spread "ee") */
    setViseme(open, wide) { mouth.tOpen = open; if (wide != null) mouth.tWide = wide; },
    setReading(on) { reading = !!on; },
    /** the words he is reading right now (OCR of the page, or the talk's transcript); "" = back to mantras */
    setLiveText(text) {
      const clean = String(text || "").replace(/\s+/g, " ").trim();
      const next = clean.length >= 40 ? clean + "  ·  " : MANTRAS;
      if (next === ALL) return;
      ALL = next;
      ALL_LONG = ALL.repeat(Math.ceil((charsPerRow * 2) / ALL.length) + 1);
      for (const r of rows) r.start = Math.floor(Math.random() * ALL.length);
    },
    /** wake up: open eyes and pay attention for ms (default 90s) */
    engage(ms = 90_000) { engagedUntil = Math.max(engagedUntil, Date.now() + ms); },
    /** reading progress of the current book, 0..1 (fills the golden ring) */
    setProgress(f) { progress = Math.max(0, Math.min(1, Number(f) || 0)); },
    /** a book was finished: full glowing circle, eyes open, smile */
    celebrate(ms = 6500) { celebrateStart = Date.now(); celebrateUntil = Date.now() + ms; },
    /** a warm smile (welcoming someone) */
    smile(ms = 4000) { smileUntil = Date.now() + ms; },
    /** look at a point on the stage (e.g. the visitor seen by the camera); same as the mouse */
    lookAt(x, y) { pointer.x = x; pointer.y = y; pointer.t = Date.now(); },
  };

  // track the mouse / finger over the page (relative to the stage)
  window.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.t = Date.now();
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.t = 0; });

  window.addEventListener("resize", layout);
  new ResizeObserver(layout).observe(stage);
  layout();
  requestAnimationFrame(frame);
})();
