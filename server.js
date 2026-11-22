// SANATAN — web server
// Serves the browser app from /public and proxies chat to the Claude API,
// so your API key never reaches the visitor's browser.

import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { createLibrary } from "./library.js";
import { createLearner } from "./learner.js";
import { createKnowledge, mediaTypeOf, pageAsked, SUMMARY_RE, SUMMARY_WORDS } from "./knowledge.js";
import { createTitler } from "./titles.js";
import { createLinkLearner } from "./links.js";
import { createTTS } from "./tts.js";
import { createTranslator } from "./translate.js";
import { createProSummary } from "./pro-summary.js";
import { createUnderstanding } from "./understand.js";
import { answerFromLibrary, summaryMarkdown, summaryStream, pickLang, smallTalk, GREETING, warmSmallTalk } from "./library-answer.js";
import { createLocalBrain } from "./local-brain.js";
import { createScriptFilter } from "./script-filter.js";

try { process.loadEnvFile(); } catch { /* no .env file — use real env vars */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.MODEL || "claude-opus-5-5";
const EFFORT = process.env.EFFORT || "medium";
const RATE_LIMIT = Number(process.env.RATE_LIMIT) || 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const MAX_MESSAGES = 24;        // conversation turns sent per request
const MAX_CHARS_PER_MSG = 4000; // per message
const MAX_BODY_BYTES = 200_000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
}

const SYSTEM_PROMPT = readFileSync(path.join(__dirname, "prompt", "sanatan-system.md"), "utf8");
// a short persona for the small local model: it follows short instructions better, and a short prompt
// means it starts speaking sooner (the GPU reads ~125 tokens/s before writing the first word)
const LOCAL_PROMPT = readFileSync(path.join(__dirname, "prompt", "local-brain.md"), "utf8");
const LOCAL_CONTEXT_CHARS = 4_000;   // less to read before the first word: faster replies
const LOCAL_VOICE_CONTEXT_CHARS = 1_500;
// languages the local model writes poorly: it answers in English and the offline translator (NLLB) converts it
const LOCAL_TRANSLATE = new Set((process.env.LOCAL_TRANSLATE_LANGS ?? "ml").split(",").map((s) => s.trim()).filter(Boolean));
const LANG_CODE = { Hindi: "hi", Marathi: "mr", Bengali: "bn", Tamil: "ta", Telugu: "te", Kannada: "kn", Malayalam: "ml",
  Gujarati: "gu", Punjabi: "pa", Urdu: "ur" };   // live voice: less to read = he starts speaking sooner
