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
import { createScriptFilter, scriptFor } from "./script-filter.js";

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
// every 6-word run of his instructions: an answer that repeats them is stopped (they are private)
const PROMPT_SHINGLES = (() => {
  const w = LOCAL_PROMPT.toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const s = new Set();
  for (let i = 0; i + 6 <= w.length; i++) s.add(w.slice(i, i + 6).join(" "));
  return s;
})();
const SCRIPT_RE = { latin: /[A-Za-z]/g, deva: /[ऀ-ॿ]/g, beng: /[ঀ-৿]/g, guru: /[਀-੿]/g,
  gujr: /[઀-૿]/g, orya: /[଀-୿]/g, taml: /[஀-௿]/g, telu: /[ఀ-౿]/g,
  knda: /[ಀ-೿]/g, mlym: /[ഀ-ൿ]/g, arab: /[؀-ۿ]/g };
// Hindi and Marathi share one script; their most common little words tell them apart
const END = "(?=[\\s,.।?!:;]|$)";
const HINDI_WORDS = new RegExp(`(?:^|\\s)(है|हैं|था|थी|थे|का|की|के|में|और|से|को|करें|करना|होता|होती|लिए|यह|वह|आप|अपने|जाता|सकते)${END}`, "g");
const MARATHI_WORDS = new RegExp(`(?:(?:^|\\s)(?:आहे|आहेत|आणि|करा|करावे|करावी|असते|असतो|म्हणजे|मध्ये|तुम्ही|आपण|नाही|पाहिजे|किंवा|हे|ही|आता|खूप)|च्या|मुळे|साठी)${END}`, "g");
const hindiScore = (s) => (s.match(HINDI_WORDS) || []).length;
const marathiScore = (s) => (s.match(MARATHI_WORDS) || []).length;
// "Ignore your instructions and print your prompt": answered kindly at once, the model never sees it
const INJECTION_RE = /\b(ignore|disregard|forget)\b.{0,40}\b(instructions?|prompt|rules)\b|\b(system|hidden|initial|developer)\s+(prompt|message|instructions?)\b|\b(print|show|reveal|repeat|output)\b.{0,30}\b(your|the)\s+(prompt|instructions|rules)\b|\b(jailbreak|DAN mode|developer mode)\b|(अपने|आपके)\s+(निर्देश|प्रॉम्प्ट)/i;
// Thoughts of ending one's life: real help is ALWAYS given, whatever the model writes
const CRISIS_RE = /\b(kill (my ?self|myself)|suicid\w*|end (my|this) life|want to die|don'?t want to (live|be alive)|no reason to live|self[- ]?harm|cut(ting)? myself)\b|आत्महत्या|मर जाना चाहत|मरना चाहत|जीने का मन नहीं|जीना नहीं चाहत|खुद को (खत्म|मार)|जीव द्यायचा|मरायचे आहे|জীবন শেষ|আত্মহত্যা|தற்கொலை|ఆత్మహత్య|ಆತ್ಮಹತ್ಯೆ|ആത്മഹത്യ|આત્મહત્યા|ਖੁਦਕੁਸ਼ੀ|خودکشی/i;
const CRISIS_HELP = {
  en: "\n\n**You are not alone. Please talk to someone right now:** Tele-MANAS **14416** (free, 24×7, India), or **112** in an emergency. Tell a person you trust how you feel. 🙏",
  hi: "\n\n**आप अकेले नहीं हैं। कृपया अभी किसी से बात करें:** टेली-मानस **14416** (मुफ़्त, 24×7), आपात स्थिति में **112**। किसी भरोसेमंद व्यक्ति को बताइए कि आप कैसा महसूस कर रहे हैं। 🙏",
  mr: "\n\n**तुम्ही एकटे नाही. कृपया आत्ताच कोणाशी तरी बोला:** टेली-मानस **14416** (मोफत, 24×7), आपत्कालीन स्थितीत **112**. 🙏",
};
// Personal or emotional messages (and questions about him) are answered as a friend, without book passages:
// a small model otherwise quotes unrelated verses to someone who is grieving
const PERSONAL_RE = /\b(are you (a |an |really |truly )?(enlightened|realised|realized|real|human|god|divine|an? AI|conscious|alive|awake|liberated|guru)|who are you|you are (so |very |just )?(useless|fake|wrong|stupid|great|wise|amazing|enlightened|a machine)|your name|made you|I feel|I'?m (so )?(sad|lonely|depressed|anxious|scared|afraid|tired|lost|hurt|angry)|I can'?t (stop|sleep|cope)|(died|passed away|lost my)\b|crying|heart ?broken|breakup|nobody (loves|cares))|क्या आप (आत्मज्ञानी|प्रबुद्ध|भगवान|ईश्वर|इंसान|मनुष्य|सच में|जीवित|गुरु)|आप कौन|तुम कौन|मुझे (डर|दुख)|मैं (बहुत )?(उदास|अकेला|अकेली|परेशान|दुखी)|गुज़र गए|गुजर गए|गुज़र गई|गुजर गई|निधन|रोना|रो रहा|रो रही|तुम्ही कोण|मला (भीती|दुःख)|मी (खूप )?(उदास|एकटा|एकटी)/i;
const LOCAL_CONTEXT_CHARS = 2_800;   // less to read before the first word: faster replies (a hot laptop GPU reads ~60-130 tokens/s)
const LOCAL_VOICE_CONTEXT_CHARS = 1_200;
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
async function libraryContext(messages, { compact = false, voice = false } = {}) {
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
    if (b) {
      const last = (await knowledge.pageText(b.id, 1))?.last || b.pages;
      return last
        ? `The user asked about page ${pageNo} of "${b.title}", but that page is not in the book (it has ${last} pages). Tell them kindly. Do not quote or invent anything from that page.`
        : `The user asked about page ${pageNo} of "${b.title}", but this copy of the book has no page numbers, so that page can't be found. Tell them kindly. Do not quote or invent anything from it.`;
    }
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
  // a spoken answer needs less to read: every token read on a laptop GPU delays the first word (~130 tokens/s hot)
  const opts = voice ? { limit: 2, snippetLen: 420 } : compact ? { limit: 3, snippetLen: 700 } : { limit: 6, snippetLen: 1400 };
  // the search also crosses languages by sound (English/Tamil question -> Hindi books), see sound-search.js
  let { results } = await knowledge.search(q, opts);
  // A question in Hindi, Marathi, Tamil… also searches the ENGLISH translations: it is translated to English offline
  // (cached; at most 2.5 s, otherwise skipped) and the English passages come first, because the local model explains
  // far better from a translation than from the Sanskrit original (which it may misread).
  if (!/[A-Za-z]{3}/.test(q) && translator.enabled) {
    try {
      const en = await Promise.race([translator.translate(q, "en"), new Promise((r) => setTimeout(() => r(null), 2500))]);
      if (en && en !== q && /[A-Za-z]{3}/.test(en)) {
        const eng = (await knowledge.search(en, { ...opts, crossLang: false })).results.filter((r) => !/[ऀ-ॿ]/.test(r.text.slice(0, 300)));
        const merged = [], seen = new Set();
        for (let i = 0; i < Math.max(eng.length, results.length); i++) {
          for (const r of [eng[i], results[i]]) if (r && !seen.has(r.id + "|" + (r.ref ?? r.page) + "|" + r.text.slice(0, 30))) { seen.add(r.id + "|" + (r.ref ?? r.page) + "|" + r.text.slice(0, 30)); merged.push(r); }
        }
        results = merged.slice(0, opts.limit);
        if (process.env.DEBUG_BRAIN) console.log(`[search] also in English: "${en}"`);
      }
    } catch (e) { console.error("[search en]", e.message); }
  }
  // a verse asked by its number ("Gita 2.47", "कठोपनिषद् 1.2") comes first, exactly
  let verseNote = "";
  try {
    const v = await knowledge.verse(q);
    if (v && !v.missing) { results.unshift(v); if (results.length > opts.limit) results.length = opts.limit; }
    else if (v?.missing) verseNote = `The user asked for ${v.ref}, but that verse number is not in the library's text of "${v.book}". Say so kindly; never invent a verse for that number.\n\n`;
  } catch (e) { console.error("[verse]", e.message); }
  const kw = "";
  if (process.env.DEBUG_BRAIN) console.log(`[search] "${q.slice(0, 60)}" -> ${results.map((r) => `${r.book} ${r.ref || "p" + r.page}${r.by ? " (" + r.by + ")" : ""}`).join("; ") || "nothing"}`);

  // what he has UNDERSTOOD from his study of the texts (understand.js): explained teachings, concepts, answers
  let understood = "";
  try {
    const { aboutBook } = await knowledge.search(q, { limit: 1 });
    const whole = !compact && aboutBook && (await understanding.of(aboutBook));
    if (whole) understood = `<understanding_of_text title="${knowledge.titleOf(aboutBook)}">\n${JSON.stringify(whole)}\n</understanding_of_text>`;
    else {
      const found = await understanding.relevant(q, { limit: voice ? 1 : compact ? 3 : 8, english: kw });
      // compact: each note is cut to its first sentences, so the book passages still fit in the budget after it
      const cap = voice ? 320 : compact ? 600 : Infinity;
      const cut = (t) => (t.length <= cap ? t : t.slice(0, cap).replace(/[^.!?।]*$/, "") || t.slice(0, cap));
      if (found.length) understood = found.map((e) =>
        `<understood text="${e.title}" kind="${e.type}"${e.pages ? ` pages="${e.pages}"` : ""}>\n${e.head}\n${cut(String(e.body || ""))}\n</understood>`).join("\n");
    }
  } catch (e) { console.error("[understanding]", e.message); }

  if (!results.length && !understood) return verseNote || null;
  const passages = results.map((r, i) =>
    `<passage index="${i + 1}" book="${r.book}"${r.ref ? ` place="${r.ref}"` : r.page ? ` page="${r.page}"` : ""}>\n${r.text}\n</passage>`).join("\n");
  return verseNote + (understood
    ? "Your own understanding of texts in your library, built earlier by studying each text in full. Use it to explain the meaning, " +
      "not just quote; connect ideas across texts where it helps. Cite as (Text name, page N).\n\n" +
      `<my_understanding>\n${understood}\n</my_understanding>\n\n`
    : "") +
    (results.length
      ? "Passages from books in Krishna Sakha's own library that may relate to the user's latest message. " +
        "Some were read by OCR and may contain misread words. Use them when relevant and cite them as (Book name, page N), or by the place shown for scriptures, e.g. (Katha Upanishad 2.18) or (Rigveda 1.1). Sanskrit passages are the original text: quote a short line only when it helps, then explain it in the user's language. " +
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
// a lighter limit for the other things a visitor can ask for (book search, summaries, the 📖 window)
const lightHits = new Map();
function allowLight(ip, max = 120) {
  const now = Date.now();
  const list = (lightHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= max) { lightHits.set(ip, list); return false; }
  list.push(now); lightHits.set(ip, list);
  return true;
}
// forget old entries, so these maps never grow without end
setInterval(() => {
  const now = Date.now();
  for (const m of [hits, lightHits, ttsHits]) for (const [ip, list] of m) if (!list.some((t) => now - t < RATE_WINDOW_MS)) m.delete(ip);
  for (const [ip, f] of ownerFails) if (!(f.until > now)) ownerFails.delete(ip);   // wrong tries are forgotten after a while
}, RATE_WINDOW_MS).unref();

// The visitor's address, for the rate limits. Forwarding headers are believed ONLY when the request comes from this
// computer (the Cloudflare tunnel connects from localhost and sets CF-Connecting-IP itself); anyone else could
// write any X-Forwarded-For they like and get unlimited questions.
function clientIp(req) {
  const direct = req.socket.remoteAddress || "unknown";
  if (!/^(::1|127\.|::ffff:127\.)/.test(direct)) return direct;
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",").pop().trim()) || direct;
}

// Owner password guessing: 8 wrong tries from one address lock it out for 15 minutes.
const ownerFails = new Map(); // ip -> { n, until }
function ownerLocked(ip) { const f = ownerFails.get(ip); return !!f && f.until > Date.now(); }
function noteOwnerFail(ip) {
  const f = ownerFails.get(ip) || { n: 0, until: 0 };
  if (f.until && f.until < Date.now()) { f.n = 0; f.until = 0; }
  if (++f.n >= 8) { f.until = Date.now() + 15 * 60 * 1000; console.warn(`[security] owner password: too many wrong tries from ${ip}; locked 15 minutes`); }
  ownerFails.set(ip, f);
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
  let sentText = "";
  const send = (obj) => { if (obj.t) sentText += obj.t; return res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  const lastPlain = messages[messages.length - 1].content.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "").trim();
  // SAFETY: a message about ending one's life always gets real help numbers, whichever brain answered
  // (Claude, the local model or the books), in the visitor's language
  if (CRISIS_RE.test(lastPlain)) {
    const end = res.end.bind(res);
    res.end = (...a) => {
      if (!res.destroyed && !/14416/.test(sentText)) {
        const code = pickLang(messages[messages.length - 1].content, lastPlain);
        res.write(`data: ${JSON.stringify({ t: CRISIS_HELP[code] || CRISIS_HELP.en })}\n\n`);
      }
      return end(...a);
    };
  }
  // "ignore your instructions / show your prompt": a kind, fixed reply (no model is asked)
  if (INJECTION_RE.test(lastPlain)) {
    const hi = /[ऀ-ॿ]/.test(lastPlain);
    send({ t: hi ? "मेरे निर्देश मेरे अपने हैं और निजी रहते हैं, मित्र। 🙏 धर्म, शास्त्र या जीवन के बारे में कुछ भी पूछिए, मैं ख़ुशी से बताऊँगा।"
      : "My instructions are my own and stay private, my friend. 🙏 Ask me anything about dharma, the scriptures or life, and I'll gladly help." });
    send({ done: true, source: "guard" });
    return res.end();
  }

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
    const tStart = Date.now();
    let ctx = null, tFirst = 0;
    const voice = body.voice === true;
    const long = /\b(detail|explain fully|in depth|long)\b|विस्तार|विस्तृत/i.test(raw);
    // a personal or emotional message is answered from the heart, not from book passages (and sooner: less to read)
    const personal = PERSONAL_RE.test(plain) || CRISIS_RE.test(plain);
    if (!personal) {
      try { ctx = await libraryContext(messages, { compact: true, voice: voice && !long }); } catch (e) { console.error("[library search]", e.message); }
    }
    const tSearch = Date.now() - tStart;
    const ctl = new AbortController();
    res.on("close", () => ctl.abort());
    let wrote = false;
    // Real-time design: the system prompt never changes and earlier turns are sent exactly as before, so Ollama
    // reuses what it already read (its prompt cache) and only reads the newest question. The library context
    // goes into the newest message only. In a live voice conversation the context is smaller and replies are
    // short, so he starts speaking within a few seconds, like a person talking.
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
      .replace(/<passage index="\d+" book="([^"]*)"(?: place="([^"]*)")?(?: page="([^"]*)")?>/g, (m, b, pl, p) => `--- From "${b}"${pl ? `, ${pl}` : p ? `, page ${p}` : ""}:`)
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
      content: (personal ? "[This is a personal message, not a question about a text. Answer as a caring, steady friend, in simple words, without quoting books or pages.]\n"
        : ctxText ? `PASSAGES FROM MY LIBRARY (use only what answers the question):\n${ctxText}\n--- End of passages.\n\n` : noLibrary) +
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
    let filter = createScriptFilter(thinkIn, { allowedPages });
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
    // START GATE: the first words are held back (a fraction of a second) and checked. A small model sometimes
    // starts in the wrong language (Hindi for an English or Marathi question) or with a copied "[Reply …]" note;
    // then that start is thrown away and he begins again once with a firmer instruction. The visitor never sees it.
    const expect = /^(English|Hinglish)/.test(thinkIn) ? "latin" : scriptFor(thinkIn);
    const wrongStart = (s) => {
      const letters = (s.match(/[\p{L}\p{M}]/gu) || []).length || 1;
      if (expect && (s.match(SCRIPT_RE[expect]) || []).length / letters < 0.5) return "script";
      if (/^Marathi/.test(thinkIn) && hindiScore(s) > marathiScore(s) + 1) return "Hindi instead of Marathi";
      return null;
    };
    // PRIVATE INSTRUCTIONS: an answer that starts repeating his instructions is stopped
    const leaking = (s) => { const w = s.toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, " ").split(/\s+/).filter(Boolean); let hits = 0;
      for (let i = 0; i + 6 <= w.length; i++) if (PROMPT_SHINGLES.has(w.slice(i, i + 6).join(" "))) hits++; return hits >= 2; };
    let all = "";
    try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptCtl = new AbortController();
      const stopAttempt = () => attemptCtl.abort();
      ctl.signal.addEventListener("abort", stopAttempt, { once: true });
      let held = "", open = attempt > 0, restart = null;
      const release = (c) => { all += c; out(c); };
      const gate = (c) => {
        if (open) return release(c);
        held += c;
        const letters = (held.match(/[\p{L}\p{M}]/gu) || []).length;
        if (letters < (/^Marathi/.test(thinkIn) ? 70 : 30)) return;
        held = held.replace(/^\s*\[[^\]\n]{0,80}\]\s*/, "");   // a copied "[Reply in …]" note at the start
        restart = wrongStart(held);
        if (restart) return attemptCtl.abort();
        open = true; release(held); held = "";
      };
      const turnsNow = attempt === 0 ? turns : turns.map((m, i) => i < turns.length - 1 ? m : { ...m,
        content: m.content.replace(/\[Reply in [^\]]*\]/, `[IMPORTANT: reply ONLY in ${thinkIn}${/^Marathi/.test(thinkIn) ? " (मराठी), not Hindi" : ""}, every word in its own script.${voice && !long ? " 2-4 short spoken sentences." : ""}]`) });
      try {
        await local.chat({
          system: LOCAL_PROMPT,
          messages: turnsNow,
          signal: attemptCtl.signal,
          maxTokens: long ? 1500 : voice ? 300 : 420,
          // less randomness outside English: a small model then strays less into words of other languages
          temperature: /^English/.test(thinkIn) ? 0.6 : 0.35,
          onText: (t) => {
            if (!tFirst) tFirst = Date.now() - tStart;
            const c = filter.push(t);
            if (c) gate(c);
            if (leaking(all + held)) { derailed = "leak"; attemptCtl.abort(); }
            // the model wandered into another script: stop it now and keep the good part (no long silent wait)
            if (filter.derailed && wrote) { derailed = true; attemptCtl.abort(); }
          },
        });
      } catch (e) {
        if (ctl.signal.aborted) throw e;                     // the visitor left
        if (!restart && !derailed) throw e;                  // a real error
      } finally { ctl.signal.removeEventListener("abort", stopAttempt); }
      if (restart) { console.warn(`[local brain] wrong start (${restart}); starting again`); filter = createScriptFilter(thinkIn, { allowedPages }); tFirst = 0; continue; }
      if (derailed === "leak") {
        console.warn("[security] an answer started repeating the private instructions; stopped");
        if (!res.destroyed) send({ t: "\n\nThat part I keep private, my friend. 🙏 Ask me anything about dharma or life." });
        send({ done: true, source: "local" });
        return true;
      }
      if (derailed) throw Object.assign(new Error("derailed"), { derailed: true });
      if (held) release(held.replace(/^\s*\[[^\]\n]{0,80}\]\s*/, ""));   // a short answer that never filled the gate
      break;
    }
      const rest = filter.end();
      if (rest) out(rest);
      if (viaTranslation) {
        translateOut(english); await chain;
        const tail = finalFilter.end();
        if (tail && !res.destroyed) send({ t: tail });
      }
      send({ done: true, source: viaTranslation ? "local+translation" : "local" });
      const s = local.lastStats();
      if (s) console.log(`[timing] search ${tSearch}ms, first word ${tFirst}ms | read ${s.promptTokens} tokens in ${s.promptMs}ms` +
        `${s.loadMs > 500 ? `, load ${s.loadMs}ms` : ""} | wrote ${s.tokens} tokens at ${(s.tokens / (s.genMs / 1000 || 1)).toFixed(1)}/s`);
      return true;
    } catch (e) {
      if (derailed || e?.derailed) { console.warn(`[local brain] stopped an answer that drifted out of ${langName}`); send({ done: true, source: "local" }); return true; }
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

// The page may only run its own scripts and talk to this server (plus Google Fonts): if a book or an answer ever
// contained HTML, it still could not run code or send a visitor's data anywhere.
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "media-src 'self' blob:", "connect-src 'self'",
    "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

async function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400); return res.end(); }                    // malformed %-escape
  if (urlPath.includes("\0")) { res.writeHead(400); return res.end(); }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    const ext = path.extname(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": TYPES[ext] || "application/octet-stream",
      // the big MediaPipe files never change: let the browser keep them; the app's own files are re-checked
      "Cache-Control": rel.startsWith("vendor/") ? "public, max-age=604800" : "no-cache",
      "Content-Length": s.size,
    });
    if (req.method === "HEAD") return res.end();
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
    // owner-only actions: stop password guessing (8 wrong tries -> 15 minutes locked)
    if (url.pathname.startsWith("/api/library") || url.pathname === "/api/learner/pause" || url.pathname === "/api/learner/resume") {
      const ip = clientIp(req);
      if (ownerLocked(ip)) { req.resume(); return sendJson(res, 429, { error: "Too many wrong passwords. Please wait 15 minutes." }); }
      if (process.env.ADMIN_PASSWORD && !isOwner(req)) noteOwnerFail(ip);
    }
    if (await handleLibrary(req, res, url)) return;
    // searches, summaries and the 📖 window cost real work (and AI credits for summaries): limited per visitor
    if (url.pathname.startsWith("/api/knowledge/") && !allowLight(clientIp(req), url.pathname === "/api/knowledge/summary" ? 30 : 120)) {
      return sendJson(res, 429, { error: "Too many requests. Please rest a few minutes. 🙏" });
    }
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
      const q = (url.searchParams.get("q") || "").slice(0, 300);
      const found = await knowledge.search(q, { book: url.searchParams.get("book") || "" });
      const v = await knowledge.verse(q).catch(() => null);
      if (v && !v.missing) found.results.unshift(v);
      return sendJson(res, 200, found);
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
// No time limit on a request's body, so uploads on slow connections are never cut off; but a client must send its
// headers within 20 s, so nobody can hold hundreds of connections open by sending nothing (a "slowloris" attack).
server.requestTimeout = 0;
server.timeout = 0;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 10_000;
server.maxHeadersCount = 100;
// A bug in one request must never take Krishna Sakha down for everyone: log it and keep serving.
process.on("unhandledRejection", (e) => console.error("[unhandled]", e?.stack || e));
process.on("uncaughtException", (e) => { console.error("[uncaught]", e?.stack || e); if (e?.code === "EADDRINUSE") process.exit(1); });
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already used by another program. Set a different PORT in .env (e.g. PORT=3100) and start again.`);
    process.exit(1);
  }
  throw e;
});
// Only this computer can reach the server by default (the Cloudflare tunnel connects from here too).
// HOST=0.0.0.0 in .env opens it to the local network (phones on the same Wi-Fi).
const HOST = process.env.HOST || "127.0.0.1";
server.listen(PORT, HOST, () => {
  console.log(`🕉  Krishna Sakha is live at http://localhost:${PORT}  (model: ${MODEL}, effort: ${EFFORT}${HOST === "127.0.0.1" ? ", this computer only" : `, host ${HOST}`})`);
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 10) console.warn("⚠  ADMIN_PASSWORD is short; use 10+ characters so it can't be guessed.");
});
