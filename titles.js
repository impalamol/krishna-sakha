// KRISHNA SAKHA — real book titles, read from inside each book (not the file name).
//
// 1. Look at the first 3 pages: the title is almost always the BIGGEST text on the cover/title page.
//    PDFs with a text layer: font sizes from the PDF. Scanned PDFs: OCR line heights.
// 2. Skip publisher / price / edition lines and anything that looks like OCR gibberish.
// 3. If nothing reliable is found: a cleaned file name ("177676417-Vishwa-Ki-…pdf" -> "Vishwa Ki …").
// 4. When the AI is available, it double-checks the title from the first pages (cheap, fast model).
// Results are saved in library/.knowledge/titles.json.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** "177676417-Vishwa-Ki-Alaokik-Sadhnaien.pdf" -> "Vishwa Ki Alaokik Sadhnaien" */
export function cleanTitle(file) {
  let t = path.basename(String(file)).replace(/%20/g, " ");
  t = t.replace(/(\.(pdf|epub|docx?|txt|md|html?|rtf|djvu|mp3|wav|m4a|aac|ogg|opus|flac|mp4|mkv|webm|mov|avi|srt|vtt))+$/i, "");
  t = t.replace(/^\d{4}\.\d{3,}\.?/, "");             // archive.org ids like "2015.341683."
  t = t.replace(/^(?:[a-z]*\.)?\d{5,}[-_. ]*/i, "");    // long numeric ids like "177676417-"
  t = t.replace(/^(docdownloader\.com_|www\.[^_]+_)/i, "");
  t = t.replace(/\s*\(\d+\)\s*$/, "");                  // "(1)" duplicate-copy suffix
  t = t.replace(/\bHindi\s?Book\b[-_ ]*/gi, "").replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\s*\(?\b(hindi|marathi|english|sanskrit)\)?\s*$/i, "").replace(/\(\s*/g, "(").replace(/\s*\)/g, ")").trim();
  // Capitalise Latin words; leave Devanagari etc. as they are
  t = t.replace(/\b([a-z])([a-z]*)/g, (m, a, b) => a.toUpperCase() + b);
  return t || path.basename(String(file));
}

const SKIP_LINE = /(प्रकाशक|प्रकाशन|मूल्य|संस्करण|मुद्रक|सर्वाधिकार|ISBN|price|publish|press|printed|edition|copyright|rs\.|₹|www\.|\.com|contents|विषय.?सूची|अनुक्रम|भूमिका|preface|introduction|डिजिटल|digiti[sz]ed|library|archive)/i;
const AUTHOR_HINT = /(लेखक|लेखिका|द्वारा|रचित|रचयिता|सम्पादक|संपादक|अनुवादक|by\s|author|edited|compiled|स्वामी|पं\.|पंडित|आचार्य|श्री\s)/i;

function plausible(text, conf = 100) {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length < 3 || s.length > 90 || conf < 62) return false;
  if (SKIP_LINE.test(s)) return false;
  const letters = (s.match(/\p{L}|\p{M}/gu) || []).length;
  if (letters / s.length < 0.7) return false;                                   // mostly numbers / symbols
  if (/[ऀ-ॿ]/.test(s) && /[A-Za-z]/.test(s)) return false;          // OCR junk mix
  if (/(^|\s)[ा-्]/.test(s)) return false;                              // broken Devanagari
  const words = s.split(" ");
  if (words.filter((w) => w.length === 1).length > words.length / 2) return false; // scattered letters
  return true;
}

