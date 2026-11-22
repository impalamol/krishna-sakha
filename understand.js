// KRISHNA SAKHA — UNDERSTANDING what he has read (not just storing the words).
//
// After a book or talk is read, he studies it in two steps, like a student with a teacher's guidance:
//   1. Close reading (Claude Haiku 5.5): each part of the text is read carefully and its ideas are written down
//      in plain words: teachings and WHY they are taught, concepts and their meaning in this text, practices,
//      stories and their lessons, key verses and what they mean.
//   2. Reflection (main model): the notes from the whole text become one understanding of it: its essence,
//      how its ideas connect, what is often misunderstood, and the questions a seeker would ask, answered
//      from the text.
// The result is saved in library/.knowledge/understanding/ and is kept for good, so it keeps working when the
// AI is switched off: offline answers then explain ideas instead of quoting raw pages. Concepts found in
// several books are joined in concepts.json, so he can compare what different texts say about one idea.
//
// Runs in the background with Claude when the AI is on, otherwise with the free LOCAL BRAIN (Ollama, local-brain.js),
// so he keeps studying by himself even with no API credits. It pauses while someone is talking to him, resumes where
// it stopped, and studies each text only once (again only if the text changes). With UNDERSTAND_UPGRADE=true, texts
// studied by the local brain are studied again by Claude once everything else is done and the AI is on.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import path from "node:path";

const VERSION = 1;
const PART_CHARS = 40_000;   // about 10–20k tokens per part
const MAX_PARTS = 40;        // very long books get larger parts instead of more calls
// the local brain has a small context window: smaller parts, more of them
const LOCAL_PART_CHARS = 6_000;
const LOCAL_MAX_PARTS = 400;
const LOCAL_NOTES_BUDGET = 12_000;   // characters of notes the local model reflects on at once (fits its 8k context)
// rest between parts so the GPU cools down: a hot laptop GPU slows itself 4x, which makes conversations slow
const LOCAL_REST_MS = (Number(process.env.LOCAL_STUDY_REST) || 20) * 1000;

class EngineChange extends Error {}   // the chosen brain went away (or a visitor arrived): try again later

const pagesField = { type: "string", description: "page numbers from [page N] markers, or times from [time m:ss] markers, e.g. '12-14'; empty if unknown" };
const NOTES_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "what this part says and does, in 3-6 sentences" },
    teachings: { type: "array", items: { type: "object", properties: {
      idea: { type: "string" }, explanation: { type: "string", description: "what it means and why the text teaches it" }, pages: pagesField,
    }, required: ["idea", "explanation", "pages"], additionalProperties: false } },
    concepts: { type: "array", items: { type: "object", properties: {
      term: { type: "string", description: "the term as written (Sanskrit/Hindi in Roman letters, with Devanagari if present)" },
      meaning: { type: "string", description: "its meaning as used in THIS text" }, pages: pagesField,
    }, required: ["term", "meaning", "pages"], additionalProperties: false } },
    practices: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, purpose: { type: "string" }, steps: { type: "string" }, pages: pagesField,
    }, required: ["name", "purpose", "steps", "pages"], additionalProperties: false } },
    stories: { type: "array", items: { type: "object", properties: {
      title: { type: "string" }, lesson: { type: "string" }, pages: pagesField,
    }, required: ["title", "lesson", "pages"], additionalProperties: false } },
    verses: { type: "array", items: { type: "object", properties: {
      text: { type: "string", description: "the verse or key line, short" }, meaning: { type: "string" }, pages: pagesField,
    }, required: ["text", "meaning", "pages"], additionalProperties: false } },
  },
  required: ["summary", "teachings", "concepts", "practices", "stories", "verses"],
  additionalProperties: false,
};