const client = new Anthropic();
const learner = createLearner(__dirname);
const handleLibrary = createLibrary(__dirname, { onChange: (what) => { if (what === "links") linkLearner.run().catch(() => {}); else learner.trigger(); } });
// real book titles read from inside each book (shown and spoken instead of file names)
const titler = createTitler({ learner, client, aiEnabled: () => aiEnabled(), onAiError: (e) => noteAiError(e) });
const knowledge = createKnowledge(learner, titler);
// links (YouTube subtitles, web pages, PDFs) become library files that the reader then learns
const linkLearner = createLinkLearner(__dirname, { onNewFile: () => learner.trigger() });
setTimeout(() => linkLearner.run().catch(() => {}), 6000);
setInterval(() => linkLearner.run().catch(() => {}), 5 * 60 * 1000).unref();
// find titles for books that do not have one yet: books already read first, then the rest
const backfillTitles = () => {
  const all = knowledge.books();
  titler.backfill([...all.filter((b) => b.searchable), ...all.filter((b) => !b.searchable)].map((b) => b.id)).catch(() => {});
};
setTimeout(backfillTitles, 8000);
// build the cross-language sound index now (~15 s once), so the first English/Tamil question is answered quickly
setTimeout(() => knowledge.search("kundalini dhyana").catch(() => {}), 12_000);
setInterval(backfillTitles, 5 * 60 * 1000).unref();
// The AI model is used only when a key exists and CHAT_ENABLED isn't "false"; otherwise answers come from the books.
// If Anthropic says "no credits" or the key is wrong, skip the AI for 10 minutes (answers come from the books),
// then try again by itself, so it starts working as soon as credits are added.
let aiDownUntil = 0;
function noteAiError(e) {
  const m = String(e?.message || "");
  if (/credit balance|authentication|invalid x-api-key|permission/i.test(m) || e?.status === 401 || e?.status === 403) {
    if (Date.now() > aiDownUntil) console.warn("⚠  AI unavailable (" + (m.match(/credit balance/i) ? "no API credits" : "key problem") + "). Using the books only; will retry in 10 minutes.");
    aiDownUntil = Date.now() + 10 * 60 * 1000;
  }
}
const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY && process.env.CHAT_ENABLED !== "false" && Date.now() > aiDownUntil;
// the free local brain (Ollama) thinks whenever Claude is unavailable: answers and study (LOCAL_BRAIN=false turns it off)
const local = createLocalBrain();
const brainNow = () => (aiEnabled() ? "claude" : local.available() ? "local" : "books");
const tts = createTTS(__dirname);
tts.warm(); // load the Hindi and English voices now, not on the first question
// the "one moment" lines (public/app.js HOLD) are cached ahead so they play instantly
setTimeout(() => {
  for (const [t, l] of [["हम्म, एक पल सोचने दीजिए।", "hi"], ["Hmm, let me think for a moment.", "en"], ["हम्म, एक क्षण विचार करू द्या.", "mr"]])
    for (const r of [0.95, 1]) tts.synth(t, l, r).catch(() => {});
}, 3000);
// offline translation (NLLB) so summaries come in the visitor's language; reading pauses while it works
const translator = createTranslator(__dirname, { onBusy: () => learner.hold() });
// with the AI on: whole-book study notes + a professional summary in the visitor's language (cached per book)
const pro = createProSummary({ client, knowledge, learner, rootDir: __dirname, model: MODEL, systemPrompt: SYSTEM_PROMPT });
translator.warm();
// prepared replies (thanks, who are you…) in every language, translated once and cached, so they are instant
setTimeout(() => warmSmallTalk(translator).catch(() => {}), 60_000);
// he builds real UNDERSTANDING of each text he has read (AI on); it is kept and used offline too
const understanding = createUnderstanding({ client, knowledge, learner, rootDir: __dirname, model: MODEL, aiEnabled: () => aiEnabled(), noteAiError: (e) => noteAiError(e), local });
if (process.env.UNDERSTAND !== "false") {
  understanding.trigger(20_000);
  setInterval(() => understanding.trigger(0), 10 * 60 * 1000).unref(); // pick up newly read texts
}
const ttsHits = new Map(); // separate, more generous limit for voice: ip -> timestamps