// ---- matching a printed (often Devanagari) line against the Roman-letter file name ----
const DV = { "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ँ": "n", "ः": "h", "्": "", "़": "",
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ळ": "l" };
// a rough sound-key, so "गायत्री साधना" ~ "Gayatri Sadhana" and "विश्व" ~ "Vishwa"
function soundKey(s) {
  let r = "";
  for (const ch of String(s).normalize("NFC").toLowerCase()) r += DV[ch] ?? ch;
  return r.replace(/w/g, "v").replace(/z/g, "j").replace(/ph/g, "f").replace(/sh/g, "s").replace(/ee|ii/g, "i").replace(/oo|uu/g, "u")
    .replace(/aa/g, "a").replace(/[^a-z]/g, "").replace(/([a-z])\1+/g, "$1").replace(/h/g, "").replace(/[aeiou]/g, (v) => (v === "a" ? "" : v));
}
export function similar(a, b) {
  const x = soundKey(a), y = soundKey(b);
  if (x.length < 3 || y.length < 3) return 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let both = 0;
  for (const [g, n] of gx) both += Math.min(n, gy.get(g) || 0);
  // Dice similarity, both ways: a long sentence that merely contains the same sounds is NOT a match
  if (x.length > y.length * 1.8 || y.length > x.length * 2.5) return 0;
  return (2 * both) / Math.max(1, x.length + y.length - 2);
}
// "Buddhi Badhane Ki Vaigyanik Vidhi Pandit Shriram Sharma Acharya" -> title + author
function splitAuthor(name) {
  const paren = name.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);          // "Mansik Shakti (Swami Sivananda)"
  if (paren && /\b(swami|pandit|pt|sri|shri|acharya|dr|maharshi|sant)\b/i.test(paren[2])) {
    return { title: `${paren[1]} ${paren[3]}`.trim(), author: paren[2].trim() };
  }
  const by = name.match(/^(.*?)\s+by\s+(.+)$/i);
  if (by) return { title: by[1].trim(), author: by[2].trim() };
  const hon = name.match(/^(.*?)\s+((?:Pandit|Pt|Swami|Sri|Shri|Acharya|Dr|Maharshi|Sant)\b.*)$/i);
  if (hon && hon[1].split(" ").length >= 2) return { title: hon[1].trim(), author: hon[2].trim() };
  return { title: name, author: "" };
}
// a file name worth showing: at least two real words, not mostly a code
const meaningful = (t) => t.split(" ").filter((w) => /^[\p{L}]{2,}$/u.test(w)).length >= 2 && !/\d{3,}/.test(t);

