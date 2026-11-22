// SANATAN — Knowledge search
// Searches the text Sanatan has read (library/.knowledge/*.txt) and returns the best
// passages with book name and page. Works fully offline, with no API credits.
// The chat also uses it to ground answers in the user's own books.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cleanTitle, similar } from "./titles.js";
import { soundFold, soundTerms } from "./sound-search.js";

const clock = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0"); };

const STATUS_LABEL = {
  learned: "Read",
  "ocr-in-progress": "Reading now (OCR)",
  "needs-ocr": "Waiting: scanned pages, OCR queued",
  "legacy-font": "Waiting: old Hindi font, OCR queued",
  garbled: "Waiting: garbled text in PDF, OCR queued",
  "needs-transcription": "Waiting to be listened to (speech to text)",
  listening: "Listening now (speech to text)",
  "no-captions": "YouTube video without subtitles",
  unreadable: "Scan too unclear for OCR (needs a better copy)",
  unsupported: "File type not supported yet",
  error: "Could not read",
};

// Hindi/Sanskrit spell the same word several ways (कुण्डलिनी = कुंडलिनी, ज़ = ज, ँ = ं).
// Fold those variants so a search finds all of them.
function fold(str) {
  // strip accents on Roman letters (Hanumán = Hanuman, Prahláda = Prahlada), keep Devanagari vowel signs
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")
    .replace(/़/g, "")                                              // nukta
    .replace(/ँ/g, "ं")                                        // chandrabindu -> anusvara
    .replace(/[ङञणनम]्(?=[क-ह])/g, "ं"); // nasal+virama before consonant -> anusvara
}