// Find passages from the user's books for the latest question and format them for the model.
async function libraryContext(messages, { compact = false } = {}) {
  const q = messages[messages.length - 1].content.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "");
  // a question about one page ("page 65 of Kundalini Sadhana", "पेज 65 पर क्या है?"): give the model that page
  const pageNo = pageAsked(q);
  if (pageNo) {
    const b = knowledge.bookForPage(q, messages.slice(0, -1));
    const p = b && (await knowledge.pageText(b.id, pageNo));
    if (p) {
      return `The user is asking about page ${pageNo} of "${b.title}" from Krishna Sakha's library${b.via === "ocr" ? " (read by OCR, so some words may be misread)" : ""}. ` +
        `Here is the text of that page. Explain what this page says and teaches, in your own words, in the user's language; ` +
        `answer any specific question they asked about it, and mention the page.\n\n<page book="${b.title}" number="${pageNo}">\n${p.text}\n</page>`;
    }
    if (b) return `The user asked about page ${pageNo} of "${b.title}", but that page is not in the book (last page: ${(await knowledge.pageText(b.id, 1))?.last || b.pages}). Tell them kindly.`;
    return "The user asked about a page number but did not say which book, and no book was being discussed. Ask which book they mean.";
  }
  // a summary request: give the model the book's key sentences, spread from start to end
  if (SUMMARY_RE.test(q)) {
    const b = knowledge.findBook(q, SUMMARY_WORDS);
    const d = b && (await knowledge.summarize(b.id, 24));
    if (d && d.ready && d.sentences.length) {
      return `The user wants a summary of "${d.book.title}" (${d.book.pages} pages${d.book.via === "ocr" ? ", read by OCR so some words may be misread" : ""}) from Krishna Sakha's library. ` +
        `Main topics: ${d.topics.join(", ")}. Key sentences from the book, in order:\n\n` +
        d.sentences.map((s) => `- ${s.text}${s.page ? ` (page ${s.page})` : ""}`).join("\n") +
        "\n\nWrite a clear summary in your own words from these, in the user's language, and cite pages where useful.";
    }
  }
  const opts = compact ? { limit: 3, snippetLen: 700 } : { limit: 6, snippetLen: 1400 };
  // the search also crosses languages by sound (English/Tamil question -> Hindi books), see sound-search.js
  const { results } = await knowledge.search(q, opts);
  const kw = "";
  if (process.env.DEBUG_BRAIN) console.log(`[search] "${q.slice(0, 60)}" -> ${results.map((r) => `${r.book} p${r.page}${r.by ? " (" + r.by + ")" : ""}`).join("; ") || "nothing"}`);

  // what he has UNDERSTOOD from his study of the texts (understand.js): explained teachings, concepts, answers
  let understood = "";
  try {
    const { aboutBook } = await knowledge.search(q, { limit: 1 });
    const whole = !compact && aboutBook && (await understanding.of(aboutBook));
    if (whole) understood = `<understanding_of_text title="${knowledge.titleOf(aboutBook)}">\n${JSON.stringify(whole)}\n</understanding_of_text>`;
    else {
      const found = await understanding.relevant(q, { limit: compact ? 3 : 8, english: kw });
      if (found.length) understood = found.map((e) =>
        `<understood text="${e.title}" kind="${e.type}"${e.pages ? ` pages="${e.pages}"` : ""}>\n${e.head}\n${e.body}\n</understood>`).join("\n");
    }
  } catch (e) { console.error("[understanding]", e.message); }

  if (!results.length && !understood) return null;
  const passages = results.map((r, i) =>
    `<passage index="${i + 1}" book="${r.book}"${r.page ? ` page="${r.page}"` : ""}>\n${r.text}\n</passage>`).join("\n");
  return (understood
    ? "Your own understanding of texts in your library, built earlier by studying each text in full. Use it to explain the meaning, " +
      "not just quote; connect ideas across texts where it helps. Cite as (Text name, page N).\n\n" +
      `<my_understanding>\n${understood}\n</my_understanding>\n\n`
    : "") +
    (results.length
      ? "Passages from books in Krishna Sakha's own library that may relate to the user's latest message. " +
        "Some were read by OCR and may contain misread words. Use them when relevant and cite them as (Book name, page N). " +
        `<library_passages>\n${passages}\n</library_passages>\n\n`
      : "") +
    "If none of this answers the question, say what the library doesn't cover and answer from general knowledge, clearly marked as such.";
}

// ---------- owner check (ADMIN_PASSWORD) ----------
function isOwner(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return false;
  const a = createHash("sha256").update(String(req.headers["x-admin-key"] || "")).digest();
  const b = createHash("sha256").update(pass).digest();
  return timingSafeEqual(a, b);
}

// ---------- tiny per-IP rate limiter ----------
const hits = new Map(); // ip -> number[] (timestamps)
function allow(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(ip);
}, RATE_WINDOW_MS).unref();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",")[0].trim()) || req.socket.remoteAddress || "unknown";
}

// ---------- helpers ----------
function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validateMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const msgs = raw.slice(-MAX_MESSAGES).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content: String(m?.content ?? "").slice(0, MAX_CHARS_PER_MSG).trim(),
  })).filter((m) => m.content);
  // Must start with user, alternate roles, end with user.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const clean = [];
  for (const m of msgs) {
    if (clean.length && clean[clean.length - 1].role === m.role) clean[clean.length - 1] = m;
    else clean.push(m);
  }
  if (!clean.length || clean[clean.length - 1].role !== "user") return null;
  return clean;
}

