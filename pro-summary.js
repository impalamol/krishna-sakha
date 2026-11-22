// KRISHNA SAKHA — "Pro" book summaries with the AI model (used only when the AI is switched on).
// He studies the WHOLE book: the fast model (Claude Haiku 5.5) reads it part by part and takes
// study notes; then the main model writes a professional summary in the visitor's language.
// The result is cached per book + language, so each book is paid for only once.
// If anything fails (no credits, outage…) the caller falls back to the offline summary.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const LANG_NAMES = {
  en: "English", hi: "Hindi", mr: "Marathi", sa: "Sanskrit with a simple Hindi explanation", hinglish: "Hinglish (Hindi in Roman letters)",
  bn: "Bengali", ta: "Tamil", te: "Telugu", kn: "Kannada", ml: "Malayalam", gu: "Gujarati", pa: "Punjabi", ur: "Urdu",
};

export function createProSummary({ client, knowledge, learner, rootDir, model, fastModel = "claude-haiku-5-5", systemPrompt }) {
  const CACHE = path.join(rootDir, "library", ".knowledge", "pro-summaries");

  async function parts(id) {
    const raw = (await readFile(path.join(learner.knowledgeDir, `${id}.txt`), "utf8")).replace(/^#.*\n/gm, "");
    // split on page markers so every part keeps its page numbers; ~45k characters per part, at most 30 parts
    const pages = raw.split(/(?=\[page \d+\])/);
    const target = Math.max(45_000, Math.ceil(raw.length / 30));
    const out = [];
    let cur = "";
    for (const p of pages) {
      if (cur.length + p.length > target && cur) { out.push(cur); cur = ""; }
      cur += p;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
    }));
    return results;
  }

  const textOf = (msg) => msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

  /** Streams a professional summary through emit(markdown). Throws if the AI is unavailable. */
  async function run(bookId, lang, emit, { onBusy = () => {} } = {}) {
    const book = knowledge.books().find((b) => b.id === bookId);
    if (!book || !book.searchable) return false;
    const language = LANG_NAMES[lang] || "English";
    const file = path.join(learner.knowledgeDir, `${bookId}.txt`);
    const version = (await stat(file)).mtimeMs;
    const key = createHash("sha1").update(`${bookId}|${version}|${lang}|v1`).digest("hex");
    const cached = path.join(CACHE, `${key}.md`);
    try { const md = await readFile(cached, "utf8"); emit(md); return true; } catch { /* not cached yet */ }

    // 1) study notes on every part of the book (fast model, 4 parts at a time)
    const chunks = await parts(bookId);
    const notes = await mapLimit(chunks, 4, async (text, i) => {
      onBusy();
      const msg = await client.messages.create({
        model: fastModel,
        max_tokens: 3000,
        output_config: { effort: "low" },
        messages: [{
          role: "user",
          content:
            `You are taking study notes on part ${i + 1} of ${chunks.length} of the book "${book.title}". ` +
            `The text may contain OCR errors; read through them sensibly and never invent content. ` +
            `Write compact notes in English: main teachings and arguments, practices or rituals (with steps), stories, ` +
            `important Sanskrit/Hindi terms with their meaning, and any mantras or verses quoted. Give page numbers from the [page N] markers.\n\n` +
            `<book_part>\n${text}\n</book_part>`,
        }],
      });
      return msg.stop_reason === "refusal" ? "" : textOf(msg);
    });

    // 2) the summary itself, written by the main model in the visitor's language, streamed
    onBusy();
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 8000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content:
          `Using the study notes below, write a professional summary of the book "${book.title}" (${book.pages} pages${book.via === "ocr" ? ", read by OCR" : ""}) ` +
          `entirely in ${language}. Use these Markdown sections: a heading with the book's name; **Overview** (2–3 short paragraphs: what the book is, ` +
          `its tradition and purpose); **Key teachings** (5–8 bullets with page references); **Practices described** (if any, with brief steps); ` +
          `**Important terms** (Sanskrit/Hindi terms with simple meanings); **Who it is for**. Be faithful to the book; where the text was unclear, say so briefly. ` +
          `Write for listening too: short, clear sentences.\n\n` +
          notes.map((n, i) => `<notes part="${i + 1}">\n${n}\n</notes>`).join("\n"),
      }],
    });
    let md = "";
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { md += ev.delta.text; emit(ev.delta.text); }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal" || !md.trim()) throw new Error("summary refused or empty");
    await mkdir(CACHE, { recursive: true });
    await writeFile(cached, md);
    return true;
  }

  /** A Pro summary saved earlier (works even with the AI switched off or no key). */
  async function cached(bookId, lang) {
    try {
      const version = (await stat(path.join(learner.knowledgeDir, `${bookId}.txt`))).mtimeMs;
      const key = createHash("sha1").update(`${bookId}|${version}|${lang}|v1`).digest("hex");
      return await readFile(path.join(CACHE, `${key}.md`), "utf8");
    } catch { return null; }
  }

  return { run, cached };
}