// Names of specific texts in a question: capitalised multi-word names, or "<word> Gita/Purana/Sutra/…"
const TEXT_KINDS = "gita|geeta|purana|puran|sutras?|tantra|upanishad|upanisad|samhita|smriti|ramayana|ramayan|stotra|sahasranama|vasistha|vasishtha";
const TEXT_KINDS_DEVA = "गीता|पुराण|पुराणम्|सूत्र|सूत्रम्|तंत्र|तन्त्र|उपनिषद्|उपनिषद|संहिता|स्मृति|रामायण|स्तोत्र|सहस्रनाम|वासिष्ठ";
// "video" for video files and YouTube talks, "audio" for sound recordings, "" for books
export function mediaTypeOf(id) {
  const s = String(id).toLowerCase();
  if (/youtube\.com|youtu\.be|(^|\/)youtube\//.test(s) || /\.(mp4|mkv|webm|mov|avi|m4v|wmv|flv|3gp)(\.txt)?$/.test(s)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|opus|flac|wma|amr)(\.txt)?$/.test(s)) return "audio";
  return /^media\//.test(s) ? "audio" : "";
}

// One spelling for texts written many ways (Bhagavad Gita / Bhagavadgita / Bhagwad Geeta / श्रीमद्भगवद्गीता)
function canonText(s) {
  return s.replace(/geeta/g, "gita").replace(/\b(shrimad|srimad|shreemad)\s*/g, "").replace(/श्रीमद्\s*/g, "")
    .replace(/\b(bhagavad|bhagavat|bhagwad|bhagvad|bhagawad|bhagwat)\s*gita/g, "bhagavadgita")
    .replace(/(भगवद्|भगवत्|भगवद|भगवत)\s*गीता/g, "bhagavadgita");
}
const NAME_STOP =/^(what|who|how|why|when|where|which|tell|please|explain|is|the|a|an|lord|shri|sri|o)$/i;
function namedTexts(q) {
  const out = new Set();
  const latin = q.match(/\b[A-Z][a-zA-Z]+(?:[\s-]+[A-Z][a-zA-Z]+)+\b/g) || [];
  for (const m of latin) {
    const parts = m.split(/[\s-]+/).filter((w) => !NAME_STOP.test(w));
    if (parts.length >= 2) out.add(fold(parts.join(" ")));
  }
  for (const m of q.matchAll(new RegExp(`([A-Za-z]{3,})[\\s-]+(${TEXT_KINDS})\\b`, "gi"))) {
    if (!NAME_STOP.test(m[1])) out.add(fold(`${m[1]} ${m[2]}`));
  }
  for (const m of q.matchAll(new RegExp(`([\\u0900-\\u097F]{2,})\\s*(${TEXT_KINDS_DEVA})`, "g"))) out.add(fold(`${m[1]} ${m[2]}`));
  return [...out];
}

export function createKnowledge(learner, titler = null) {
  const cache = new Map(); // id -> { mtime, chunks: [{ page, text, lower }] }

  // the real title printed in the book (see titles.js), never the raw file name
  const titleOf = (id) => (titler ? titler.titleFor(id) : cleanTitle(id));

  function books() {
    const m = learner.entries();
    return Object.entries(m).map(([id, e]) => ({
      id,
      title: titleOf(id),
      file: path.basename(id),
      author: titler?.infoFor(id)?.author || "",
      folder: e.folder || id.split("/")[0],
      status: e.status,
      // "book" or "media" (audio / video / YouTube talk): shown and counted separately
      kind: e.kind === "media" || (e.folder || id.split("/")[0]) === "media" ? "media" : "book",
      // recordings are split into audio and video (YouTube talks count as video)
      media: mediaTypeOf(id),
      label: e.status === "ocr-in-progress" && e.ocrPages ? `Reading now (OCR) · page ${e.ocrDone || 0} of ${e.ocrPages}`
        : e.status === "listening" && e.duration ? `Listening now · ${clock(e.listenDone || 0)} of ${clock(e.duration)}`
        : e.status === "unreadable" && (e.kind === "media" || (e.folder || id.split("/")[0]) === "media") ? "No clear speech found in this recording"
        : STATUS_LABEL[e.status] || e.status,
      pages: e.pages || e.ocrPages || 0,
      duration: e.duration || 0,
      via: e.source === "ocr" ? "ocr" : e.source === "listen" ? "listen" : e.source === "youtube" ? "youtube" : "text",
      learnedAt: e.status === "learned" ? e.learnedAt : null,
      searchable: e.status === "learned",
    })).sort((a, b) => (b.searchable - a.searchable) || a.title.localeCompare(b.title));
  }

  async function chunksOf(id) {
    const file = path.join(learner.knowledgeDir, `${id}.txt`);
    let s;
    try { s = await stat(file); } catch { return []; }
    const hit = cache.get(id);
    if (hit && hit.mtime === s.mtimeMs) return hit.chunks;
    const raw = (await readFile(file, "utf8")).replace(/^#.*\n/gm, "");
    const chunks = [];
    // Clean scripture files mark every hymn / chapter / section: "[ref Rigveda 1.1]". Each becomes passages that
    // carry that exact place (long sections are split at verse or paragraph ends, all keeping the same ref).
    if (/\n\[ref [^\]\n]+\]\n/.test("\n" + raw.slice(0, 20000))) {
      const sec = ("\n" + raw).split(/\n\[ref ([^\]\n]+)\]\n/);
      for (let i = 1; i < sec.length; i += 2) {
        const ref = sec[i].trim(), body = (sec[i + 1] || "").trim();
        if (!body) continue;
        let buf = "";
        const push = () => { const t = buf.trim(); if (t) chunks.push({ page: null, ref, text: t, lower: fold(t) }); buf = ""; };
        for (const piece of body.split(/\n(?=\S)/)) {          // a verse line or a paragraph
          if ((buf + piece).length > 1400 && buf.length > 300) push();
          buf += piece + "\n";
        }
        push();
      }
      cache.set(id, { mtime: s.mtimeMs, chunks });
      return chunks;
    }
    // pages of books ([page 12]) or times in recordings ([time 12:34])
    const parts = raw.split(/\n?\[(?:page|time) ([\d:]+)\]\n/);
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i += 2) {
        const text = parts[i + 1].trim();
        if (text) chunks.push({ page: parts[i].includes(":") ? parts[i] : Number(parts[i]), text, lower: fold(text) });
      }
    } else {
      // no page markers: split into ~1500-character passages
      let buf = "";
      for (const para of raw.split(/\n\s*\n/)) {
        if ((buf + para).length > 1500 && buf) { chunks.push({ page: null, text: buf.trim(), lower: fold(buf.trim()) }); buf = ""; }
        buf += para + "\n\n";
      }
      if (buf.trim()) chunks.push({ page: null, text: buf.trim(), lower: fold(buf.trim()) });
    }
    cache.set(id, { mtime: s.mtimeMs, chunks });
    return chunks;
  }

  // question words and fillers that don't help find a passage
  const STOP = new Set(("what is the a an of to in on about tell me please explain how why who whom which and or do does did are was were can could you your i my we " +
    "it this that be give say says said meaning mean means kya hai hain ke ka ki mein se ko aur batao bataiye kaise kyon kaun " +
    "क्या है हैं के का की में से को और पर ही भी तो यह वह ये वे मुझे आप बताइए बताओ बताएं बताइये कैसे क्यों कौन कहते किसे होता होती " +
    "काय आहे आहेत ला चा ची चे सांगा कसे का कोण " +
    "teach teaches taught say says tell tells explain explains mean describe describes discuss talk talks book text " +
    "सिखाती सिखाता सिखाते सिखाया सिखाइए कहती कहता कहते कहा बताती बताता बताते बताया समझाइए समझाओ वर्णन पुस्तक ग्रंथ").split(/\s+/).map(fold));
  const terms = (q) => {
    const all = [...new Set(fold(q).replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1))];
    const useful = all.filter((w) => !STOP.has(w));
    return (useful.length ? useful : all).slice(0, 12);
  };

  function count(hay, needle) {
    let n = 0, i = hay.indexOf(needle);
    while (i !== -1 && n < 20) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }

  function snippet(text, lower, words, len = 320) {
    let at = -1;
    for (const w of words) { const i = lower.indexOf(w); if (i !== -1 && (at === -1 || i < at)) at = i; }
    if (at === -1) at = 0;
    const start = Math.max(0, at - Math.floor(len / 3));
    const s = text.slice(start, start + len).replace(/\s+/g, " ").trim();
    return (start > 0 ? "… " : "") + s + (start + len < text.length ? " …" : "");
  }

  /** Returns the best passages for a question. */
  async function search(q, { book = "", limit = 10, snippetLen = 320, crossLang = true } = {}) {
    const words = terms(String(q || "").slice(0, 300));
    if (!words.length) return { query: q, results: [] };
    const phrase = fold(String(q)).trim();
    const ids = books().filter((b) => b.searchable && (!book || b.id === book)).map((b) => b.id);

    const hits = [];
    const df = Object.fromEntries(words.map((w) => [w, 0]));
    let total = 0;
    for (const id of ids) {
      for (const c of await chunksOf(id)) {
        total++;
        const counts = words.map((w) => count(c.lower, w));
        if (!counts.some(Boolean)) continue;
        counts.forEach((n, i) => { if (n) df[words[i]]++; });
        hits.push({ id, c, counts });
      }
    }
    // How important each question word is: rare words (the subject, e.g. "ashtavakra") weigh most.
    // A word that appears in NO book gets the highest weight: the library simply doesn't cover it.
    const idf = (w) => Math.log(1 + total / (1 + df[w]));
    const weightOf = words.map((w) => (df[w] ? idf(w) : Math.log(1 + total)));
    const totalWeight = weightOf.reduce((a, b) => a + b, 0) || 1;
    for (const h of hits) {
      let score = 0, matched = 0, covered = 0;
      h.counts.forEach((n, i) => {
        if (!n) return;
        matched++;
        covered += weightOf[i];
        score += Math.min(n, 6) * idf(words[i]);
      });
      score *= 1 + matched / words.length;                   // reward passages matching more of the question
      if (phrase.length > 3 && h.c.lower.includes(phrase)) score *= 2;
      // tables of contents / indexes pack keywords together but don't tell the story: rank them lower
      const headings = (h.c.lower.match(/\b(chapter|canto|section|contents|index)\b|अध्याय|सर्ग/g) || []).length;
      if (headings >= 3) score *= 0.35;
      h.score = score;
      h.coverage = covered / totalWeight;
    }
    // A passage must cover the main subject of the question, not just a common side word
    // ("ashtavakra gita" must not be answered from a Kundalini book because it says "gita").
    const minCoverage = words.length === 1 ? 1 : 0.55;
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].coverage < minCoverage) hits.splice(i, 1);
    // When the question names a specific text ("Ashtavakra Gita", "Yoga Vasistha", "अष्टावक्र गीता"),
    // a passage must contain that whole name, otherwise it is about something else.
    const names = namedTexts(String(q || ""));
    let aboutBook = null;
    if (names.length) {
      // if the named text IS one of the books (e.g. "Bhagavad Gita", "Vishnu Purana"), its pages count
      // "Bhagavad Gita" must stay distinct from "Ashtavakra Gita": every spelling becomes "bhagavadgita",
      // instead of dropping "Bhagavad" (which left just "gita" and matched any Gita)
      const key = (s) => canonText(fold(s).replace(/[^\p{L}\p{M}\s]/gu, " ")).replace(/\b(the|of)\b/g, " ").replace(/\s+/g, " ").trim();
      const bookIds = new Set(books().filter((b) => b.searchable && names.some((n) => {
        const k = key(n), t = key(b.title);
        // same script, or across scripts (अष्टावक्र गीता = Ashtavakra Gita) by how the words sound
        return k && (t.includes(k) || k.split(" ").every((w) => w.length > 2 && t.includes(w)) || similar(n, b.title) >= 0.6);
      })).map((b) => b.id));
      for (let i = hits.length - 1; i >= 0; i--) {
        const flat = canonText(hits[i].c.lower.replace(/[\s\-–—_]+/g, " "));
        if (!bookIds.has(hits[i].id) && !names.some((n) => flat.includes(canonText(n)))) hits.splice(i, 1);
      }
      // the question is ONLY the book's name ("What does the Ashtavakra Gita teach?"):
      // it's about the whole book, so the caller answers with that book's central ideas
      const nameWords = new Set(names.flatMap((n) => n.split(" ")));
      for (const n of names) for (const w of canonText(n).split(" ")) nameWords.add(w); // "भगवद्गीता" -> "bhagavadgita"
      if (bookIds.size && words.every((w) => nameWords.has(w) || nameWords.has(canonText(w)) || [...nameWords].some((n) => similar(w, n) >= 0.7))) {
        aboutBook = [...bookIds][0];
      }
    }
    hits.sort((a, b) => b.score - a.score);
    let results = hits.slice(0, limit).map((h) => ({
      book: titleOf(h.id), id: h.id, page: h.c.page, ref: h.c.ref || null,
      text: snippet(h.c.text, h.c.lower, words, snippetLen),
      score: Math.round(h.score * 10) / 10,
    }));
    // Cross-language: a question not in Devanagari (English, Tamil, Bengali…), or one that found little,
    // is also searched by SOUND in the Hindi books (sound-search.js). The two lists are interleaved.
    if (crossLang && (/[A-Za-zঀ-ൿ]/.test(String(q)) || results.length < 2)) {
      const extra = await soundSearch(q, { ids, limit, snippetLen });
      const seen = new Set(), merged = [];
      for (let i = 0; i < Math.max(results.length, extra.length); i++) {
        for (const r of [results[i], extra[i]]) if (r && !seen.has(r.id + "|" + (r.page ?? r.ref) + "|" + r.text.slice(0, 40))) { seen.add(r.id + "|" + (r.page ?? r.ref) + "|" + r.text.slice(0, 40)); merged.push(r); }
      }
      results = merged.slice(0, limit);
    }
    return { query: q, words, results, searched: ids.length, aboutBook };
  }

  /** Passages whose words SOUND like the question's words, across scripts (Hindi books, any-language question). */
  async function soundSearch(q, { ids, limit = 10, snippetLen = 320 }) {
    const words = soundTerms(q, STOP);
    if (!words.length) return [];
    const hits = [];
    const df = Object.fromEntries(words.map((w) => [w, 0]));
    let total = 0;
    for (const id of ids) {
      for (const c of await chunksOf(id)) {
        if (c.sound === undefined) c.sound = /[ऀ-ॿ]/.test(c.lower) ? soundFold(c.lower) : null;
        if (!c.sound) continue;
        total++;
        const counts = words.map((w) => count(c.sound, w));
        if (!counts.some(Boolean)) continue;
        counts.forEach((n, i) => { if (n) df[words[i]]++; });
        hits.push({ id, c, counts });
      }
    }
    // words that sound like nothing in the library (English filler turned into Devanagari) are ignored
    const live = words.map((w) => df[w] > 0);
    const idf = (w) => Math.log(1 + total / (1 + df[w]));
    const totalWeight = words.reduce((s, w, i) => s + (live[i] ? idf(w) : 0), 0);
    if (!totalWeight) return [];
    const liveCount = live.filter(Boolean).length;
    for (const h of hits) {
      let score = 0, covered = 0, matched = 0;
      h.counts.forEach((n, i) => { if (n && live[i]) { matched++; covered += idf(words[i]); score += Math.min(n, 6) * idf(words[i]); } });
      h.score = score * (1 + matched / liveCount);
      h.coverage = covered / totalWeight;
    }
    const minCoverage = liveCount === 1 ? 1 : 0.5;
    const good = hits.filter((h) => h.coverage >= minCoverage).sort((a, b) => b.score - a.score).slice(0, limit);
    return good.map((h) => {
      // the sound text is shorter than the original: start the passage at the same relative place
      const at = Math.min(...words.map((w) => h.c.sound.indexOf(w)).filter((i) => i >= 0));
      const start = Math.max(0, Math.floor((at / h.c.sound.length) * h.c.text.length) - Math.floor(snippetLen / 3));
      const s = h.c.text.slice(start, start + snippetLen).replace(/\s+/g, " ").trim();
      return { book: titleOf(h.id), id: h.id, page: h.c.page, ref: h.c.ref || null, text: (start > 0 ? "… " : "") + s + " …", score: Math.round(h.score * 10) / 10, by: "sound" };
    });
  }

  // ---------- summaries (extractive: the book's own key sentences, no AI needed) ----------
  const FILLER = new Set(("the and of to in that is was for with as his he it by on be are which this from at or an not they their have has had were all " +
    "but who will there them so one these those its into upon thou thee thy ye shall unto also than then when what where may more such any each " +
    "him her our ours your yours we us me my like hath doth verily yea let made make came come thus even very great many how now own same " +
    "she out up down over again would should could must been being here there only every other through".replace(/\s+/g, " ") + " " +
    "एक इस उस जो कर करने किया होता होती होते जाता जाती जाते रहा रही रहे लिए साथ द्वारा अपने अपनी अपना उनके उनकी उसके उसकी इसके इसकी कुछ सब सभी " +
    "बहुत अधिक यदि तब जब तक बाद पहले फिर हम हमारे तुम वे ये था थी थे गया गई गए नहीं न तथा एवं या अथवा किसी कोई कभी सकता सकती सकते चाहिए " +
    "है हैं के का की में से को और पर ही भी तो यह वह जाए होने करते करना होना वाले वाली प्रकार इसी उसी जिस जिसे जिन किन्तु परन्तु लेकिन " +
    "मैं हूं हूँ तु तू तुम तेरा तेरी तेरे मेरा मेरी मेरे वहे यहे वैह देख देखो करता करती करते जैसे वैसे जब तब कि जो उसे इसे अपना अपनी " +
    "आणि आहे आहेत होते होता त्या या ते हे की मध्ये साठी पण तर असे असा असते केले करून करणे म्हणजे व").split(/\s+/).map(fold));
  const summaryCache = new Map(); // id -> { mtime, n, data }

  function sentencesOf(chunks) {
    const out = [];
    const seen = new Map(); // repeated page headers ("Rig Veda – English Translation") are not content
    for (const c of chunks) {
      // OCR often reads the Hindi full stop "।" as "|", so treat both as sentence ends
      for (const raw of c.text.replace(/\s\|\s?/g, "। ").split(/(?<=[.!?।॥])\s+|\n{2,}/)) {
        // drop verse numbers and stray single letters at the start ("11 Whether…", "f Sit thou…")
        const s = raw.replace(/\s+/g, " ").trim().replace(/^(?:[\d०-९]+[.)]?|[A-Za-z]|[|।:;,\-–—])\s+(?=\S)/u, "").trim();
        if (s.length < 45 || s.length > 320) continue;
        const letters = (s.match(/\p{L}|\p{M}/gu) || []).length;
        if (letters / s.length < 0.72) continue;                       // OCR junk, tables, numbers
        if ((s.match(/(^|\s)[ा-्]/g) || []).length > 2) continue; // broken Devanagari
        // Hindi sentence with stray Latin letters = OCR misread ("URE", "AWRY")
        if (/[ऀ-ॿ]/.test(s) && (s.match(/[A-Za-z]{2,}/g) || []).length > 0) continue;
        const key = s.slice(0, 28);
        seen.set(key, (seen.get(key) || 0) + 1);
        out.push({ page: c.page, text: s, key });
      }
    }
    return out.filter((s) => seen.get(s.key) <= 2);
  }

  /** Key sentences of a book, spread from beginning to end, plus its main topics. */
  async function summarize(id, n = 8) {
    const book = books().find((b) => b.id === id);
    if (!book) return null;
    if (!book.searchable) return { book, ready: false };
    const file = path.join(learner.knowledgeDir, `${id}.txt`);
    const mtime = (await stat(file)).mtimeMs;
    const hit = summaryCache.get(id);
    if (hit && hit.mtime === mtime && hit.n === n) return hit.data;

    let chunks = await chunksOf(id);
    // skip front matter and index pages of longer books
    if (chunks.length > 20) chunks = chunks.slice(Math.ceil(chunks.length * 0.03), chunks.length - Math.ceil(chunks.length * 0.03));
    const sents = sentencesOf(chunks);

    const tokenize = (s) => fold(s).replace(/[^\p{L}\p{M}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !FILLER.has(w));
    const tf = new Map(), bigrams = new Map();
    const toks = sents.map((s) => {
      const t = tokenize(s.text);
      for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
      for (let i = 1; i < t.length; i++) { const b = `${t[i - 1]} ${t[i]}`; bigrams.set(b, (bigrams.get(b) || 0) + 1); }
      return t;
    });
    const weight = (w) => Math.log(1 + (tf.get(w) || 0));

    // 1) content score: how many of the book's important words a sentence carries
    sents.forEach((s, i) => {
      const uniq = [...new Set(toks[i])];
      s.tok = new Set(uniq);
      s.idx = i;
      s.score = uniq.length ? uniq.reduce((a, w) => a + weight(w), 0) / Math.sqrt(toks[i].length + 4) : 0;
    });

    // 2) TextRank on the strongest candidates: a sentence matters when many other important
    //    sentences share its ideas (this finds the book's central teachings, not just busy lines)
    const pool = [...sents].sort((a, b) => b.score - a.score).slice(0, 420).sort((a, b) => a.idx - b.idx);
    const sim = (a, b) => {
      let shared = 0;
      for (const w of a.tok) if (b.tok.has(w)) shared += weight(w);
      return shared ? shared / (Math.log(a.tok.size + 2) + Math.log(b.tok.size + 2)) : 0;
    };
    const N = pool.length, links = pool.map(() => []);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const v = sim(pool[i], pool[j]);
      if (v > 0.05) { links[i].push([j, v]); links[j].push([i, v]); }
    }
    const out = links.map((l) => l.reduce((a, [, v]) => a + v, 0) || 1);
    let rank = new Array(N).fill(1);
    for (let it = 0; it < 25; it++) {
      rank = links.map((l) => 0.15 + 0.85 * l.reduce((a, [j, v]) => a + (rank[j] * v) / out[j], 0));
    }
    pool.forEach((s, i) => { s.rank = rank[i] * (0.6 + 0.4 * Math.min(1, s.score / 3)); });

    // 3) pick without repeating the same idea (MMR: reward rank, penalise similarity to what's picked)
    const pickMMR = (cands, k, already = []) => {
      const chosen = [];
      const maxRank = Math.max(...cands.map((c) => c.rank), 1);
      while (chosen.length < k && cands.length) {
        let best = null, bestVal = -Infinity;
        for (const c of cands) {
          if (chosen.includes(c) || already.includes(c)) continue;
          const red = Math.max(0, ...[...chosen, ...already].map((p) => sim(c, p)));
          const val = 0.75 * (c.rank / maxRank) - 0.25 * Math.min(1, red);
          if (val > bestVal) { bestVal = val; best = c; }
        }
        if (!best) break;
        chosen.push(best);
      }
      return chosen;
    };
    // "In brief": the 3 most central ideas of the whole book (shown in book order)
    const brief = pickMMR(pool, Math.min(3, pool.length)).sort((a, b) => a.idx - b.idx);
    // "Key points": the best idea from each part of the book, start to end, not repeating the brief
    const points = [];
    const parts = Math.min(n, pool.length);
    for (let k = 0; k < parts; k++) {
      const from = Math.floor((k * N) / parts), to = Math.floor(((k + 1) * N) / parts);
      const [best] = pickMMR(pool.slice(from, to), 1, [...brief, ...points]);
      if (best) points.push(best);
    }

    // key phrases first (two-word terms that recur), then single key words
    // "heaven earth" and "earth heaven" are the same idea: keep only the more frequent order
    const seenPair = new Set();
    // "बदब बदब" (a word repeated by a speaker or OCR) is not a phrase
    const phrases = [...bigrams.entries()].filter(([b, c]) => c >= 3 && !/\d/.test(b) && b.split(" ")[0] !== b.split(" ")[1]).sort((a, b) => b[1] - a[1])
      .filter(([b]) => { const k = b.split(" ").sort().join(" "); if (seenPair.has(k)) return false; seenPair.add(k); return true; })
      .slice(0, 5).map(([b]) => b);
    // common OCR slips of old English print ("tlie" = the, "tliat" = that) are not topics
    const ocrSlip = (w) => /^(tl[aeiou]|ti[ie])|ii|[a-z]{2,}[^a-zऀ-ॿ]/.test(w) || w.length < 3;
    const words = [...tf.entries()].filter(([w]) => !/^\d+$/.test(w) && !ocrSlip(w) && !phrases.some((p) => p.split(" ").includes(w)))
      .sort((a, b) => b[1] - a[1]).slice(0, 10 - phrases.length).map(([w]) => w);
    const plain = (s) => ({ page: s.page, text: s.text });
    const data = { book, ready: true, topics: [...phrases, ...words], brief: brief.map(plain), sentences: points.map(plain) };
    summaryCache.set(id, { mtime, n, data });
    return data;
  }

  /** Find the read book a question is talking about, from words of its title. */
  function findBook(q, ignore = []) {
    const words = fold(q).replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w) && !ignore.includes(w));
    if (!words.length) return null;
    let best = null, bestScore = 0;
    for (const b of books()) {
      const t = fold(b.title).replace(/[_\-%.]+/g, " ");
      const tw = t.split(/\s+/).filter((x) => x.length > 2);
      // same script, or across scripts by sound (कुण्डलिनी साधना = Kundalini Sadhana)
      const hit = (x) => words.some((w) => x.includes(w) || w.includes(x) || similar(w, x) >= 0.75);
      const matched = words.filter((w) => t.includes(w) || tw.some((x) => similar(w, x) >= 0.75));
      const score = matched.reduce((a, w) => a + w.length, 0)
        + 2 * (tw.filter(hit).length / (tw.length || 1))   // the title closest to what was asked wins ("Kundalini Sadhana" over "Gayatri Sadhana Se Kundalini Jagran")
        + (b.searchable ? 0.5 : 0);                       // a book he has read wins a tie
      if (!matched.length) continue;
      if (score > bestScore) { best = b; bestScore = score; }
    }
    return bestScore >= 4 ? best : null;
  }

  /** The text of one page of a book (PDF page, as cited in answers), with its neighbours if the page is short. */
  async function pageText(id, n) {
    const chunks = await chunksOf(id);
    const i = chunks.findIndex((c) => c.page === n);
    if (i === -1) return null;
    let text = chunks[i].text;
    // a page with very little text (heading, picture page): continue onto the next page
    if (text.replace(/\s+/g, "").length < 250 && chunks[i + 1]) text += "\n" + chunks[i + 1].text;
    return { page: n, text, last: chunks[chunks.length - 1]?.page };
  }

  /** Which book a question about a page means: named in the question, or the book being discussed. */
  function bookForPage(q, history = []) {
    const named = findBook(q, PAGE_WORDS);
    if (named && named.searchable) return named;
    const read = books().filter((b) => b.searchable);
    for (let i = history.length - 1; i >= 0; i--) {
      const text = String(history[i].content || "");
      // answers cite books as "**1. Title**" or "### Title" or "“Title”"
      for (const m of text.matchAll(/\*\*\d+\.\s*([^*]+?)\*\*|^###\s*(?:Summary of\s*)?[“"]?([^”"\n]+)/gm)) {
        const t = (m[1] || m[2] || "").trim();
        const b = read.find((x) => x.title === t) || read.find((x) => t && fold(x.title) === fold(t));
        if (b) return b;
      }
      const b = findBook(text.replace(/\[[A-Z ]+:[^\]]*\]/g, ""), PAGE_WORDS);
      if (b && b.searchable) return b;
    }
    return null;
  }

  // ---------- exact verse lookup: "Gita 2.47", "कठोपनिषद् 1.2", "Rigveda 1.1.1", "Yoga Sutra 1.2" ----------
  // The Sanskrit texts carry every verse's number ("॥ 2.47 ॥"), so a verse asked by its number is found exactly,
  // instead of searching for the word "47". Each alias names the start of a Sanskrit library title.
  const VERSE_BOOKS = [
    // the most specific names first ("Satyanarayan katha" must not be taken for the Katha Upanishad)
    [/vij[nñ][aā]na ?bhairava|vigyan ?bhairav|विज्ञान ?भैरव|विज्ञानभैरव/i, "Vijnana Bhairava"],
    [/satya ?n[aā]r[aā]ya[nṇ]|सत्य ?नारायण|सत्यनारायण/i, "Satyanarayan Vrat Katha"],
    [/devi ?g[iī]t[aā]|देवी ?गीता/i, "Devi Gita"],
    [/\b(bhagavad ?g[iī]t[aā]|g[iī]t[aā])\b|गीता/i, "Bhagavad Gita"],
    [/\brig ?veda|\brgveda|\bṛgveda|ऋग्वेद/i, "Rigveda"], [/atharva ?veda|अथर्ववेद/i, "Atharvaveda"], [/s[aā]ma ?veda|सामवेद/i, "Samaveda"],
    [/\bkatha\b|kathopanishad|कठ/i, "Katha Upanishad"], [/\b[iī][sś]h?a\b|isha ?upanishad|ईश/i, "Isha Upanishad"],
    [/mand[uū]kya ?k[aā]rik[aā]|गौडपाद/i, "Gaudapada"], [/m[aā]nd[uū]kya|माण्डूक्य|मांडूक्य/i, "Mandukya Upanishad"],
    [/prash?na|प्रश्न/i, "Prashna Upanishad"], [/aitareya|ऐतरेय/i, "Aitareya Upanishad"], [/ch[aā]ndogya|छान्दोग्य|छांदोग्य/i, "Chandogya"],
    [/b[rṛ]ihad[aā]ra[nṇ]yaka|बृहदारण्यक/i, "Brihadaranyaka"], [/shvet[aā]shvatara|svetasvatara|श्वेताश्वतर/i, "Shvetashvatara"],
    [/kaivalya|कैवल्य/i, "Kaivalya"], [/yoga ?s[uū]tra|योगसूत्र|योग सूत्र|patanjali|पतञ्जलि|पतंजलि/i, "Yoga Sutras"],
    [/brahma ?s[uū]tra|ब्रह्मसूत्र|ब्रह्म सूत्र/i, "Brahma Sutras"], [/hatha ?yoga|हठयोग|हठ योग/i, "Hatha Yoga"],
    [/bh[aā]gavata|भागवत/i, "Bhagavata Purana"], [/r[aā]m[aā]ya[nṇ]a|रामायण/i, "Valmiki Ramayana"],
    [/mah[aā]bh[aā]rata|महाभारत/i, "Mahabharata"], [/vishnu pur[aā]na|विष्णु ?पुराण/i, "Vishnu Purana"],
    [/vivekach[uū]d[aā]ma[nṇ]i|विवेकचूडामणि/i, "Vivekachudamani"], [/s[aā][nṃ]khya ?k[aā]rik[aā]|सांख्यकारिका/i, "Samkhya Karika"],
  ];
  // "chapter 2", "2nd chapter", "second chapter", "दूसरा अध्याय", "अध्याय 2", "दुसरा अध्याय" -> 2
  const ORDINALS = [[/first|1st|pahla|pehla|पहला|पहले|प्रथम|पहिला/i, 1], [/second|2nd|dusra|doosra|दूसरा|दूसरे|दुसरा|द्वितीय/i, 2],
    [/third|3rd|teesra|tisra|तीसरा|तीसरे|तिसरा|तृतीय/i, 3], [/fourth|4th|chautha|चौथा|चौथे|चतुर्थ/i, 4], [/fifth|5th|panchva|पाँचवा|पांचवा|पाँचवाँ|पांचवां|पंचम|पाचवा/i, 5],
    [/sixth|6th|छठा|छठे|षष्ठ|सहावा/i, 6], [/seventh|7th|सातवाँ|सातवां|सप्तम|सातवा/i, 7], [/eighth|8th|आठवाँ|आठवां|अष्टम|आठवा/i, 8]];
  function chapterAsked(s) {
    if (!/chapter|adhy[aā]y|अध्याय|सर्ग|स्कन्ध|canto/i.test(s)) return null;
    const d = s.match(/(?:chapter|adhy[aā]ya?|अध्याय|canto|सर्ग)\s*(?:no\.?\s*)?(\d{1,3})\b|\b(\d{1,3})\s*(?:st|nd|rd|th)?\s*(?:chapter|adhy[aā]ya?|अध्याय)/i);
    if (d) return Number(d[1] || d[2]);
    for (const [re, n] of ORDINALS) if (re.test(s)) return n;
    return null;
  }
  /** "Satyanarayan katha chapter 2" / "सत्यनारायण कथा का दूसरा अध्याय": that chapter's passages (study guide first, then the text) */
  async function chapter(q) {
    const s = toLatinDigits(String(q || ""));
    const hit = VERSE_BOOKS.find(([re]) => re.test(s));
    const n = hit && chapterAsked(s);
    if (!n) return null;
    const want = new RegExp(`(?:Chapter ${n}\\b|^${hit[1]}[^\\d]* ${n}(?:\\b|$)|^Bhagavad Gita ${n}$)`, "i");
    const out = [];
    for (const b of books().filter((x) => x.searchable && (x.title.includes(hit[1]) || x.title.startsWith(hit[1].split(" ")[0])))) {
      const chunks = (await chunksOf(b.id)).filter((c) => c.ref && want.test(c.ref));
      if (chunks.length) out.push({ book: titleOf(b.id), id: b.id, ref: chunks[0].ref, page: null, text: chunks.map((c) => c.text).join("\n").slice(0, 1800), by: "chapter" });
    }
    // the plain-language study guide first: the local model retells best from it
    out.sort((a, b) => (/Study Guide/.test(b.book) ? 1 : 0) - (/Study Guide/.test(a.book) ? 1 : 0));
    return out.length ? out : null;
  }
  const toLatinDigits = (s) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966));
  async function verse(q) {
    const s = toLatinDigits(String(q || ""));
    let nums = (s.match(/(\d{1,3})\s*[.:,]\s*(\d{1,4})(?:\s*[.:,]\s*(\d{1,4}))?(?:\s*[.:,]\s*(\d{1,4}))?/) || []).slice(1).filter(Boolean);
    if (!nums.length) {   // "chapter 2 verse 47", "अध्याय 2 श्लोक 47"
      const m = s.match(/(?:chapter|adhy[aā]ya|canto|mandala|book|अध्याय|मंडल|मण्डल|स्कन्ध)\s*(\d{1,3})\D{1,25}?(?:verse|shloka|sloka|sutra|hymn|sukta|श्लोक|सूत्र|सूक्त|मंत्र|मन्त्र)\s*(\d{1,4})/i);
      if (m) nums = [m[1], m[2]];
    }
    if (!nums.length) {   // texts numbered by verse only: "Vijnana Bhairava verse 24", "विज्ञान भैरव श्लोक 24", "dharana 24"
      const m = s.match(/(?:verse|shloka|sloka|sutra|dh[aā]ra[nṇ][aā]|श्लोक|धारणा|सूत्र)\s*(?:no\.?\s*)?(\d{1,3})\b/i);
      if (m) nums = [m[1]];
    }
    if (!nums.length) return null;
    const hit = VERSE_BOOKS.find(([re]) => re.test(s));
    if (!hit) return null;
    const want = nums.map(Number).join(".");
    const book = books().find((b) => b.searchable && b.title.startsWith(hit[1]) && /\(Sanskrit/.test(b.title))
      || books().find((b) => b.searchable && b.title.includes(hit[1]) && /sanskrit/i.test(b.id));
    if (!book) return null;
    const mark = `॥ ${want} ॥`;
    for (const c of await chunksOf(book.id)) {
      const at = c.text.indexOf(mark);
      if (at < 0) continue;
      // the verse itself: everything after the previous verse's number mark, up to and including its own mark
      const prev = [...c.text.slice(0, at).matchAll(/॥ [\d.]+ ॥/g)].pop();
      const text = c.text.slice(prev ? prev.index + prev[0].length : 0, at + mark.length).trim();
      return { book: titleOf(book.id), id: book.id, ref: `${hit[1]} ${want}`, page: null, text, verse: want, by: "verse" };
    }
    return { book: titleOf(book.id), id: book.id, ref: `${hit[1]} ${want}`, missing: true };
  }

  /** A question that names a text ("सत्यनारायण कथेचा संदेश", "what is the Vijnana Bhairava?"): its overview —
   *  the study guide's first sections if there is one, else the text's opening — so he never answers it blind. */
  async function named(q) {
    const s = String(q || "");
    const hit = VERSE_BOOKS.find(([re]) => re.test(s));
    if (!hit) return null;
    const list = books().filter((b) => b.searchable && b.title.includes(hit[1].split(" ").slice(0, 2).join(" ")));
    const guide = list.find((b) => /Study Guide/.test(b.title)) || list.find((b) => !/\(Sanskrit/.test(b.title)) || list[0];
    if (!guide) return null;
    const chunks = (await chunksOf(guide.id)).slice(0, 2);
    if (!chunks.length) return null;
    return { book: titleOf(guide.id), id: guide.id, ref: chunks[0].ref || null, page: chunks[0].page ?? null, text: chunks.map((c) => c.text).join("\n").slice(0, 1600), by: "named" };
  }

  return { books, search, summarize, findBook, titleOf, terms, fold, pageText, bookForPage, verse, chapter, named };
}

// "page 65", "pg no 65", "p. 65", "पेज 65", "पृष्ठ 65", "पेज नंबर 65", "65वें पेज", "पान 65" (Marathi) …
const PAGE_A = /(?:\bpage|\bpg|\bp\.|पेज|पृष्ठ|पृ\.|पन्ना|पन्ने|पान)\s*(?:no\.?|num(?:ber)?|नंबर|नम्बर|संख्या|क्रमांक|क्र\.)?\s*[:#.]?\s*(\d{1,4})/i;
const PAGE_B = /(\d{1,4})\s*(?:वें|वे|वा|वी|th|st|nd|rd|ve)?\s*(?:page|pg|पेज|पृष्ठ|पन्ने|पन्ना|पान)/i;
export function pageAsked(q) {
  const m = String(q).match(PAGE_A) || String(q).match(PAGE_B);
  return m ? Number(m[1]) : 0;
}
const PAGE_WORDS = ["page", "pg", "no", "number", "पेज", "पृष्ठ", "पन्ना", "पन्ने", "पान", "नंबर", "नम्बर", "संख्या", "क्रमांक",
  "पर", "में", "वें", "book", "पुस्तक", "किताब", "ग्रंथ", "of", "on", "from", "what", "written", "लिखा", "बताओ", "बताइए", "explain", "समझाओ"].map(fold);

// "summarize", "summary", "सारांश", "सार", "संक्षेप", "थोडक्यात", "saransh", "what is X about" …
export const SUMMARY_RE = /summar|summery|overview|\bgist\b|what is (this|the|it)? ?(book )?about|saa?ransh|\bsaar\b|सारांश|सार\b|सार बता|संक्षेप|संक्षिप्त|थोडक्यात|किस बारे में|बारे में है/i;
export const SUMMARY_WORDS = ["summarize", "summarise", "summary", "summery", "book", "overview", "gist", "saransh", "saar", "सारांश", "सार", "संक्षेप", "पुस्तक", "किताब", "ग्रंथ", "बताओ", "बताइए", "थोडक्यात", "सांगा", "ka", "ki", "batao"].map(fold);
