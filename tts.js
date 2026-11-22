// Krishna Sakha — natural (neural) voice on the server.
// Order of preference:
//   1. Azure Speech neural voices (if AZURE_SPEECH_KEY + AZURE_SPEECH_REGION are set): official, 500k chars/month free
//   2. Microsoft neural voices through the free Edge "Read aloud" service (TTS_EDGE=false turns it off):
//      the same studio voices (Madhur, Manohar, Prabhat...), very accurate word pronunciation, no key needed
//   3. Piper (free, offline, runs on this computer): used automatically when 1–2 are unreachable
//   4. Nothing: the browser falls back to its own built-in voice
// Generated audio is cached on disk, so repeated sentences (like the greeting) are instant.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

// Male Indian neural voices on Azure (used only when an Azure key is configured).
const AZURE_VOICES = {
  en: ["en-IN", "en-IN-PrabhatNeural"], hi: ["hi-IN", "hi-IN-MadhurNeural"], mr: ["mr-IN", "mr-IN-ManoharNeural"],
  sa: ["hi-IN", "hi-IN-MadhurNeural"], bn: ["bn-IN", "bn-IN-BashkarNeural"], ta: ["ta-IN", "ta-IN-ValluvarNeural"],
  te: ["te-IN", "te-IN-MohanNeural"], kn: ["kn-IN", "kn-IN-GaganNeural"], ml: ["ml-IN", "ml-IN-MidhunNeural"],
  gu: ["gu-IN", "gu-IN-NiranjanNeural"], ur: ["ur-IN", "ur-IN-SalmanNeural"],
  // Microsoft has no Punjabi voice: Punjabi is converted from Gurmukhi to Devanagari (see toDevanagari)
  // and read by the Hindi voice, which pronounces Punjabi words closely.
  pa: ["hi-IN", "hi-IN-MadhurNeural"],
};

// Gurmukhi -> Devanagari. Both Unicode blocks share the same layout (Gurmukhi = Devanagari + 0x100), so most
// letters map directly; only Gurmukhi's own marks need care: tippi (nasal), addak (doubles the next consonant),
// yakash (subscript y) and the vowel bearers iri / ura.
export function toDevanagari(text) {
  return String(text)
    .replace(/ੱ([ਕ-ਹਖ਼-ਫ਼])/g, (m, c) => `${c}੍${c}`)   // addak: ੱਕ -> ਕ੍ਕ
    .replace(/ੲ/g, "इ").replace(/ੳ/g, "उ")                      // iri, ura
    .replace(/[ਁ-ੵ]/g, (ch) => {
      const c = ch.charCodeAt(0);
      if (c === 0x0A70) return "ं";          // tippi -> anusvara
      if (c === 0x0A75) return "्य";    // yakash -> ्य
      if (c === 0x0A51 || c === 0x0A71) return ""; // udaat / stray addak
      return String.fromCharCode(c - 0x100);
    })
    .replace(/स़/g, "श")    // ਸ + nukta (ਸ਼, often typed as two letters) -> श, not स़
    .replace(/ल़/g, "ळ");   // ਲ + nukta (ਲ਼) -> ळ
}

// Piper voice files in tools/piper/voices (male voices).
// Marathi uses the Hindi voice: the mr_IN-google model hits a phoneme bug in this Piper build.
// PIPER_HINDI_VOICE in .env can switch Hindi/Sanskrit/Marathi to "hi_IN-pratham-medium".
const HINDI = process.env.PIPER_HINDI_VOICE || "hi_IN-rohan-medium";
const PIPER_VOICES = {
  en: process.env.PIPER_ENGLISH_VOICE || "en_GB-alan-medium", hi: HINDI, sa: HINDI, mr: HINDI,
  te: "te_IN-venkatesh-medium", ml: "ml_IN-arjun-medium",
};

// Pick a language from the script the text is written in (hint wins when it matches the script).
export function langOf(text, hint = "") {
  const h = String(hint).slice(0, 2).toLowerCase();
  // other scripts first: Bengali, Gujarati etc. also end sentences with the Devanagari danda "।" (U+0964)
  const scripts = [[/[ঀ-৿]/, "bn"], [/[஀-௿]/, "ta"], [/[ఀ-౿]/, "te"], [/[ಀ-೿]/, "kn"],
    [/[ഀ-ൿ]/, "ml"], [/[઀-૿]/, "gu"], [/[਀-੿]/, "pa"], [/[؀-ۿ]/, "ur"]];
  for (const [re, l] of scripts) if (re.test(text)) return l;
  if (/[ऀ-ॣ०-ॿ]/.test(text)) return ["mr", "sa", "hi"].includes(h) ? h : "hi"; // Devanagari, danda excluded
  return "en";
}