export function createTitler({ learner, client = null, aiEnabled = () => false, onAiError = () => {}, fastModel = "claude-haiku-5-5" }) {
  const FILE = path.join(learner.knowledgeDir, "titles.json");
  let titles = null, saveTimer = null, busy = false;

  async function load() {
    if (titles) return;
    try { titles = JSON.parse(await readFile(FILE, "utf8")); } catch { titles = {}; }
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(titles, null, 1)).catch(() => {});
    }, 1000);
  }

  /** Lines of the first pages with their visual size: [{ text, h, page, y, conf }] */
  async function firstPageLines(full, pagesToRead = 3) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(full)), isEvalSupported: false, verbosity: 0 }).promise;
    const out = [];
    let meta = "";
    try { meta = ((await doc.getMetadata())?.info?.Title || "").trim(); } catch {}
    for (let p = 1; p <= Math.min(pagesToRead, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const text = tc.items.map((i) => i.str).join("").replace(/\s/g, "");
      if (text.length > 20) {
        // text layer: group items into lines by their y position; size = font height
        const rows = new Map();
        for (const it of tc.items) {
          if (!it.str.trim()) continue;
          const h = Math.hypot(it.transform[2], it.transform[3]);
          const y = Math.round(it.transform[5] / 3) * 3;
          const row = rows.get(y) || { text: "", h: 0, y };
          row.text += it.str; row.h = Math.max(row.h, h);
          rows.set(y, row);
        }
        for (const r of rows.values()) out.push({ text: r.text.trim(), h: r.h, page: p, y: -r.y, conf: 100 });
      } else {
        // scanned page: render and OCR, using each line's pixel height
        const { createCanvas } = await import("@napi-rs/canvas");
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.max(1, Math.min(3, 1600 / base.width)) });
        const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
        const c2d = canvas.getContext("2d");
        c2d.fillStyle = "#fff"; c2d.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: c2d, viewport: vp }).promise;
        const scale = vp.width / base.width;
        for (const l of await learner.ocrLines(await canvas.encode("png"))) out.push({ ...l, h: l.h / scale, page: p });
      }
      page.cleanup();
    }
    await doc.destroy();
    return { lines: out, meta };
  }

  function pickTitle(lines) {
    const good = lines.filter((l) => plausible(l.text, l.conf));
    if (!good.length) return null;
    const maxH = Math.max(...good.map((l) => l.h));
    const big = good.filter((l) => l.h >= maxH * 0.8).sort((a, b) => a.page - b.page || a.y - b.y);
    // the title: the biggest line, plus a neighbouring line of similar size on the same page (two-line titles)
    const first = big.sort((a, b) => b.h - a.h)[0];
    const parts = [first];
    const sibling = good.filter((l) => l !== first && l.page === first.page && l.h >= first.h * 0.8 && Math.abs(l.y - first.y) < first.h * 2.6)
      .sort((a, b) => Math.abs(a.y - first.y) - Math.abs(b.y - first.y))[0];
    if (sibling) parts.push(sibling);
    parts.sort((a, b) => a.y - b.y);
    const title = parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim();
    // author: a line on the same page that names a writer
    const authorLine = good.find((l) => l.page === first.page && !parts.includes(l) && AUTHOR_HINT.test(l.text) && l.text.length < 60);
    return { title, author: authorLine ? authorLine.text.replace(/\s+/g, " ").trim() : "" };
  }

  async function aiTitle(id, lines, fallback) {
    if (!client || !aiEnabled()) return null;
    const sample = lines.slice(0, 80).map((l) => l.text).join("\n").slice(0, 4000);
    const msg = await client.messages.create({
      model: fastModel,
      max_tokens: 300,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { title: { type: "string" }, author: { type: "string" } },
            required: ["title", "author"],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: "user",
        content: `Here are the first pages of a book (may contain OCR errors) and its file name "${path.basename(id)}". ` +
          `Give the book's real title exactly as printed, in its own script (e.g. Devanagari for Hindi), correcting obvious OCR mistakes, ` +
          `and the author's name ("" if unknown). If the pages are unreadable, derive the title from the file name.\n\n<pages>\n${sample}\n</pages>`,
      }],
    });
    if (msg.stop_reason === "refusal") return null;
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const j = JSON.parse(text);
    return j.title ? { title: j.title.trim(), author: (j.author || "").trim() } : null;
  }

  async function detect(id) {
    const full = path.join(path.dirname(learner.knowledgeDir), id);
    const name = splitAuthor(cleanTitle(id));            // title + author guessed from the file name
    if (!/\.pdf$/i.test(id)) {
      // text files from the online library carry their own "# title:" / "# author:" lines
      try {
        const head = (await readFile(full, "utf8")).slice(0, 600);
        const t = head.match(/^# title:\s*(.+)$/m), a = head.match(/^# author:\s*(.+)$/m);
        if (t) return { title: t[1].trim(), author: a ? a[1].trim() : "", source: "header" };
      } catch { /* fall back to the file name */ }
      return { title: name.title, author: name.author, source: "file-name" };
    }
    let lines = [], meta = "";
    try { ({ lines, meta } = await firstPageLines(full)); } catch { /* unreadable pdf */ }

    // 1) the AI reads the first pages (when credits are available)
    try {
      const ai = await aiTitle(id, lines, name.title);
      if (ai) return { ...ai, source: "ai" };
    } catch (e) { onAiError(e); /* AI unavailable: keep offline result */ }

    // 2) a line printed in the book that matches the file name -> the real title in its own script
    // only lines printed big on their page (titles are large), and readable
    const pageMax = {};
    for (const l of lines) pageMax[l.page] = Math.max(pageMax[l.page] || 0, l.h);
    const cands = lines.filter((l) => plausible(l.text, l.conf) && l.h >= pageMax[l.page] * 0.55);
    // also try two neighbouring lines together (titles often wrap)
    const sorted = [...cands].sort((a, b) => a.page - b.page || a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (a.page === b.page && Math.abs(b.y - a.y) < Math.max(a.h, b.h) * 2.6) cands.push({ ...b, text: `${a.text} ${b.text}`, h: Math.min(a.h, b.h) });
    }
    let best = null;
    for (const c of cands) {
      const score = similar(c.text, name.title);
      if (!best || score > best.score) best = { ...c, score };
    }
    if (best && best.score >= 0.5) {
      return { title: best.text.replace(/\s+/g, " ").replace(/^[|।:;,\-–—\s]+|[|।:;,\-–—\s]+$/gu, "").trim(), author: name.author, source: "cover" };
    }

    // 3) a meaningful file name is always readable
    if (meaningful(name.title)) return { title: name.title, author: name.author, source: "file-name" };

    // 4) file name is a code ("MASL-503"): trust the biggest printed line, or the PDF's own title
    const found = pickTitle(lines);
    if (found) return { ...found, source: "cover" };
    if (meta && plausible(meta) && !/microsoft|untitled|fax|flash|scan|\.(pdf|docx?)$/i.test(meta)) return { title: meta, author: "", source: "metadata" };
    return { title: name.title, author: name.author, source: "file-name" };
  }

  /** Title to show and speak for a book id (never the raw file name). */
  function titleFor(id) {
    const t = (titles && titles[id]?.title) || cleanTitle(id);
    return t.replace(/^[|।:;,\-–—\s]+|[|।:;,\-–—\s]+$/gu, "").trim() || cleanTitle(id);
  }
  function infoFor(id) { return (titles && titles[id]) || null; }

  /** Find titles for every book that doesn't have one yet (one at a time, in the background). */
  async function backfill(ids) {
    await load();
    if (busy) return;
    busy = true;
    try {
      for (const id of ids) {
        const t = titles[id];
        // redo file-name guesses once the AI becomes available
        if (t && !(t.source === "file-name" && aiEnabled())) continue;
        try {
          titles[id] = { ...(await detect(id)), at: new Date().toISOString() };
          saveSoon();
        } catch (e) { console.error("[titles]", id, e.message); }
      }
    } finally { busy = false; }
  }

  load();
  return { titleFor, infoFor, backfill, load };
}