// ---------- /api/chat (streams Server-Sent Events) ----------
async function handleChat(req, res) {
  learner.hold(); // pause reading so the answer and voice are fast
  if (!allow(clientIp(req))) {
    return sendJson(res, 429, { error: "Too many questions in a short time. Please rest a few minutes and ask again. 🙏" });
  }
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch (e) { return sendJson(res, e.status || 400, { error: "Invalid request." }); }

  const messages = validateMessages(body.messages);
  if (!messages) return sendJson(res, 400, { error: "No question received." });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // send the headers now: on a slow local brain the first word can take long, and a client must not give up
  res.flushHeaders();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // Answer straight from the books (no AI model), streamed in small pieces so it feels live.
  const libraryAnswer = async () => {
    // summaries stream piece by piece (each sentence as soon as it is translated)
    const text = await answerFromLibrary(messages, { knowledge, learner, translator, understanding, emit: (p) => { if (!res.destroyed) send({ t: p }); } });
    for (const piece of text.match(/[^\n.!?।॥]+[\n.!?।॥]*/g) || [text]) {
      if (res.destroyed) return;
      send({ t: piece });
      await new Promise((r) => setTimeout(r, 25));
    }
    send({ done: true, source: "library" });
  };

  // Answer with the LOCAL BRAIN (free model in Ollama), grounded in the same library context. Returns false if it
  // could not answer (Ollama off, error), so the caller can fall back to the books-only answer.
  const localAnswerInner = async () => {
    const raw = messages[messages.length - 1].content;
    const plain = raw.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "").trim();
    // greetings, thanks, "what is your name": the prepared reply is instant (and never a garbled name)
    if (!local.available() || smallTalk(plain) || GREETING.test(plain)) return false;
    learner.hold(120_000);                        // the computer's power goes to this answer, not to reading
    let ctx = null;
    try { ctx = await libraryContext(messages, { compact: true }); } catch (e) { console.error("[library search]", e.message); }
    const ctl = new AbortController();
    res.on("close", () => ctl.abort());
    let wrote = false;
    // Real-time design: the system prompt never changes and earlier turns are sent exactly as before, so Ollama
    // reuses what it already read (its prompt cache) and only reads the newest question. The library context
    // goes into the newest message only. In a live voice conversation the context is smaller and replies are
    // short, so he starts speaking within a few seconds, like a person talking.
    const voice = body.voice === true;
    const long = /\b(detail|explain fully|in depth|long)\b|विस्तार|विस्तृत/i.test(raw);
    const ctxChars = voice && !long ? LOCAL_VOICE_CONTEXT_CHARS : LOCAL_CONTEXT_CHARS;
    // a small model drifts into English in follow-up turns: name the reply language on every turn
    const q = raw.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "").trim();
    const tag = raw.match(/\[REPLY IN: ([^\]]+)\]/i)?.[1];
    const code = pickLang(raw, q);
    const SCRIPT_LANG = [[/[ঀ-৿]/, "Bengali, in Bengali script"], [/[஀-௿]/, "Tamil, in Tamil script"],
      [/[ఀ-౿]/, "Telugu, in Telugu script"], [/[ಀ-೿]/, "Kannada, in Kannada script"],
      [/[ഀ-ൿ]/, "Malayalam, in Malayalam script"], [/[઀-૿]/, "Gujarati, in Gujarati script"],
      [/[਀-੿]/, "Punjabi, in Gurmukhi script"], [/[؀-ۿ]/, "Urdu, in Urdu (Nastaliq/Arabic) script"]];
    const LANG_FULL = { Punjabi: "Punjabi, in Gurmukhi script", Urdu: "Urdu, in Urdu (Arabic) script", Hindi: "Hindi, in Devanagari script",
      Marathi: "Marathi, in Devanagari script", Bengali: "Bengali, in Bengali script", Tamil: "Tamil, in Tamil script",
      Telugu: "Telugu, in Telugu script", Kannada: "Kannada, in Kannada script", Malayalam: "Malayalam, in Malayalam script",
      Gujarati: "Gujarati, in Gujarati script",
      "Sanskrit (with simple Hindi explanation)": "Sanskrit and Hindi: begin with one or two short, simple Sanskrit sentences in Devanagari, then explain them in simple Hindi" };
    const langName = (tag && (LANG_FULL[tag] || tag)) || SCRIPT_LANG.find(([re]) => re.test(q))?.[1] ||
      { hi: "Hindi, in Devanagari script", mr: "Marathi, in Devanagari script" }[code] ||
      (/\b(kya|hai|kaise|mein|aap|karu|kitni|kyun|nahi)\b/i.test(q) ? "Hinglish (Hindi in Roman letters)" : "English");
    // the context's citation wording is for Claude; spell it out for the small model so it never copies a placeholder
    // ...and plain-text labels instead of XML tags: a small model copies tags like <passage index="1"> into its answer
    const ctxText = ctx && ctx.slice(0, ctxChars)
      .replace(/\((Book|Text) name, page N\)/g, "(the exact book title from the passage, its page number)")
      .replace(/<passage index="\d+" book="([^"]*)"(?: page="([^"]*)")?>/g, (m, b, p) => `--- From the book "${b}"${p ? `, page ${p}` : ""}:`)
      .replace(/<understood text="([^"]*)" kind="[^"]*"(?: pages="([^"]*)")?>/g, (m, t, p) => `--- What I understood from "${t}"${p ? ` (pages ${p})` : ""}:`)
      .replace(/<understanding_of_text title="([^"]*)">/g, (m, t) => `--- My understanding of the whole text "${t}":`)
      .replace(/<page book="([^"]*)" number="([^"]*)">/g, (m, b, n) => `--- Page ${n} of "${b}":`)
      .replace(/<\/?[a-z_]+[^>]*>/g, "");
    // Languages the small model writes poorly (default: Malayalam) are answered through the offline translator:
    // he thinks in English, and every finished sentence is translated (NLLB) and sent at once, so speech still
    // starts within a few seconds and each next sentence is translated while the previous one is spoken.
    const target = Object.entries(LANG_CODE).find(([n]) => langName.startsWith(n))?.[1];
    const viaTranslation = !!target && LOCAL_TRANSLATE.has(target) && translator.enabled;
    const thinkIn = viaTranslation ? "English" : langName;
    // nothing in the library: a small model then tends to invent "what the text says"; tell it plainly
    const noLibrary = "[Your library has no passage on this. Answer from general knowledge in simple words. Do not claim what a " +
      "specific book or page says, and never invent details of practices, verses or texts; if unsure, say so.]\n";
    const turns = messages.slice(-8).map((m, i, all) => i < all.length - 1 ? m : {
      role: "user",
      content: (ctxText ? `PASSAGES FROM MY LIBRARY (use only what answers the question):\n${ctxText}\n--- End of passages.\n\n` : noLibrary) +
        `[Reply in ${thinkIn}${viaTranslation ? " only (your answer will be translated for the user)" : ""}` +
        `${voice && !long ? "; live voice conversation: 2-4 short spoken sentences, no book citations" : ""}.]\n` +
        (viaTranslation ? m.content.replace(/\[REPLY IN: [^\]]*\]\s*/gi, "") : m.content),
    });
    const finalFilter = viaTranslation ? createScriptFilter(langName, { allowedPages: null }) : null;
    // stray words of another script (a small-model slip) are removed before they are shown or spoken
    // only pages that really appear in the passages may be cited; any other page number is a guess and is removed
    const allowedPages = new Set();
    for (const m of (ctxText || "").matchAll(/pages? (\d+)(?:\s*[-–]\s*(\d+))?/g)) {
      const a = Number(m[1]), b = Number(m[2] || m[1]);
      for (let p = a; p <= Math.min(b, a + 50); p++) allowedPages.add(String(p));
    }
    const filter = createScriptFilter(thinkIn, { allowedPages });
    let derailed = false;
    let english = "", chain = Promise.resolve();
    const translateOut = (sentence) => {
      if (!sentence.trim()) return;
      chain = chain.then(async () => {
        const t = await translator.translate(sentence.trim(), target);
        const clean = finalFilter.push(t + (/\n\s*$/.test(sentence) ? "\n\n" : " "));
        if (clean && !res.destroyed) { wrote = true; send({ t: clean }); }
      });
    };
    const out = (c) => {
      if (!viaTranslation) { if (!res.destroyed) { wrote = true; send({ t: c }); } return; }
      english += c;
      let m;   // every finished sentence goes to the translator right away
      while ((m = english.match(/^[\s\S]*?[.!?](?=\s)\s*|^[\s\S]*?\n\s*\n/))) { translateOut(m[0]); english = english.slice(m[0].length); }
    };
    try {
      await local.chat({
        system: LOCAL_PROMPT,
        messages: turns,
        signal: ctl.signal,
        maxTokens: long ? 1500 : voice ? 300 : 420,
        // less randomness outside English: a small model then strays less into words of other languages
        temperature: /^English/.test(thinkIn) ? 0.6 : 0.35,
        onText: (t) => {
          const c = filter.push(t);
          if (c) out(c);
          // the model wandered into another script: stop it now and keep the good part (no long silent wait)
          if (filter.derailed && wrote) { derailed = true; ctl.abort(); }
        },
      });
      const rest = filter.end();
      if (rest) out(rest);
      if (viaTranslation) {
        translateOut(english); await chain;
        const tail = finalFilter.end();
        if (tail && !res.destroyed) send({ t: tail });
      }
      send({ done: true, source: viaTranslation ? "local+translation" : "local" });
      return true;
    } catch (e) {
      if (derailed) { console.warn(`[local brain] stopped an answer that drifted out of ${langName}`); send({ done: true, source: "local" }); return true; }
      if (ctl.signal.aborted) return true;      // visitor left
      console.error("[local brain]", String(e?.message ?? e).slice(0, 160));
      if (wrote) { send({ t: "\n\n…(my thought was interrupted; please ask again)" }); send({ done: true, source: "local" }); return true; }
      return false;
    }
  };
  // a visitor's question claims the GPU at once: background study stops immediately and waits until it's quiet
  const localAnswer = async () => { const release = local.claim(); try { return await localAnswerInner(); } finally { release(); } };

  // greetings, thanks, ok, bye, praise, "what is your name": a prepared reply at once, whatever brain is on
  {
    const plain = messages[messages.length - 1].content.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "").trim();
    if (smallTalk(plain) || GREETING.test(plain)) {
      try { await libraryAnswer(); } catch { send({ error: "Something went wrong." }); }
      return res.end();
    }
  }

  if (!aiEnabled()) {
    // a Pro summary written earlier by the AI is kept on disk and still used without the AI
    {
      const raw = messages[messages.length - 1].content;
      const q = raw.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "").trim();
      const target = SUMMARY_RE.test(q) && knowledge.findBook(q, SUMMARY_WORDS);
      const saved = target && (await pro.cached(target.id, pickLang(raw, q)));
      if (saved) { send({ t: saved }); send({ done: true, source: "pro-saved" }); return res.end(); }
    }
    if (await localAnswer()) return res.end();
    try { await libraryAnswer(); } catch (e) { console.error("[library answer]", e); send({ error: "Could not search the library." }); }
    return res.end();
  }

  // AI on + "summarize <book>": study the whole book and write a professional summary (falls back to offline)
  {
    const raw = messages[messages.length - 1].content;
    const q = raw.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "").trim();
    const target = SUMMARY_RE.test(q) && knowledge.findBook(q, SUMMARY_WORDS);
    if (target && target.searchable) {
      try {
        await pro.run(target.id, pickLang(raw, q), (p) => { if (!res.destroyed) send({ t: p }); }, { onBusy: () => learner.hold() });
        send({ done: true, source: "pro" });
      } catch (e) {
        noteAiError(e); console.error("[pro summary]", e?.status ?? "", String(e?.message ?? e).slice(0, 160));
        try { await libraryAnswer(); } catch { send({ error: "Could not make a summary." }); }
      }
      return res.end();
    }
  }

  let context = null;
  try { context = await libraryContext(messages); } catch (e) { console.error("[library search]", e.message); }

  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: EFFORT },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // cached persona first; the per-question library passages come after the cache breakpoint
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          ...(context ? [{ type: "text", text: context }] : []),
        ],
        messages,
      },
      { signal: abort.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send({ t: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send({ t: "\n\nI'm not able to help with that request. Please ask me something else. 🙏" });
    } else if (final.stop_reason === "max_tokens") {
      send({ t: "\n\n…(the answer was cut short; ask me to continue)" });
    }
    send({ done: true });
  } catch (err) {
    if (abort.signal.aborted) return; // visitor closed the page
    noteAiError(err); console.error("[chat error]", err?.status ?? "", String(err?.message ?? err).slice(0, 160));
    // AI unavailable (no credits, outage…): answer from the books instead of failing
    if (!(err instanceof Anthropic.RateLimitError)) {
      try { if (await localAnswer()) return; await libraryAnswer(); return; } catch { /* fall through to an error message */ }
    }
    let msg = "Something went wrong. Please try again.";
    if (err instanceof Anthropic.RateLimitError) msg = "Krishna Sakha is receiving many questions right now. Please try again in a minute.";
    else if (err instanceof Anthropic.AuthenticationError) msg = "Server key is not configured correctly.";
    else if (/credit balance/i.test(err?.message || "")) msg = "Krishna Sakha is resting right now (the site's AI credits have run out). Please try again later.";
    else if (err instanceof Anthropic.APIConnectionError) msg = "Could not reach the AI service. Please try again.";
    else if (err instanceof Anthropic.APIError && err.status >= 500) msg = "The AI service is busy. Please try again shortly.";
    send({ error: msg });
  } finally {
    res.end();
  }
}