export function createTTS(rootDir) {
  const PIPER_DIR = path.join(rootDir, "tools", "piper");
  const PIPER_EXE = path.join(PIPER_DIR, process.platform === "win32" ? "piper.exe" : "piper");
  const CACHE = path.join(rootDir, "tts-cache");
  const azure = process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION
    ? { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION } : null;
  const piperOn = process.env.TTS_PIPER !== "false" && existsSync(PIPER_EXE);
  const edgeOn = process.env.TTS_EDGE !== "false";
  let edgeDownUntil = 0, edgeFails = 0; // after repeated failures, use Piper for a few minutes instead of waiting on the network
  const piperHas = (lang) => piperOn && PIPER_VOICES[lang] && existsSync(path.join(PIPER_DIR, "voices", `${PIPER_VOICES[lang]}.onnx`));

  let busy = 0;
  const waiters = [];
  const slot = async () => { if (busy >= 2) await new Promise((r) => waiters.push(r)); busy++; };
  const release = () => { busy--; const w = waiters.shift(); if (w) w(); };

  function engineFor(lang) {
    if (azure && AZURE_VOICES[lang]) return "azure";
    if (edgeOn && AZURE_VOICES[lang] && (Date.now() > edgeDownUntil || !piperHas(lang))) return "edge";
    if (piperHas(lang)) return "piper";
    return null;
  }

  function info() {
    const langs = [...new Set([...Object.keys(AZURE_VOICES), ...Object.keys(PIPER_VOICES)])].filter(engineFor);
    return { available: langs.length > 0, engine: azure ? "azure" : edgeOn ? "edge" : piperOn ? "piper" : null, languages: langs };
  }

  async function edgeSynth(text, lang, rate) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(AZURE_VOICES[lang][1], OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const pct = Math.round((rate - 1) * 100);
      const { audioStream } = tts.toStream(xml(text), { rate: `${pct >= 0 ? "+" : ""}${pct}%` });
      const parts = [];
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Edge TTS timed out")), 20000);
        audioStream.on("data", (d) => parts.push(d));
        audioStream.on("end", () => { clearTimeout(t); resolve(); });
        audioStream.on("error", (e) => { clearTimeout(t); reject(e); });
      });
      const buf = Buffer.concat(parts);
      if (buf.length < 500) throw new Error("Edge TTS returned no audio");
      return buf;
    } finally { try { tts.close(); } catch {} }
  }

  const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  async function azureSynth(text, lang, rate) {
    const [locale, voice] = AZURE_VOICES[lang];
    const pct = Math.round((rate - 1) * 100);
    const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="${pct >= 0 ? "+" : ""}${pct}%">${xml(text)}</prosody></voice></speak>`;
    const r = await fetch(`https://${azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": azure.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "sanatan-tts",
      },
      body: ssml,
    });
    if (!r.ok) throw new Error(`Azure TTS ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }

  // ---- Piper kept loaded: one long-running process per voice+speed (model loads once; ~0.25s per sentence after) ----
  const workers = new Map(); // key -> { proc, queue: [{ outFile, resolve, reject }], timer }
  function worker(lang, rate) {
    const ls = (1 / rate).toFixed(2);
    const key = `${PIPER_VOICES[lang]}|${ls}`;
    let w = workers.get(key);
    if (w && !w.dead) return w;
    const model = path.join(PIPER_DIR, "voices", `${PIPER_VOICES[lang]}.onnx`);
    const proc = spawn(PIPER_EXE, ["--model", model, "--json-input", "--length_scale", ls, "--sentence_silence", "0.2"],
      { cwd: PIPER_DIR, windowsHide: true });
    w = { proc, queue: [], dead: false, timer: null, buf: "" };
    const fail = (err) => {
      w.dead = true; workers.delete(key);
      for (const job of w.queue.splice(0)) job.reject(err);
    };
    proc.stdout.on("data", (d) => {
      w.buf += d;
      let i;
      while ((i = w.buf.indexOf("\n")) >= 0) {   // piper prints the output path when a sentence is done
        w.buf = w.buf.slice(i + 1);
        const job = w.queue.shift();
        if (job) job.resolve();
      }
    });
    proc.stderr.on("data", () => {});
    proc.on("error", fail);
    proc.on("close", () => fail(new Error("piper worker stopped")));
    workers.set(key, w);
    return w;
  }
  function piperFast(text, lang, rate, outFile) {
    return new Promise((resolve, reject) => {
      const w = worker(lang, rate);
      clearTimeout(w.timer);
      w.timer = setTimeout(() => { try { w.proc.stdin.end(); } catch {} }, 10 * 60 * 1000); // free memory after 10 idle minutes
      w.queue.push({ outFile, resolve, reject });
      w.proc.stdin.write(JSON.stringify({ text: text.replace(/\s+/g, " "), output_file: outFile }) + "\n");
    });
  }

  function piperSynth(text, lang, rate, outFile) {
    return new Promise((resolve, reject) => {
      const model = path.join(PIPER_DIR, "voices", `${PIPER_VOICES[lang]}.onnx`);
      const args = ["--model", model, "--output_file", outFile, "--length_scale", (1 / rate).toFixed(2), "--sentence_silence", "0.2"];
      const p = spawn(PIPER_EXE, args, { cwd: PIPER_DIR, windowsHide: true });
      let err = "";
      p.stderr.on("data", (d) => { err += d; if (err.length > 4000) err = err.slice(-2000); });
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`piper exited ${code}: ${err.slice(-300)}`))));
      p.stdin.end(text.replace(/\s+/g, " ") + "\n");
    });
  }

  /** Returns a WAV Buffer, or null when no natural voice exists for this language. */
  async function synth(text, hint = "", rate = 1) {
    let clean = String(text).replace(/[*_`#>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 700);
    if (!clean) return null;
    const lang = langOf(clean, hint);
    if (lang === "pa") clean = toDevanagari(clean);
    let engine = engineFor(lang);
    if (!engine) return null;
    rate = Math.min(1.4, Math.max(0.6, Number(rate) || 1));

    const fileFor = (eng) => {
      const key = createHash("sha1").update(`${eng}|${eng === "piper" ? PIPER_VOICES[lang] : AZURE_VOICES[lang][1]}|${lang}|${rate}|${clean}`).digest("hex");
      return path.join(CACHE, `${key}.${eng === "edge" ? "mp3" : "wav"}`);
    };
    let file = fileFor(engine);
    try { if ((await stat(file)).size > 44) return await readFile(file); } catch {}
    await mkdir(CACHE, { recursive: true });

    await slot();
    try {
      if (engine === "azure") await writeFile(file, await azureSynth(clean, lang, rate));
      else if (engine === "edge") {
        try { await writeFile(file, await edgeSynth(clean, lang, rate)); edgeDownUntil = 0; edgeFails = 0; }
        catch (e) {
          if (++edgeFails >= 2) {
            console.warn(`[tts] Microsoft voice unavailable (${e.message}); using the offline Piper voice for 5 minutes.`);
            edgeDownUntil = Date.now() + 5 * 60 * 1000; edgeFails = 0;
          }
          if (!piperHas(lang)) throw e;
          engine = "piper"; file = fileFor("piper");
          try { if ((await stat(file)).size > 44) return await readFile(file); } catch {}
          try { await piperFast(clean, lang, rate, file); } catch { await piperSynth(clean, lang, rate, file); }
        }
      } else {
        try { await piperFast(clean, lang, rate, file); }
        catch { await piperSynth(clean, lang, rate, file); } // worker crashed: one-off process as a fallback
      }
    } finally { release(); }
    return readFile(file);
  }

  /** Load the most-used voices ahead of time so the first sentence is quick too. */
  function warm(rate = 0.95) {
    if (!piperOn || azure || edgeOn) return; // Piper is only the backup now: it loads when first needed
    for (const lang of ["hi", "en"]) {
      if (engineFor(lang) !== "piper") continue;
      try { worker(lang, rate); } catch { /* ignore: falls back to on-demand */ }
    }
  }

  return { synth, info, warm };
}