const UNDERSTANDING_SCHEMA = {
  type: "object",
  properties: {
    essence: { type: "string", description: "what this text is and its central vision, one rich paragraph" },
    structure: { type: "string", description: "how the text is organised and how its argument or story develops" },
    core_teachings: { type: "array", items: { type: "object", properties: {
      teaching: { type: "string" }, explanation: { type: "string" },
      why_it_matters: { type: "string", description: "its purpose in the text and its meaning for a seeker's life" }, pages: pagesField,
    }, required: ["teaching", "explanation", "why_it_matters", "pages"], additionalProperties: false } },
    key_concepts: { type: "array", items: { type: "object", properties: {
      term: { type: "string" }, meaning: { type: "string" },
      in_this_text: { type: "string", description: "how this text uses or develops the concept" },
    }, required: ["term", "meaning", "in_this_text"], additionalProperties: false } },
    how_ideas_connect: { type: "string", description: "how the main ideas depend on and lead to each other" },
    practices: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, purpose: { type: "string" }, steps: { type: "string" }, pages: pagesField,
    }, required: ["name", "purpose", "steps", "pages"], additionalProperties: false } },
    stories: { type: "array", items: { type: "object", properties: {
      title: { type: "string" }, lesson: { type: "string" }, pages: pagesField,
    }, required: ["title", "lesson", "pages"], additionalProperties: false } },
    misunderstandings: { type: "array", items: { type: "object", properties: {
      common_view: { type: "string" }, what_the_text_actually_says: { type: "string" },
    }, required: ["common_view", "what_the_text_actually_says"], additionalProperties: false } },
    questions: { type: "array", description: "10-15 questions a seeker might ask about this text, answered from it",
      items: { type: "object", properties: {
        question: { type: "string" }, answer: { type: "string", description: "a clear, complete answer of 3-6 sentences" }, pages: pagesField,
      }, required: ["question", "answer", "pages"], additionalProperties: false } },
    related_texts: { type: "array", items: { type: "string" }, description: "other scriptures this text relates to, and how" },
    reading_quality: { type: "string", description: "note if the source text was garbled (OCR / speech-to-text errors) and how far that limits this understanding" },
  },
  required: ["essence", "structure", "core_teachings", "key_concepts", "how_ideas_connect", "practices", "stories",
    "misunderstandings", "questions", "related_texts", "reading_quality"],
  additionalProperties: false,
};