// ---------- static files ----------
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".tflite": "application/octet-stream", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "POST" && url.pathname === "/api/chat") return await handleChat(req, res);
    // what he is reading right now: the page's OCR text (or the talk's latest words) and a small page image
    if (req.method === "GET" && url.pathname === "/api/reading/live") {
      const l = learner.live();
      return sendJson(res, 200, { ...l, title: l.id ? titler.titleFor(l.id) : "" });
    }
    if (req.method === "GET" && url.pathname === "/api/reading/page.jpg") {
      const img = learner.liveImage();
      if (!img) { res.writeHead(204); return res.end(); }
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": img.length, "Cache-Control": "no-store" });
      return res.end(img);
    }
    // anyone may let him go back to his book after a conversation (the owner's Pause switch stays owner-only)
    if (req.method === "POST" && url.pathname === "/api/learner/continue") { learner.release(); return sendJson(res, 200, learner.status()); }
    if (await handleLibrary(req, res, url)) return;
    if (req.method === "GET" && url.pathname === "/api/knowledge") {
      const books = knowledge.books();
      // links that could not become a file (e.g. YouTube without subtitles) are listed too
      for (const l of linkLearner.pending()) books.push({ id: l.url, title: l.title || l.url, author: l.author || "", file: l.url, kind: l.kind || "media", media: (l.kind || "media") === "media" ? mediaTypeOf(l.url) : "", status: l.status, label: l.note || l.status, pages: 0, searchable: false, url: l.url });
      const st = learner.status();
      if (st.id) st.title = titler.titleFor(st.id); // the real title, never the file name
      return sendJson(res, 200, { books, status: st });
    }
    if (url.pathname.startsWith("/api/knowledge/") || url.pathname === "/api/tts") learner.hold();
    if (req.method === "POST" && url.pathname === "/api/engage") { learner.hold(); local.seen(); tts.warm(); return sendJson(res, 200, { ok: true }); } // visitor started talking
    if (req.method === "GET" && url.pathname === "/api/knowledge/summary") {
      const lang = url.searchParams.get("lang") || "en";
      const book = url.searchParams.get("book") || "";
      if (url.searchParams.get("stream") === "1") {
        // Server-Sent Events: headings first, then each sentence as soon as it is translated
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
        const ev = (o) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(o)}\n\n`); };
        try {
          let ok = false;
          if (aiEnabled()) {
            try { ok = await pro.run(book, lang, (p) => ev({ t: p }), { onBusy: () => learner.hold() }); }
            catch (e) { noteAiError(e); console.error("[pro summary]", e?.status ?? "", String(e?.message ?? e).slice(0, 160)); }
          }
          if (!ok) { const saved = await pro.cached(book, lang); if (saved) { ev({ t: saved }); ok = true; } }
          if (!ok) ok = await summaryStream(knowledge, book, lang, (p) => ev({ t: p }), translator);
          ev(ok ? { done: true } : { error: "Book not found." });
        } catch (e) { console.error("[summary]", e); ev({ error: "Could not make a summary." }); }
        return res.end();
      }
      const md = await summaryMarkdown(knowledge, book, lang, translator);
      return md ? sendJson(res, 200, { markdown: md }) : sendJson(res, 404, { error: "Book not found." });
    }
    if (req.method === "GET" && url.pathname === "/api/knowledge/ask") {
      // the 📖 window: summaries, "which books", greetings, or passages, same as the chat's library answers
      const q = (url.searchParams.get("q") || "").slice(0, 300);
      const lang = url.searchParams.get("lang") || "";
      const content = (lang ? `[REPLY IN: ${lang}] ` : "") + q;
      const md = await answerFromLibrary([{ role: "user", content }], { knowledge, learner, translator, understanding, book: url.searchParams.get("book") || "" });
      return sendJson(res, 200, { markdown: md, summary: SUMMARY_RE.test(q) });
    }
    if (req.method === "GET" && url.pathname === "/api/knowledge/search") {
      const q = url.searchParams.get("q") || "";
      return sendJson(res, 200, await knowledge.search(q, { book: url.searchParams.get("book") || "" }));
    }
    if (req.method === "POST" && (url.pathname === "/api/learner/pause" || url.pathname === "/api/learner/resume")) {
      // owner only: same password as the Library
      if (!isOwner(req)) return sendJson(res, 401, { error: process.env.ADMIN_PASSWORD ? "Wrong owner password." : "Set ADMIN_PASSWORD in .env first." });
      await learner.setPaused(url.pathname.endsWith("pause"));
      return sendJson(res, 200, learner.status());
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      local.seen();   // the page is open: keep background study off so the GPU stays cool and free
      // what Krishna Sakha is reading right now, with the real book titles
      const st = learner.status();
      if (st.id) st.title = titler.titleFor(st.id);
      if (st.lastCompleted?.id) st.lastCompleted = { ...st.lastCompleted, title: titler.titleFor(st.lastCompleted.id) };
      st.understanding = await understanding.status();
      st.brain = brainNow(); st.localModel = local.enabled ? local.model : null;
      return sendJson(res, 200, st);
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      // Chat is always open: with the AI model when enabled, otherwise answers come from the books.
      return sendJson(res, 200, { chatEnabled: true, aiEnabled: aiEnabled() || local.available(), brain: brainNow(), localModel: local.enabled ? local.model : null, tts: tts.info() });
    }
    if (req.method === "POST" && url.pathname === "/api/tts") {
      const ip = clientIp(req), nowMs = Date.now();
      const list = (ttsHits.get(ip) || []).filter((t) => nowMs - t < RATE_WINDOW_MS);
      if (list.length >= 400) return sendJson(res, 429, { error: "Too many voice requests." });
      list.push(nowMs); ttsHits.set(ip, list);
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "Invalid request." }); }
      try {
        const wav = await tts.synth(body.text, body.lang, body.rate);
        if (!wav) return sendJson(res, 404, { error: "No natural voice for this language." });
        res.writeHead(200, { "Content-Type": wav.subarray(0, 4).toString("latin1") === "RIFF" ? "audio/wav" : "audio/mpeg", "Content-Length": wav.length, "Cache-Control": "private, max-age=86400" });
        return res.end(wav);
      } catch (e) {
        console.error("[tts]", e.message);
        return sendJson(res, 500, { error: "Voice generation failed." });
      }
    }
    if (req.method === "GET" && req.url === "/healthz") return sendJson(res, 200, { ok: true });
    if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);
    res.writeHead(405); res.end();
    return;
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: "Server error" });
    else res.end();
  }
});
// No time limit on requests, so uploads on slow connections are never cut off.
server.requestTimeout = 0;
server.timeout = 0;
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already used by another program. Set a different PORT in .env (e.g. PORT=3100) and start again.`);
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, () => {
  console.log(`🕉  Krishna Sakha is live at http://localhost:${PORT}  (model: ${MODEL}, effort: ${EFFORT})`);
});
