// SANATAN voice: natural neural voice from the server (falls back to the browser's
// built-in voice), audio-driven lip-sync, and speech recognition.
(function () {
  const synth = window.speechSynthesis;
  const Avatar = () => window.SanatanAvatar;

  // engine: "natural" = server neural voice when available, "browser" = built-in voices only
  const settings = { enabled: true, lang: "auto", voiceURI: "", rate: 0.95, pitch: 0.85, engine: "natural" };
  const queue = [];
  let speaking = false;
  let voices = [];
  let currentVoice = null;
  let onIdle = null;
  let serverLangs = [];      // languages the server can speak naturally
  let generation = 0;        // bumps on stop(), so stale audio never plays

  // ---------- browser voices (fallback) ----------
  const MALE_HINTS = /(male|ravi|hemant|prabhat|madhur|rishi|aarav|kunal|valluvar|mohan|guy|david|mark|daniel|aaron|arthur|fred|alex|thomas|google uk english male)/i;
  const FEMALE_HINTS = /(female|heera|kalpana|swara|neerja|veena|lekha|aditi|raveena|zira|samantha|susan|hazel|karen|moira|tessa|kiara)/i;

  function loadVoices() { voices = synth ? synth.getVoices() : []; window.dispatchEvent(new Event("sanatan-voices")); }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

  function pickVoice(lang) {
    if (settings.voiceURI) {
      const v = voices.find((x) => x.voiceURI === settings.voiceURI);
      if (v) return v;
    }
    const base = lang.split("-")[0];
    const score = (v) => {
      let s = 0;
      if (v.lang === lang) s += 6; else if (v.lang.startsWith(base)) s += 4; else if (base === "en" && v.lang.startsWith("en")) s += 2;
      if (MALE_HINTS.test(v.name)) s += 3;
      if (FEMALE_HINTS.test(v.name)) s -= 3;
      if (/natural|neural|online/i.test(v.name)) s += 5; // Edge's "Online (Natural)" voices sound human
      return s;
    };
    const ranked = voices.filter((v) => v.lang && (v.lang.startsWith(base) || base === "en")).sort((a, b) => score(b) - score(a));
    return ranked[0] || null;
  }

  // ---------- language detection by script ----------
  function detectLang(text) {
    if (settings.lang !== "auto") return settings.lang;
    const tests = [
      [/[ঀ-৿]/, "bn-IN"], [/[஀-௿]/, "ta-IN"], [/[ఀ-౿]/, "te-IN"],
      [/[ಀ-೿]/, "kn-IN"], [/[ഀ-ൿ]/, "ml-IN"], [/[઀-૿]/, "gu-IN"],
      [/[਀-੿]/, "pa-IN"], [/[଀-୿]/, "or-IN"], [/[؀-ۿ]/, "ur-IN"],
      [/[ऀ-ॿ]/, "hi-IN"],
    ];
    for (const [re, l] of tests) if (re.test(text)) return l;
    return "en-IN";
  }
  // language for the server: the chosen language, or the script of the text
  function serverLang(text) {
    const chosen = settings.lang !== "auto" ? settings.lang.slice(0, 2) : "";
    const script = detectLang(text).slice(0, 2);
    // Devanagari letters only: the danda "।" is also used to end Bengali, Gujarati… sentences
    if (/[ऀ-ॣ०-ॿ]/.test(text)) return ["mr", "sa", "hi"].includes(chosen) ? chosen : "hi";
    return script;
  }

  // ---------- visemes ----------
  function viseme(ch) {
    const c = (ch || " ").toLowerCase();
    if (/[aāáàआअा]/.test(c)) return [0.95, 0.55];
    if (/[eēéiīíyइईएऐिीेै]/.test(c)) return [0.45, 1];
    if (/[oōóuūúwउऊओऔुूोौ]/.test(c)) return [0.6, 0.05];
    if (/[mbpमबपभफ]/.test(c)) return [0, 0.5];
    if (/[fvवफ़]/.test(c)) return [0.12, 0.7];
    if (/[\s.,;:!?।॥\-—]/.test(c)) return [0.04, 0.5];
    if (/[ऀ-ॿ]/.test(c)) return [0.32, 0.5];
    return [0.28, 0.55];
  }

  // ---------- audio playback with amplitude-driven lips ----------
  let actx = null, analyser = null, audioEl = null, levels = null, lipRaf = 0;
  function ensureAudio() {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = "auto";
    }
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        const src = actx.createMediaElementSource(audioEl);
        analyser = actx.createAnalyser();
        analyser.fftSize = 1024;
        levels = new Float32Array(analyser.fftSize);
        src.connect(analyser);
        analyser.connect(actx.destination);
      } catch { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume().catch(() => {});
  }

  function audioLips(text) {
    cancelAnimationFrame(lipRaf);
    const tick = () => {
      if (!audioEl || audioEl.paused) return;
      let open = 0.4;
      if (analyser) {
        analyser.getFloatTimeDomainData(levels);
        let sum = 0;
        for (let i = 0; i < levels.length; i++) sum += levels[i] * levels[i];
        const rms = Math.sqrt(sum / levels.length);
        open = Math.min(1, Math.max(0, (rms - 0.012) * 7));
      }
      // mouth shape follows the letter being spoken (estimated from playback position)
      const pos = audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
      const [shapeOpen, wide] = viseme(text[Math.floor(pos * text.length)]);
      Avatar().setViseme(shapeOpen === 0 ? open * 0.25 : open, wide);
      lipRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  async function fetchAudio(item, gen) {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: item.text, lang: item.lang, rate: settings.rate }),
    });
    if (gen !== generation) return null;
    if (!r.ok) throw new Error(`tts ${r.status}`);
    return URL.createObjectURL(await r.blob());
  }

  function wantsNatural(item) {
    return settings.engine === "natural" && serverLangs.includes(item.lang);
  }
  function prefetch(item, gen) {
    if (item && !item.pause && !item.audio && wantsNatural(item)) item.audio = fetchAudio(item, gen).catch(() => null);
  }

  // ---------- browser speech (fallback) with text-timed lips ----------
  let lip = null;
  function startLip(text, rate) {
    const cps = 13.5 * rate;
    lip = { text, idx: 0, t0: performance.now(), raf: 0 };
    const tick = () => {
      if (!lip) return;
      const elapsed = (performance.now() - lip.t0) / 1000;
      const i = Math.min(lip.text.length - 1, lip.idx + Math.floor(elapsed * cps));
      const [o, w] = viseme(lip.text[i]);
      Avatar().setViseme(Math.min(1, o * (o > 0.1 ? 0.85 + Math.random() * 0.25 : 1)), w);
      lip.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopLip() { if (lip) cancelAnimationFrame(lip.raf); lip = null; cancelAnimationFrame(lipRaf); Avatar().setViseme(0, 0.5); }

  function speakBrowser(item, done) {
    if (!synth) return done();
    const u = new SpeechSynthesisUtterance(item.text);
    const lang = detectLang(item.text);
    const v = pickVoice(lang);
    const base = lang.slice(0, 2);
    // No voice for this language on the device: an English voice would mangle it, so stay silent and say why.
    if (base !== "en" && (!v || v.lang.slice(0, 2).toLowerCase() !== base)) {
      window.dispatchEvent(new CustomEvent("sanatan-novoice", { detail: { lang } }));
      return done();
    }
    if (v) u.voice = v;
    currentVoice = v;
    u.lang = v ? v.lang : lang;
    u.rate = settings.rate;
    u.pitch = settings.pitch;
    u.onstart = () => { Avatar().setState("speaking"); startLip(item.text, settings.rate); say(item.text); };
    u.onboundary = (e) => { if (lip && (e.name === "word" || e.name === undefined)) { lip.idx = e.charIndex; lip.t0 = performance.now(); } };
    u.onend = () => { stopLip(); done(); };
    u.onerror = () => { stopLip(); done(); };
    synth.speak(u);
  }

  // tell the page which sentence is being spoken (for subtitles)
  const say = (text) => window.dispatchEvent(new CustomEvent("sanatan-say", { detail: { text } }));

  // ---------- queue ----------
  async function next() {
    const gen = generation;
    if (!queue.length) {
      speaking = false; stopLip();
      if (Avatar().getState() === "speaking") Avatar().setState("idle");
      if (onIdle) onIdle();
      return;
    }
    const item = queue.shift();
    if (item.pause) { stopLip(); setTimeout(() => gen === generation && next(), item.pause); return; }
    const done = () => { if (gen === generation) next(); };

    if (wantsNatural(item)) {
      prefetch(item, gen);
      prefetch(queue.find((q) => !q.pause), gen); // get the next sentence ready while this one plays
      const url = await item.audio;
      if (gen !== generation) return;
      if (url) {
        ensureAudio();
        audioEl.src = url;
        audioEl.playbackRate = 1;
        audioEl.onplay = () => { Avatar().setState("speaking"); audioLips(item.text); say(item.text); };
        audioEl.onended = () => { URL.revokeObjectURL(url); stopLip(); done(); };
        audioEl.onerror = () => { URL.revokeObjectURL(url); stopLip(); speakBrowser(item, done); };
        try { await audioEl.play(); return; } catch { /* autoplay blocked or decode error: use browser voice */ }
      }
    }
    speakBrowser(item, done);
  }

  function speak(markdownText) {
    if (!settings.enabled || !markdownText) return;
    const parts = markdownText.split(/\[pause\]/i);
    parts.forEach((part, i) => {
      const text = window.SanatanMD.toSpeech(part);
      const chunks = text.match(/[^.!?।॥]+[.!?।॥]*\s*/g) || [];
      let buf = "";
      const push = (t) => { t = t.trim(); if (t) queue.push({ text: t, lang: serverLang(t) }); };
      for (const c of chunks) {
        if ((buf + c).length > 220 && buf) { push(buf); buf = ""; }
        buf += c;
      }
      push(buf);
      if (i < parts.length - 1) queue.push({ pause: 600 });
    });
    if (!speaking) { speaking = true; next(); }
    else prefetch(queue.find((q) => !q.pause && !q.audio), generation);
  }

  function stop() {
    generation++;
    queue.length = 0;
    if (synth) synth.cancel();
    if (audioEl) { audioEl.pause(); audioEl.removeAttribute("src"); }
    speaking = false; stopLip();
    if (Avatar().getState() === "speaking") Avatar().setState("idle");
  }

  // Chrome's online "Google" voices stop after ~15s of continuous speech; nudge them.
  setInterval(() => {
    if (synth && synth.speaking && !synth.paused && currentVoice && /google/i.test(currentVoice.name)) { synth.pause(); synth.resume(); }
  }, 10000);

  // ---------- speech recognition ----------
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  // Problems the visitor should hear about (instead of silence)
  const MIC_ERRORS = {
    "not-allowed": "The microphone is blocked. Click the lock icon in the address bar and allow the microphone.",
    "service-not-allowed": "The microphone is blocked. Click the lock icon in the address bar and allow the microphone.",
    "audio-capture": "No microphone was found. Please connect one and try again.",
    network: "Voice recognition needs an internet connection (Chrome and Edge recognise speech online).",
    "language-not-supported": "This browser can't recognise speech in the chosen language. Try English or Hindi.",
  };
  function listen({ lang, onInterim, onFinal, onEnd, onError }) {
    if (!Rec) return false;
    stop();
    try { if (rec) rec.abort(); } catch {}
    const r = new Rec();
    rec = r;
    // "Auto": listen in Hindi (India). Visitors mostly speak Hindi/Hinglish, and an English (US) recogniser
    // returns nothing for Hindi speech, so he seemed not to respond. Hindi recognition also catches English words.
    r.lang = lang && lang !== "auto" ? lang : "hi-IN";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let finalText = "", lastInterim = "", ended = false;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      lastInterim = interim;
      onInterim && onInterim(finalText + interim);
    };
    r.onerror = (e) => {
      console.log(`[mic] recognition error: ${e.error}`);
      const msg = MIC_ERRORS[e.error];
      if (msg && onError) onError(msg, e.error);
    };
    r.onend = () => {
      if (ended) return;
      ended = true;
      if (rec === r) rec = null;
      onEnd && onEnd();
      // some browsers stop without marking the last words "final": use what was heard
      const said = (finalText || lastInterim).trim();
      if (said) onFinal && onFinal(said);
    };
    try { r.start(); } catch (err) {
      rec = null;
      if (onError) onError("Voice input could not start. Please try again.", "start");
      return false;
    }
    return true;
  }
  function stopListening() { if (rec) rec.stop(); }

  // Must run inside a user gesture (tap) so browsers allow sound.
  function unlock() {
    ensureAudio();
    if (synth) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); }
  }

  window.SanatanVoice = {
    settings, speak, stop, listen, stopListening, unlock,
    supported: { tts: !!synth || true, stt: !!Rec },
    get voices() { return voices; },
    get naturalLanguages() { return serverLangs; },
    setServerVoices(info) { serverLangs = info && info.available ? info.languages : []; },
    isSpeaking: () => speaking,
    set onIdle(fn) { onIdle = fn; },
  };
})();