export function createUnderstanding({ client, knowledge, learner, rootDir, model, fastModel = "claude-haiku-5-5", aiEnabled, noteAiError, local = null }) {
  const DIR = path.join(rootDir, "library", ".knowledge", "understanding");
  const INDEX = path.join(DIR, "index.json");
  const CONCEPTS = path.join(DIR, "concepts.json");
  let index = null;                 // id -> { file, version, title, at, parts }
  let items = null;                 // searchable entries built from every understanding
  let running = false, timer = null;
  const now = { state: "idle", id: null, title: null, part: 0, parts: 0, note: "", engine: null };
  const upgrade = process.env.UNDERSTAND_UPGRADE === "true";
  // which brain studies right now: Claude when it is on, else the local brain (Ollama), else none
  const engineNow = () => (aiEnabled() ? "claude" : local?.available() ? "local" : null);

  const fileFor = (id) => path.join(DIR, createHash("sha1").update(id).digest("hex").slice(0, 20) + ".json");
  const textOf = (msg) => msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loadIndex() {
    if (index) return index;
    try { index = JSON.parse(await readFile(INDEX, "utf8")); } catch { index = {}; }
    return index;
  }
  async function saveJson(file, data) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(data, null, 1));
    await rename(tmp, file);
  }

  async function versionOf(id) {
    try { return Math.round((await stat(path.join(learner.knowledgeDir, `${id}.txt`))).mtimeMs); } catch { return 0; }
  }

  // texts that are read (searchable) but not yet understood, scriptures first, then smallest first
  async function nextText() {
    await loadIndex();
    const list = knowledge.books().filter((b) => b.searchable);
    const todo = [];
    for (const b of list) {
      const v = await versionOf(b.id);
      const done = index[b.id];
      const redo = upgrade && aiEnabled() && done?.engine === "local";      // local study, Claude now available
      if (done && done.version === v && done.v === VERSION && !redo) continue;
      if (done?.failedVersion === v && !redo) continue;
      todo.push({ b, v, size: b.chars || b.pages || 0, redo });
    }
    todo.sort((x, y) => (x.redo - y.redo) || (/Online Sources/.test(y.b.id) - /Online Sources/.test(x.b.id)) || (x.size - y.size));
    return todo[0] || null;
  }

  async function parts(id, engine = "claude") {
    const raw = (await readFile(path.join(learner.knowledgeDir, `${id}.txt`), "utf8")).replace(/^#.*\n/gm, "");
    const units = raw.split(/(?=\[(?:page \d+|time [\d:]+)\])/);
    const target = engine === "local"
      ? Math.max(LOCAL_PART_CHARS, Math.ceil(raw.length / LOCAL_MAX_PARTS))
      : Math.max(PART_CHARS, Math.ceil(raw.length / MAX_PARTS));
    const out = []; let cur = "";
    for (const u of units) {
      // a single very long page is cut so it still fits the model
      for (let k = 0; k < u.length; k += target) {
        const piece = u.slice(k, k + target);
        if (cur.length + piece.length > target && cur) { out.push(cur); cur = ""; }
        cur += piece;
      }
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  // wait while a visitor is talking to him, or the owner paused learning, or the AI is off
  // with an engine given, that brain must be available; if it went away but the other one is there: EngineChange
  async function waitTurn(engine = null) {
    for (;;) {
      const e = engineNow();
      const ready = engine ? (engine === "claude" ? aiEnabled() : !!local?.available()) : !!e;
      if (engine && !ready && e) throw new EngineChange(`${engine} unavailable, switching to ${e}`);
      if (!learner.isHeld() && ready) break;
      now.state = !ready ? "waiting-ai" : "paused";
      if (!ready && local) await local.check().catch(() => {});
      await sleep(!ready ? 60_000 : 1_000);
    }
    now.state = "reflecting";
  }

  // a local study call is stopped the moment a visitor starts talking, so the local brain can answer them at once
  async function whileFree(fn) {
    const ctl = new AbortController();
    const t = setInterval(() => { if (learner.isHeld()) ctl.abort(); }, 500);
    try { return await fn(ctl.signal); }
    catch (e) { if (ctl.signal.aborted) throw new EngineChange("paused for a visitor"); throw e; }
    finally { clearInterval(t); }
  }

  const NOTES_PROMPT = (book, text, i, n) =>
    `You are a careful student of Sanatan Dharma studying part ${i + 1} of ${n} of "${book.title}"${book.author ? ` by ${book.author}` : ""}. ` +
    `Read it to UNDERSTAND it, not to copy it: explain each idea in plain English in your own words, say why the text teaches it, ` +
    `and what a term means in this particular text. The text may contain OCR or speech-to-text errors; read through them sensibly. ` +
    `Use only what this part actually says; never invent content. Skip tables of contents, indexes, prefaces about printing, and footnote apparatus ` +
    `unless they carry real teaching. Give page numbers from [page N] markers (or times from [time m:ss] markers).\n\n` +
    `<text_part>\n${text}\n</text_part>`;

  const REFLECT_PROMPT = (book, notesText) =>
    `Below are close-reading notes on every part of "${book.title}"${book.author ? ` by ${book.author}` : ""}` +
    `${book.kind === "media" ? " (a recorded talk, transcribed by speech-to-text)" : ""}, in order from beginning to end.\n\n` +
    `Build a deep, faithful understanding of the whole text, as a learned teacher of Sanatan Dharma would after studying it: ` +
    `its essence; how it is organised; its core teachings with what each means and why it matters; its key concepts as THIS text uses them; ` +
    `how the ideas connect into one view; practices with their purpose and steps; stories and their lessons; ` +
    `common misunderstandings it corrects; and 10-15 questions a seeker might ask about it, each answered clearly from the text. ` +
    `Stay faithful to the text and keep page references. Where the notes show the source was garbled, say so in reading_quality ` +
    `instead of guessing. Write in clear, simple English.\n\n` + notesText;

  // the local model gets compact notes that fit its context: every part is kept, long parts are shortened
  function compactNotes(notes) {
    const one = (nt) => [
      nt.summary,
      ...(nt.teachings || []).map((t) => `Teaching: ${t.idea} - ${t.explanation}${t.pages ? ` (p. ${t.pages})` : ""}`),
      ...(nt.concepts || []).map((c) => `Concept: ${c.term} = ${c.meaning}`),
      ...(nt.practices || []).map((p) => `Practice: ${p.name} - ${p.purpose}. ${p.steps}`),
      ...(nt.stories || []).map((x) => `Story: ${x.title} - ${x.lesson}`),
      ...(nt.verses || []).map((x) => `Verse: ${x.text} - ${x.meaning}`),
    ].filter(Boolean).join("\n");
    const each = Math.floor(LOCAL_NOTES_BUDGET / Math.max(1, notes.length));
    return notes.map((nt, i) => `<notes part="${i + 1}">\n${one(nt || {}).slice(0, Math.max(300, each))}\n</notes>`).join("\n");
  }

  async function closeReading(book, text, i, n, engine) {
    if (engine === "local") {
      // short notes: the local model writes ~30 tokens/s, so each part takes about a minute
      const brief = "\n\nBe concise: at most 5 teachings, 6 concepts, 3 practices, 3 stories and 3 verses; one or two sentences each. Empty lists are fine.";
      return whileFree((signal) => local.json({ prompt: NOTES_PROMPT(book, text, i, n) + brief, schema: NOTES_SCHEMA, signal, maxTokens: 1400 }));
    }
    const msg = await client.messages.create({
      model: fastModel,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: NOTES_SCHEMA } },
      messages: [{ role: "user", content: NOTES_PROMPT(book, text, i, n) }],
    });
    if (msg.stop_reason === "refusal") return null;
    try { return JSON.parse(textOf(msg)); } catch { return null; }
  }

  async function reflect(book, notes, engine) {
    if (engine === "local") {
      for (let tries = 0; tries < 2; tries++) {
        const u = await whileFree((signal) => local.json({ prompt: REFLECT_PROMPT(book, compactNotes(notes)), schema: UNDERSTANDING_SCHEMA, signal, maxTokens: 3500 }));
        if (u && u.essence) return u;
      }
      throw new Error("local reflection gave no usable result");
    }
    const msg = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: UNDERSTANDING_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: REFLECT_PROMPT(book, notes.map((nt, i) => `<notes part="${i + 1}">\n${JSON.stringify(nt)}\n</notes>`).join("\n")) }],
    });
    if (msg.stop_reason === "refusal") throw new Error("reflection refused");
    return JSON.parse(textOf(msg));
  }

  async function studyOne({ b: book, v }, engine) {
    const file = fileFor(book.id);
    const chunks = await parts(book.id, engine);
    // resume: notes already taken for this version of the text, by the same brain, are kept in the file
    let saved = {};
    try { saved = JSON.parse(await readFile(file, "utf8")); } catch {}
    const resumable = (saved.engine || "claude") === engine && (saved.studying || !saved.understanding) && saved.version === v && saved.v === VERSION;
    const notes = resumable && Array.isArray(saved.notes) ? saved.notes : [];
    Object.assign(now, { id: book.id, title: book.title, part: notes.length, parts: chunks.length + 1, note: "", engine });

    for (let i = notes.length; i < chunks.length; i++) {
      await waitTurn(engine);
      now.part = i;
      notes[i] = (await closeReading(book, chunks[i], i, chunks.length, engine)) || { summary: "(this part could not be read)", teachings: [], concepts: [], practices: [], stories: [], verses: [] };
      // the understanding a text already has (e.g. from the local brain) stays usable while it is studied again
      await saveJson(file, { ...(saved.understanding ? { understanding: saved.understanding, engineOfUnderstanding: saved.engine || "claude" } : {}), v: VERSION, id: book.id, title: book.title, version: v, engine, notes, studying: true });
      if (engine === "local") { now.state = "resting"; await sleep(LOCAL_REST_MS); }
    }
    await waitTurn(engine);
    now.part = chunks.length;
    const understanding = await reflect(book, notes, engine);
    const models = engine === "local" ? { notes: local.name, reflection: local.name } : { notes: fastModel, reflection: model };
    await saveJson(file, { v: VERSION, id: book.id, title: book.title, version: v, engine, models, at: new Date().toISOString(), notes, understanding });
    index[book.id] = { v: VERSION, file: path.basename(file), version: v, title: book.title, at: new Date().toISOString(), parts: chunks.length, engine };
    await saveJson(INDEX, index);
    items = null;
    await rebuildConcepts();
    console.log(`[understanding] studied "${book.title}" (${chunks.length} parts, ${engine === "local" ? local.name : "Claude"})`);
  }

  async function loadAll() {
    await loadIndex();
    const out = [];
    for (const [id, e] of Object.entries(index)) {
      if (!e.file) continue;
      try {
        const d = JSON.parse(await readFile(path.join(DIR, e.file), "utf8"));
        if (d.understanding) out.push({ id, title: d.title, u: d.understanding });
      } catch {}
    }
    return out;
  }

  async function rebuildConcepts() {
    const all = await loadAll();
    const map = {};
    for (const { id, title, u } of all) {
      for (const c of u.key_concepts || []) {
        const key = knowledge.fold(c.term).replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{M}\s]/gu, " ").replace(/\s+/g, " ").trim();
        if (!key) continue;
        (map[key] ||= { term: c.term, in: [] }).in.push({ id, title, meaning: c.meaning, in_this_text: c.in_this_text });
      }
    }
    await saveJson(CONCEPTS, map);
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        await waitTurn();
        const engine = engineNow();
        if (!engine) continue;
        const next = await nextText();
        if (!next) { Object.assign(now, { state: "idle", id: null, title: null, part: 0, parts: 0, engine: null }); break; }
        try { await studyOne(next, engine); }
        catch (e) {
          if (e instanceof EngineChange) continue;                 // a visitor arrived, or the brain changed: resume later
          if (engine === "claude") noteAiError?.(e);
          console.error("[understanding]", next.b.title, "-", e?.status ?? "", String(e?.message ?? e).slice(0, 160));
          if (engine === "claude" && !aiEnabled()) continue;       // credits / key problem: the local brain takes over
          if (engine === "local" && !(await local.check().catch(() => false))) continue;   // Ollama stopped: wait for it
          // anything else (e.g. a refusal): skip this version of the text instead of retrying forever
          index[next.b.id] = { ...(index[next.b.id] || {}), failedVersion: next.v, error: String(e?.message ?? e).slice(0, 200) };
          await saveJson(INDEX, index);
          await sleep(5_000);
        }
      }
    } finally { running = false; }
  }

  function trigger(delay = 5_000) { clearTimeout(timer); timer = setTimeout(() => run().catch(() => {}), delay); }

  // ---------- using the understanding ----------
  // Every teaching, concept, practice, story and answered question becomes one searchable entry.
  async function entries() {
    if (items) return items;
    const all = await loadAll();
    items = [];
    for (const { id, title, u } of all) {
      const add = (type, head, body, pages = "") => items.push({ id, title, type, head, body, pages, lower: knowledge.fold(`${head} ${body}`) });
      add("essence", `What "${title}" is about`, `${u.essence} ${u.how_ideas_connect}`);
      for (const q of u.questions || []) add("qa", q.question, q.answer, q.pages);
      for (const t of u.core_teachings || []) add("teaching", t.teaching, `${t.explanation} ${t.why_it_matters}`, t.pages);
      for (const c of u.key_concepts || []) add("concept", c.term, `${c.meaning} ${c.in_this_text}`);
      for (const p of u.practices || []) add("practice", p.name, `${p.purpose} Steps: ${p.steps}`, p.pages);
      for (const s of u.stories || []) add("story", s.title, s.lesson, s.pages);
      for (const m of u.misunderstandings || []) add("misunderstanding", m.common_view, m.what_the_text_actually_says);
    }
    return items;
  }

  /** The best-matching pieces of understanding for a question (works offline). */
  async function relevant(q, { limit = 6, english = "" } = {}) {
    const list = await entries();
    if (!list.length) return [];
    const words = [...new Set([...knowledge.terms(q), ...(english ? knowledge.terms(english) : [])])];
    if (!words.length) return [];
    const df = Object.fromEntries(words.map((w) => [w, list.filter((e) => e.lower.includes(w)).length]));
    const idf = (w) => Math.log(1 + list.length / (1 + df[w]));
    const totalW = words.reduce((s, w) => s + idf(w), 0) || 1;
    const scored = [];
    for (const e of list) {
      let s = 0, cov = 0;
      const head = knowledge.fold(e.head);
      for (const w of words) {
        if (!e.lower.includes(w)) continue;
        cov += idf(w);
        s += idf(w) * (head.includes(w) ? 2.5 : 1);
      }
      if (!s) continue;
      const coverage = cov / totalW;
      if (coverage < 0.5) continue;
      if (e.type === "qa") s *= 1.4;
      scored.push({ ...e, score: s * coverage });
    }
    scored.sort((a, b) => b.score - a.score);
    // at most 3 entries from one text, so other texts can also speak
    const per = {}, out = [];
    for (const e of scored) { if ((per[e.id] = (per[e.id] || 0) + 1) > 3) continue; out.push(e); if (out.length >= limit) break; }
    return out;
  }

  /** The whole understanding of one text, or null. */
  async function of(id) {
    await loadIndex();
    const e = index[id];
    if (!e?.file) return null;
    try { return JSON.parse(await readFile(path.join(DIR, e.file), "utf8")).understanding || null; } catch { return null; }
  }

  async function status() {
    await loadIndex();
    const searchable = knowledge.books().filter((b) => b.searchable).length;
    const understood = Object.values(index).filter((e) => e.file && e.v === VERSION).length;
    const byLocal = Object.values(index).filter((e) => e.file && e.v === VERSION && e.engine === "local").length;
    return { ...now, understood, byLocal, total: searchable };
  }

  return { run, trigger, relevant, of, status };
}
