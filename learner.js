// SANATAN — Learner
// Reads every book and note in ./library one at a time, extracts its text into
// ./library/.knowledge/, and reports what it is reading right now so the page
// can show "Sanatan is now reading …". Scanned books (images only) and books in old
// Hindi fonts are then read with OCR (Tesseract, Hindi + English), one page at a
// time, saving progress after every page. Runs on this computer only; no API credits.

import { readFile, writeFile, mkdir, readdir, stat, unlink, appendFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { findPicture } from "./picture.js";

const TEXT_EXT = [".txt", ".md"];
const HTML_EXT = [".html", ".htm"];
const MEDIA_EXT = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".mp4", ".mkv", ".webm", ".mov", ".avi"];
const SUBTITLE_EXT = [".srt", ".vtt"];
const JUDGE_V = 4; // bump when the text-quality check changes, so old results are re-checked

export function createLearner(rootDir) {
  const LIB = path.join(rootDir, "library");
  const KDIR = path.join(LIB, ".knowledge");
  const MANIFEST = path.join(KDIR, "index.json");
  const LOG = path.join(KDIR, "learning-log.jsonl");

  let manifest = {};
  let running = false, again = false, timer = null;
  const now = { state: "idle", mode: null, file: null, folder: null, page: 0, pages: 0, startedAt: null };
  let lastFile = null;
  let ocrWorker = null;

  const yieldLoop = () => new Promise((r) => setImmediate(r));

  async function loadManifest() {
    try { manifest = JSON.parse(await readFile(MANIFEST, "utf8")); } catch { manifest = {}; }
  }
  async function saveManifest() {
    await mkdir(KDIR, { recursive: true });
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 1));
  }

  async function walk(dir, base = "") {
    let out = [];
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.endsWith(".uploading")) continue;
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) out = out.concat(await walk(path.join(dir, e.name), rel));
      else out.push(rel);
    }
    return out;
  }

  // ---------- text extractors ----------
  const stripHtml = (h) => h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

  async function readPdf(full) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(await readFile(full));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    now.pages = doc.numPages;
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      await waitWhileTalking();
      now.page = i;
      try {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        let line = "";
        for (const it of tc.items) { line += it.str; if (it.hasEOL) line += "\n"; else line += " "; }
        parts.push(`[page ${i}]\n${line.trim()}`);
        page.cleanup();
      } catch { parts.push(`[page ${i}]`); }
      if (i % 5 === 0) await yieldLoop();
    }
    await doc.destroy();
    return { text: parts.join("\n\n"), pages: now.pages };
  }

  async function readEpub(full) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await readFile(full));
    let order = [];
    try {
      const container = await zip.file("META-INF/container.xml").async("string");
      const opfPath = container.match(/full-path="([^"]+)"/)[1];
      const opf = await zip.file(opfPath).async("string");
      const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
      const items = {};
      for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
        const id = m[0].match(/id="([^"]+)"/)?.[1], href = m[0].match(/href="([^"]+)"/)?.[1];
        if (id && href) items[id] = baseDir + decodeURIComponent(href);
      }
      order = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => items[m[1]]).filter(Boolean);
    } catch { /* fall back to file-name order */ }
    if (!order.length) order = Object.keys(zip.files).filter((n) => /\.x?html?$/i.test(n)).sort();
    now.pages = order.length;
    const parts = [];
    for (let i = 0; i < order.length; i++) {
      now.page = i + 1;
      const f = zip.file(order[i]);
      if (f) parts.push(stripHtml(await f.async("string")));
      await yieldLoop();
    }
    return { text: parts.join("\n\n"), pages: order.length };
  }

  async function readDocx(full) {
    const mammoth = (await import("mammoth")).default;
    const r = await mammoth.extractRawText({ buffer: await readFile(full) });
    return { text: r.value, pages: 0 };
  }

  async function readSubtitles(full) {
    const raw = await readFile(full, "utf8");
    const text = raw.replace(/^WEBVTT.*$/m, "").replace(/^\d+\s*$/gm, "")
      .replace(/^[\d:.,]+\s+-->\s+[\d:.,]+.*$/gm, "").replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
    return { text, pages: 0 };
  }

  // Old Hindi PDFs often use legacy fonts (Kruti Dev etc.): the text comes out as
  // Latin gibberish like "gS esa dk" instead of "है में का". Flag those.
  // Real text is full of everyday words; garbled text layers (old fonts, someone
  // else's failed OCR, "____" lines) have almost none. Anything that fails goes to OCR.
  const COMMON_DEVA = new Set(["है", "हैं", "के", "में", "की", "और", "से", "का", "को", "पर", "यह", "भी", "नहीं", "तो", "एक", "कि", "था", "हो", "ही", "इस",
    "आहे", "आणि", "या", "हे", "ते", "व", "त्या", "होते", "न", "च", "च्या", "तत्र", "इति", "तस्य", "सः", "अपि", "वा"]);
  const COMMON_EN = new Set(["the", "of", "and", "to", "in", "is", "a", "that", "for", "it", "as", "with", "be", "by", "this", "which", "his", "he", "are", "from"]);

  function judge(text, pages) {
    const body = text.replace(/\[page \d+\]/g, " ");
    const letters = (body.match(/\p{L}/gu) || []).length;
    if (letters < 150 || (pages && letters / pages < 25)) {
      return { status: "needs-ocr", note: "Scanned pages (images); no readable text inside. Needs OCR." };
    }
    const deva = (body.match(/[ऀ-ॿ]/g) || []).length;
    const words = body.split(/[\s।॥,.;:!?"'“”‘’()[\]{}\-–—|/]+/).filter(Boolean);
    if (deva / letters > 0.4) {
      const dw = words.filter((w) => /[ऀ-ॿ]/.test(w));
      const common = dw.filter((w) => COMMON_DEVA.has(w)).length / (dw.length || 1);
      if (common < 0.03) return { status: "garbled", note: "The PDF's text layer is garbled (broken font). Queued for OCR." };
      // Real Devanagari never starts a word with a vowel sign (ि ा ु …). Broken PDF fonts do this a lot
      // (measured: good text ≤1.1%, broken text layers 1.9–16%).
      const badStart = dw.filter((w) => /^[ा-्ंःॢॣ]/.test(w)).length / (dw.length || 1);
      if (badStart > 0.015) return { status: "garbled", note: "The PDF's text layer has misplaced vowel signs (broken font). Queued for OCR." };
      // Broken font mappings turn letters into ऩ / ऱ / ऴ, which modern Hindi almost never uses
      // (measured: real books 0.00%, a broken web copy 1.45% of Devanagari characters)
      const rare = (body.match(/[ऩऱऴ]/g) || []).length / (deva || 1);
      if (rare > 0.003) return { status: "garbled", note: "The text uses a broken Hindi font (letters came out wrong). Queued for OCR." };
    } else {
      const lw = words.map((w) => w.toLowerCase());
      const common = lw.filter((w) => COMMON_EN.has(w)).length / (lw.length || 1);
      const legacyHits = lw.filter((w) => /^(gs|esa|dk|ds|dh|vksj|;g|fkk|tks|ugha|fd)$/.test(w)).length / (lw.length || 1);
      if (legacyHits > 0.03) return { status: "legacy-font", note: "Hindi in an old font (e.g. Kruti Dev). Queued for OCR." };
      if (common < 0.03) return { status: "garbled", note: "The PDF's text layer is garbled (bad embedded OCR). Queued for OCR." };
    }
    return { status: "learned", note: "" };
  }

  async function learnOne(folder, rel) {
    await waitWhileTalking();
    const full = path.join(LIB, folder, rel);
    const ext = path.extname(rel).toLowerCase();
    const s = await stat(full);
    const id = `${folder}/${rel}`;
    const entry = { size: s.size, mtime: s.mtimeMs, folder, learnedAt: new Date().toISOString() };

    if (MEDIA_EXT.includes(ext)) {
      Object.assign(entry, { status: "needs-transcription", kind: "media", note: "Audio/video: waiting to be listened to (speech to text)." });
      manifest[id] = entry;
      return;
    }

    let reader = null;
    if (TEXT_EXT.includes(ext)) reader = async () => ({ text: await readFile(full, "utf8"), pages: 0 });
    else if (HTML_EXT.includes(ext)) reader = async () => ({ text: stripHtml(await readFile(full, "utf8")), pages: 0 });
    else if (ext === ".pdf") reader = () => readPdf(full);
    else if (ext === ".epub") reader = () => readEpub(full);
    else if (ext === ".docx") reader = () => readDocx(full);
    else if (SUBTITLE_EXT.includes(ext)) reader = () => readSubtitles(full);

    if (!reader) {
      Object.assign(entry, { status: "unsupported", note: `No reader for ${ext} files yet.` });
      manifest[id] = entry;
      return;
    }

    Object.assign(now, { state: "reading", mode: "text", id: `${folder}/${rel}`, file: path.basename(rel), folder, page: 0, pages: 0, startedAt: Date.now() });
    try {
      const { text, pages } = await reader();
      const verdict = judge(text, pages);
      const out = path.join(KDIR, folder, `${rel}.txt`);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, `# ${rel}\n# source: library/${folder}/${rel}\n# status: ${verdict.status}\n\n${text}`);
      Object.assign(entry, verdict, { chars: text.length, pages, judgeV: JUDGE_V });
      if (verdict.status === "learned") await finished(path.basename(rel), `${folder}/${rel}`);
    } catch (err) {
      Object.assign(entry, { status: "error", note: String(err?.message || err).slice(0, 200) });
    }
    manifest[id] = entry;
    await appendFile(LOG, JSON.stringify({ date: entry.learnedAt, file: id, status: entry.status, pages: entry.pages || 0 }) + "\n").catch(() => {});
  }

  // ---------- pass 1: quick text extraction of new or changed files ----------
  async function changedFiles() {
    const seen = new Set(), changed = [];
    for (const folder of ["notes", "books", "media"]) {
      for (const rel of await walk(path.join(LIB, folder))) {
        const id = `${folder}/${rel}`;
        seen.add(id);
        let s;
        try { s = await stat(path.join(LIB, folder, rel)); } catch { continue; }
        const m = manifest[id];
        const fresh = m && m.size === s.size && Math.abs(m.mtime - s.mtimeMs) < 1 && m.status !== "error";
        // re-check texts read under an older quality check (but never redo OCR work)
        const recheck = fresh && m.source !== "ocr" && m.status !== "ocr-in-progress" && m.judgeV !== JUDGE_V && !MEDIA_EXT.includes(path.extname(rel).toLowerCase());
        if (fresh && !recheck) continue;
        changed.push([folder, rel]);
      }
    }
    return { seen, changed };
  }

  // Books read by OCR before the OCR quality check existed: re-check them from the saved text (no new OCR).
  async function recheckOcr() {
    let changed = false;
    for (const [id, m] of Object.entries(manifest)) {
      if (m.source !== "ocr" || m.status !== "learned" || m.ocrJudged) continue;
      try {
        const text = (await readFile(path.join(KDIR, `${id}.txt`), "utf8")).replace(/^#.*\n/gm, "");
        if (judge(text, m.pages).status !== "learned") {
          Object.assign(m, { status: "unreadable", note: "OCR could not read this scan clearly (poor print or image quality)." });
        }
        m.ocrJudged = 1; changed = true;
      } catch { /* text missing: leave as is */ }
    }
    if (changed) await saveManifest();
  }

  async function textPass() {
    await recheckOcr();
    const { seen, changed } = await changedFiles();
    for (const [folder, rel] of changed) {
      await learnOne(folder, rel);
      lastFile = path.basename(rel);
      await saveManifest();
    }
    // forget files that were removed from the library
    for (const id of Object.keys(manifest)) {
      if (!seen.has(id)) {
        delete manifest[id];
        await unlink(path.join(KDIR, `${id}.txt`)).catch(() => {});
        await unlink(path.join(KDIR, `${id}.ocr-partial.txt`)).catch(() => {});
        await unlink(path.join(KDIR, `${id}.listen-partial.txt`)).catch(() => {});
      }
    }
    await saveManifest();
  }

  // ---------- pass 2: OCR for scanned books and old-font books ----------
  const OCR_STATES = ["ocr-in-progress", "needs-ocr", "legacy-font", "garbled"];
  // ---------- pass 2a: LISTEN to audio / video (speech to text with Whisper, offline) ----------
  // The recording is decoded with ffmpeg and transcribed in 5-minute segments; each passage keeps its
  // time ("[time 12:34]") so answers can say where in the talk it was said. Progress is saved per segment.
  const WHISPER_MODEL = process.env.WHISPER_MODEL || "Xenova/whisper-medium";
  const OLD_ASR = "onnx-community/whisper-small"; // what recordings learned before m.asrModel existed used
  // 60-second segments keep each Whisper call small: the medium model holds about 0.6 GB per minute of audio
  const SEGMENT = Number(process.env.WHISPER_SEGMENT) || 60; // seconds
  // Most recordings are Hindi; a file named "...English..." is English; WHISPER_LANGUAGE in .env changes the default
  const speechLanguage = (id) => (/\b(english|eng)\b/i.test(id) ? "english" : /\bsanskrit\b/i.test(id) ? "sanskrit" : /\bmarathi\b/i.test(id) ? "marathi" : (process.env.WHISPER_LANGUAGE || "hindi"));

  // Whisper runs in a separate process (asr-worker.mjs). If it runs out of memory only the worker dies;
  // the server keeps answering and the segment is retried with a fresh worker. The worker is also
  // restarted every few segments so its memory never builds up.
  const RECYCLE_AFTER = 5;
  let asrProc = null, asrServed = 0, jobSeq = 0;
  function stopAsr() { if (asrProc) { try { asrProc.kill(); } catch {} asrProc = null; } asrServed = 0; }
  async function asrJob(job) {
    if (asrProc && asrServed >= RECYCLE_AFTER) stopAsr();
    if (!asrProc) {
      const { fork } = await import("node:child_process");
      asrProc = fork(path.join(rootDir, "asr-worker.mjs"), [], {
        env: { ...process.env, WHISPER_MODEL }, execArgv: ["--max-old-space-size=4096"], windowsHide: true,
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      asrProc.stderr.on("data", () => {}); // model warnings are noisy; drop them
    }
    const proc = asrProc, id = ++jobSeq;
    return new Promise((resolve, reject) => {
      const onMsg = (msg) => { if (msg?.id !== id) return; cleanup(); asrServed++; resolve(msg); };
      const onExit = (code) => { cleanup(); if (asrProc === proc) asrProc = null; reject(new Error(`speech worker stopped (${code})`)); };
      const cleanup = () => { proc.off("message", onMsg); proc.off("exit", onExit); };
      proc.on("message", onMsg); proc.on("exit", onExit);
      proc.send({ id, ...job });
    });
  }
  async function ffmpegPath() { return (await import("ffmpeg-static")).default; }
  async function mediaDuration(full) {
    const ff = await ffmpegPath();
    const { spawn } = await import("node:child_process");
    return new Promise((res) => {
      const p = spawn(ff, ["-hide_banner", "-i", full], { windowsHide: true });
      let err = ""; p.stderr.on("data", (d) => { err += d; });
      p.on("close", () => {
        const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        res(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0);
      });
      p.on("error", () => res(0));
    });
  }
  const clock = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`; };

  function nextMedia() {
    // also re-listen recordings learned with a different (older) speech model, so they get the better transcript
    const upgrade = (m) => m.status === "learned" && m.source === "listen" && (m.asrModel || OLD_ASR) !== WHISPER_MODEL;
    const busy = (m) => m.status === "listening" || m.relistening;
    const list = Object.entries(manifest).filter(([, m]) => (m.status === "needs-transcription" || m.status === "listening" || upgrade(m)) && !m.listenFailed)
      .sort(([, a], [, b]) => (busy(a) ? 0 : 1) - (busy(b) ? 0 : 1) || (a.size || 0) - (b.size || 0));
    return list.length ? list[0][0] : null;
  }

  async function listenMedia(id) {
    const m = manifest[id];
    const full = path.join(LIB, id);
    const partial = path.join(KDIR, `${id}.listen-partial.txt`);
    await mkdir(path.dirname(partial), { recursive: true });
    const upgrading = m.status === "learned";                         // old transcript stays searchable meanwhile
    let done = m.status === "listening" || m.relistening ? m.listenDone || 0 : 0;     // seconds already transcribed
    if (done === 0) await writeFile(partial, "");
    const duration = m.duration || (await mediaDuration(full));
    if (!duration) { Object.assign(m, { listenFailed: true, note: "Could not read this audio/video file." }); await saveManifest(); return "failed"; }
    Object.assign(m, upgrading ? { relistening: true, kind: "media", duration } : { status: "listening", kind: "media", duration });
    Object.assign(now, { state: "reading", mode: "listen", id, file: path.basename(id), folder: id.split("/")[0], page: Math.round(done), pages: Math.round(duration), startedAt: Date.now() });

    for (let start = done; start < duration; start += SEGMENT) {
      if (again) {
        again = false;
        const { changed } = await changedFiles();
        if (changed.length) { await saveManifest(); return "interrupted"; }
      }
      await waitWhileTalking();
      now.page = Math.round(start);
      let lines = "";
      const job = { file: full, start, len: Math.min(SEGMENT, duration - start), language: speechLanguage(id) };
      let res = null;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try { res = await asrJob(job); } catch { stopAsr(); } // worker died (e.g. out of memory): retry once fresh
      }
      if (res?.loadError) {
        stopAsr();
        Object.assign(m, { listenFailed: true, note: `Speech-to-text model could not load: ${res.loadError.slice(0, 100)}` });
        if (upgrading) delete m.relistening;
        await saveManifest(); return "failed";
      }
      for (const c of res?.chunks || []) lines += `[time ${clock(start + c.at)}]\n${c.text}\n\n`; // unreadable segment: skipped
      if (res?.chunks?.length) setLive({ id, page: Math.round(start), text: res.chunks.map((c) => c.text).join(" "), image: null });
      await appendFile(partial, lines);
      m.listenDone = Math.min(duration, start + SEGMENT);
      now.page = Math.round(m.listenDone);
      await saveManifest();
    }

    stopAsr(); // give the model's memory back until the next recording
    const text = await readFile(partial, "utf8");
    // count letters AND vowel signs (Hindi matras are "marks", not "letters"); short clips are fine too
    const letters = (text.replace(/\[time [\d:]+\]/g, "").match(/[\p{L}\p{M}]/gu) || []).length;
    const status = letters > 40 ? "learned" : "unreadable";
    await writeFile(path.join(KDIR, `${id}.txt`), `# ${id.split("/").slice(1).join("/")}\n# source: library/${id}\n# status: ${status} (listened: speech to text)\n\n${text}`);
    await unlink(partial).catch(() => {});
    Object.assign(m, {
      status, source: "listen", kind: "media", chars: text.length, learnedAt: new Date().toISOString(),
      note: status === "learned" ? `Listened to ${clock(duration)} of audio (speech to text). Some words may be misheard.` : "No clear speech found in this recording.",
    });
    m.asrModel = WHISPER_MODEL;
    delete m.listenDone; delete m.relistening;
    lastFile = path.basename(id);
    if (status === "learned") await finished(path.basename(id), id);
    await saveManifest();
    await appendFile(LOG, JSON.stringify({ date: m.learnedAt, file: id, status, seconds: Math.round(duration), via: "listen" }) + "\n").catch(() => {});
    return "done";
  }

  function nextOcrBook() {
    const list = Object.entries(manifest)
      .filter(([id, m]) => id.toLowerCase().endsWith(".pdf") && OCR_STATES.includes(m.status) && !m.ocrFailed)
      .sort(([, a], [, b]) =>
        (a.status === "ocr-in-progress" ? 0 : 1) - (b.status === "ocr-in-progress" ? 0 : 1) || (a.pages || 0) - (b.pages || 0));
    return list.length ? list[0][0] : null; // books already started first, then smallest first
  }

  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    const Tesseract = (await import("tesseract.js")).default;
    const cachePath = path.join(KDIR, "ocr-lang");
    await mkdir(cachePath, { recursive: true });
    ocrWorker = await Tesseract.createWorker(["hin", "eng"], 1, { cachePath });
    return ocrWorker;
  }

  async function ocrBook(id) {
    const m = manifest[id];
    const full = path.join(LIB, id);
    const partial = path.join(KDIR, `${id}.ocr-partial.txt`);
    await mkdir(path.dirname(partial), { recursive: true });
    let done = m.status === "ocr-in-progress" ? m.ocrDone || 0 : 0;
    // Resuming, but the in-progress file is gone (the server stopped just as the book was finished):
    // use the finished text if it was written, otherwise start this book again instead of crashing.
    if (done > 0 && !existsSync(partial)) {
      const out = path.join(KDIR, `${id}.txt`);
      if (existsSync(out)) {
        const saved = (await readFile(out, "utf8")).replace(/^#.*\n/gm, "");
        const status = /\(read by OCR\)/.test(await readFile(out, "utf8")) && judge(saved, m.ocrPages || m.pages).status === "learned" ? "learned" : "unreadable";
        Object.assign(m, { status, source: "ocr", chars: saved.length, pages: m.ocrPages || m.pages, learnedAt: new Date().toISOString(),
          note: status === "learned" ? "Read by OCR (Hindi + English). Some words may be misread." : "OCR could not read this scan clearly (poor print or image quality)." });
        delete m.ocrDone;
        await saveManifest();
        return "done";
      }
      done = 0;
    }
    if (done === 0) await writeFile(partial, "");

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(full)), isEvalSupported: false, verbosity: 0 }).promise;
    } catch (err) {
      Object.assign(m, { ocrFailed: true, note: `Could not open PDF for OCR: ${String(err?.message || err).slice(0, 120)}` });
      await saveManifest();
      return "failed";
    }
    const worker = await getOcrWorker();
    Object.assign(m, { status: "ocr-in-progress", ocrPages: doc.numPages });
    Object.assign(now, { state: "reading", mode: "ocr", id, file: path.basename(id), folder: id.split("/")[0], page: done, pages: doc.numPages, startedAt: Date.now() });

    for (let i = done + 1; i <= doc.numPages; i++) {
      if (again) {
        again = false;
        const { changed } = await changedFiles();
        if (changed.length) { await doc.destroy(); await saveManifest(); return "interrupted"; } // new uploads first
      }
      await waitWhileTalking();
      now.page = i;
      let text = "";
      try {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.max(1, Math.min(3, 1600 / base.width)); // ~1600px wide is good for OCR
        const vp = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
        const c2d = canvas.getContext("2d");
        c2d.fillStyle = "#fff"; c2d.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: c2d, viewport: vp }).promise;
        page.cleanup();
        // a picture on this page (illustration, diagram, photo) is shown beside him on the website;
        // plain text pages are not shown (see picture.js)
        try {
          const tw = 640, th = Math.round(canvas.height * tw / canvas.width);
          const small = createCanvas(tw, th);
          const sctx = small.getContext("2d");
          sctx.drawImage(canvas, 0, 0, tw, th);
          const pic = findPicture(sctx, tw, th);
          if (pic) {
            const k = canvas.width / tw;                 // crop from the full-size page for a sharp picture
            const cw = Math.round(pic.w * k), ch = Math.round(pic.h * k), f = Math.min(1, 700 / Math.max(cw, ch));
            const crop = createCanvas(Math.round(cw * f), Math.round(ch * f));
            crop.getContext("2d").drawImage(canvas, pic.x * k, pic.y * k, cw, ch, 0, 0, crop.width, crop.height);
            setLive({ id, page: i, image: await crop.encode("jpeg", 78) });
          } else setLive({ id, page: i, image: null });
        } catch { /* the preview is only decoration */ }
        const { data } = await worker.recognize(await canvas.encode("png"));
        text = data.text.trim();
        setLive({ id, page: i, text });
      } catch { /* unreadable page: keep going */ }
      await appendFile(partial, `[page ${i}]\n${text}\n\n`);
      m.ocrDone = i;
      if (i % 3 === 0 || i === doc.numPages) await saveManifest();
    }
    await doc.destroy();

    const text = await readFile(partial, "utf8");
    const chars = text.replace(/\[page \d+\]/g, "").replace(/\s+/g, "").length;
    const out = path.join(KDIR, `${id}.txt`);
    // OCR output gets the same quality check as any text: a bad scan gives gibberish, which must not count as read
    const status = chars > 200 && judge(text, doc.numPages).status === "learned" ? "learned" : "unreadable";
    m.ocrJudged = 1;
    await writeFile(out, `# ${id.split("/").slice(1).join("/")}\n# source: library/${id}\n# status: ${status} (read by OCR)\n\n${text}`);
    Object.assign(m, {
      status, source: "ocr", chars: text.length, pages: doc.numPages, learnedAt: new Date().toISOString(),
      note: status === "learned" ? "Read by OCR (Hindi + English). Some words may be misread." : "OCR could not read this scan clearly (poor print or image quality).",
    });
    delete m.ocrDone;
    await saveManifest();                       // record "finished" before removing the in-progress file
    await unlink(partial).catch(() => {});
    lastFile = path.basename(id);
    if (status === "learned") await finished(path.basename(id), id);
    await saveManifest();
    await appendFile(LOG, JSON.stringify({ date: m.learnedAt, file: id, status, pages: m.pages, via: "ocr" }) + "\n").catch(() => {});
    return "done";
  }

  async function run() {
    if (running) { again = true; return; }
    running = true;
    try {
      for (;;) {
        again = false;
        await loadManifest();
        await textPass();
        // talks you uploaded come first (you added them on purpose), then scanned books
        const media = nextMedia();
        if (media) { await listenMedia(media); continue; }
        const next = nextOcrBook();
        if (!next) break;
        await ocrBook(next); // done, interrupted (new files arrived) or failed: loop decides what's next
      }
    } catch (err) {
      console.error("[learner]", err);
    } finally {
      Object.assign(now, { state: "idle", mode: null, id: null, file: null, folder: null, page: 0, pages: 0, startedAt: null });
      running = false;
    }
  }

  // While someone is talking with Sanatan, reading pauses so the voice and answers get the CPU.
  // What he is looking at right now (shown behind him on the website): the page image and its OCR text,
  // or the latest words of the talk he is listening to. Kept in memory only.
  const live = { id: null, page: 0, text: "", image: null, imageAt: 0, at: 0 };
  function setLive({ id, page, text, image }) {
    if (id !== live.id) live.text = "";        // a new book: forget the old one (a new page keeps the last text until its OCR is ready)
    live.id = id; live.page = page; live.at = Date.now();
    if (text !== undefined) live.text = String(text).replace(/\s+/g, " ").trim().slice(0, 4000);
    if (image !== undefined) { live.image = image; live.imageAt = image ? Date.now() : 0; }
  }

  let holdUntil = 0, keepReadingUntil = 0;
  // Talking pauses reading, unless someone pressed "Resume reading": then he keeps reading for a while
  // even while he talks (otherwise his next spoken sentence would pause him again at once).
  function hold(ms = 60_000) { if (Date.now() < keepReadingUntil) return; holdUntil = Math.max(holdUntil, Date.now() + ms); }
  function release(ms = 15 * 60_000) { holdUntil = 0; keepReadingUntil = Date.now() + ms; }
  // Owner's Pause / Resume switch (kept across restarts in .knowledge/state.json).
  const STATE_FILE = path.join(KDIR, "state.json");
  let manualPause = false;
  readFile(STATE_FILE, "utf8").then((t) => { manualPause = !!JSON.parse(t).paused; }).catch(() => {});
  async function setPaused(on) {
    manualPause = !!on;
    await mkdir(KDIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify({ paused: manualPause }));
    if (!manualPause) trigger(200);
  }

  // A book was finished: remember it (the page celebrates: full ring + smile), then wait a few
  // seconds so the moment can be seen before the next book starts.
  let lastCompleted = null;
  async function finished(file, id) {
    lastCompleted = { file, id, at: Date.now() };
    Object.assign(now, { page: now.pages || now.page });
    await new Promise((r) => setTimeout(r, 7000));
  }

  async function waitWhileTalking() {
    while (Date.now() < holdUntil || manualPause) { now.paused = true; await new Promise((r) => setTimeout(r, 500)); }
    now.paused = false;
  }

  function trigger(delay = 1500) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  function status() {
    const counts = { learned: 0, needsOcr: 0, legacyFont: 0, media: 0, other: 0 };
    for (const m of Object.values(manifest)) {
      if (m.status === "learned") counts.learned++;
      else if (m.status === "needs-ocr" || m.status === "ocr-in-progress") counts.needsOcr++;
      else if (m.status === "legacy-font" || m.status === "garbled") counts.legacyFont++;
      else if (m.status === "needs-transcription" || m.status === "listening") counts.media++;
      else counts.other++;
    }
    // books and audio/video are counted separately
    counts.mediaLearned = Object.values(manifest).filter((m) => m.status === "learned" && (m.kind === "media" || m.folder === "media")).length;
    counts.booksLearned = counts.learned - counts.mediaLearned;
    counts.mediaTotal = Object.values(manifest).filter((m) => m.kind === "media" || m.folder === "media").length;
    return { ...now, paused: now.state === "reading" && (Date.now() < holdUntil || manualPause), manualPause, lastCompleted, lastFile, counts, total: Object.keys(manifest).length };
  }

  // start: read anything new, then re-check every 2 minutes (catches files copied in by hand)
  loadManifest().then(() => trigger(500));
  setInterval(() => trigger(0), 120_000).unref();

  // OCR a page image and return its lines with sizes (used to find the title printed on the cover)
  async function ocrLines(png) {
    const w = await getOcrWorker();
    const { data } = await w.recognize(png);
    return (data.lines || []).map((l) => ({ text: l.text.trim(), h: l.bbox.y1 - l.bbox.y0, y: l.bbox.y0, conf: l.confidence }));
  }

  return { trigger, status, hold, release, setPaused,
    live: () => ({ id: live.id, page: live.page, text: live.text, imageAt: live.imageAt, at: live.at }), liveImage: () => live.image, ocrLines, entries: () => manifest, knowledgeDir: KDIR,
    isHeld: () => Date.now() < holdUntil || manualPause }; // someone is talking, or the owner paused learning
}
