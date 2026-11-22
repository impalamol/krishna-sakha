// KRISHNA SAKHA — build his library from clean sources (no OCR).
// Reads what fetch-sacred-texts.mjs downloaded and the GRETIL Sanskrit files, and writes ONE text file per work
// into library/books/<category>/…, each with:
//   - a header: title, translator/editor, year, language, source address, licence, category, "clean: yes"
//   - a [ref …] line before every hymn / sukta / chapter / section, e.g. "[ref Rigveda 1.1]", so every passage he
//     finds carries its exact place and he can cite it ("Katha Upanishad 2.18", "Mahabharata 6.26") instead of guessing
//   - Sanskrit in Devanagari, with each verse's number after it: "… ॥ 1.1.1 ॥"
// and a catalogue (library/books/CATALOGUE.md + catalogue.json) of everything, with counts.
//
//   node scripts/corpus/build-corpus.mjs            build all that is downloaded
//   node scripts/corpus/build-corpus.mjs Rigveda    only works whose title contains "Rigveda"
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKS } from "./works.mjs";
import { iastToDeva } from "./iast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(ROOT, "..", "corpus-sources");
const LIB = path.join(ROOT, "library", "books");
const only = process.argv[2] || "";

const safeName = (s) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 150);
const decode = (s) => s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// ---------------- English (sacred-texts.com) ----------------
async function buildSacredTexts(w) {
  const file = path.join(SRC, "sacred-texts", `${w.slug}.jsonl`);
  let lines;
  try { lines = (await readFile(file, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return { skipped: "not downloaded yet" }; }
  if (!lines.some((l) => l.done)) return { skipped: "download not finished" };
  const meta = lines.find((l) => l.meta).meta;
  const pages = lines.filter((l) => l.url && l.text && l.text.length > 120);
  const year = meta.year || "";
  const parts = [];
  let refs = 0;
  for (const p of pages) {
    // the place: the page's own title, or its first heading line
    const first = p.text.split("\n").find((l) => l.trim()) || "";
    let ref = (p.title || (first.length <= 90 ? first : "")).replace(/\s+/g, " ").trim();
    if (!ref) ref = `${w.title}, page ${parts.length + 1}`;
    if (!new RegExp(w.title.split(/[ ,(]/)[0], "i").test(ref)) ref = `${w.title}: ${ref}`;
    parts.push(`[ref ${ref.replace(/[\[\]]/g, "")}]\n${p.text.replace(/^\[(page|time|ref) /gm, "($1 ")}`);
    refs++;
  }
  const text = parts.join("\n\n");
  const header = [
    `# title: ${w.title}`, `# author: ${w.translator} (tr.)${year ? `, ${year}` : ""}`, "# language: English",
    `# source: https://sacred-texts.com/book/${w.slug}`, `# licence: public domain (published ${year || "before 1930"})`,
    `# category: ${w.dir}`, "# clean: yes", "",
  ].join("\n");
  const out = path.join(LIB, ...w.dir.split("/"), `${safeName(`${w.title} - ${w.translator}${year ? ` (${year})` : ""}`)}.txt`);
  return { out, body: header + "\n" + text, refs, chars: text.length, lang: "English", credit: `${w.translator}${year ? `, ${year}` : ""}`, source: "sacred-texts.com" };
}

// ---------------- Sanskrit (GRETIL) ----------------
// a verse reference at the START of a line: "06,001.001a", "1.001.001a", "BhP_01.01.001/3", "(AVŚ_1,2.3a)"
const REF_START = /^\(?(?:[A-Za-zÀ-ɏḀ-ỿŚśĀā]{1,10}_)?(\d{1,3}(?:[,.]\d{1,4}){1,4})(\*[\d_]+)?[a-h]?(?:\/\d+)?(?:\{[^}\s]{0,6}\})?\)?:?\s+/;
// a verse number alone on its own line ("1.27"), after the verse it closes
const REF_ALONE = /^\(?(?:[A-Za-zÀ-ɏḀ-ỿŚśĀā]{1,10}_)?(\d{1,3}(?:[,.]\d{1,4}){1,3})\)?\s*(?:\/\/|\|\|)?$/;
// ...or at the END: "… || RV_1,001.01", "… // KaU_1.8 //", "… sañjaya  1.1"
// (also "// ŚivP_1,1.7ab/", "//AP_3.009cd/", "|| IsUp_1 ||", "// 1 //"; a single number counts only with a text
// abbreviation or with danda marks on both sides, so a stray "(3)" in the text is not taken for a verse number)
const REF_END = /(?<lead>^|\s|\/\/?|\|\|?)\s*\(?(?<abbr>[A-Za-zÀ-ɏḀ-ỿŚśĀā]{1,10}_)?(?<num>\d{1,4}(?:[,.]\d{1,4}){0,3})[a-h]{0,2}\)?\s*(?<trail>\/\/|\|\||\||\/)?\s*$/;
const endRef = (t) => {
  const m = t.match(REF_END);
  if (!m) return null;
  const { lead, abbr, num, trail } = m.groups;
  const multi = /[,.]/.test(num);
  if (!multi && !abbr && !(/[\/|]/.test(lead) && trail)) return null;
  if (!multi && !abbr && m.index === 0) return null;      // a bare "// 12 //" line on its own is a heading
  return { m, num };
};
const nums = (ref) => ref.split(/[,.]/).map((n) => Number(n));
// GRETIL spellings that are not letters: "atha.ataḥ" (dots between words in sutras), "haṭha+ +yoga" (compound marks),
// "!!" / "!" for the dandas (Gheranda Samhita)
const tidyLine = (t) => t.replace(/(?<=\p{L})\.(?=\p{L})/gu, " ").replace(/\+\s*\+/g, "").replace(/\+/g, "").replace(/!!/g, "//").replace(/!/g, "/").replace(/\s*&\s*$/, " /");

function gretilBody(html) {
  // tags are removed within one line only: a stray "<" in the text must not swallow pages up to the next ">"
  const lines = decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|tr)>/gi, "\n").replace(/<[^>\n]{0,400}>/g, "")).split(/\r?\n/);
  // the header (title, credits, the table of letters) ends at the last "gretil.htm" / "gretdias.pdf" line near the top
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 400); i++) if (/gretil\.htm\s*$|gretdias\.pdf\s*$/.test(lines[i].trim())) start = i + 1;
  const head = lines.slice(0, start).join("\n");
  const credit = [...head.matchAll(/(?:Data entry|Input by|Entered by|Contribution|Edited by|Based on the edition|Source)[^:\n]*:\s*([^\n]+)/gi)].map((m) => m[0].trim()).slice(0, 4).join("; ");
  return { lines: lines.slice(start), credit };
}

function parseGretil(lines, w) {
  const groups = new Map(); // chapter key -> verses [{n, text}]
  const add = (g, n, text) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push({ n, text }); };
  let buf = [], curStart = null, pageGroup = null, sbVerse = null;
  const flushStart = () => { if (curStart && buf.length) add(curStart.g, curStart.n, buf.join("\n")); buf = []; };
  for (let raw of lines) {
    const line = raw.replace(/ /g, " ").replace(/\s+$/, "");
    // GRETIL's own notes are not Sanskrit: "% Chapter {165}" comment lines, "{165}" chapter tags, "(1)" footnote marks
    if (/^\s*%/.test(line)) continue;
    const t = tidyLine(line.trim()).replace(/\{[^}\n]{0,12}\}/g, " ").replace(/\((?:[A-Za-zŚśĀā]{1,8}_)[\d,.]+[a-z]{0,2}\)\s*/g, " ").replace(/\((\d{1,3}|[a-z])\)/g, "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (w.format === "pages") {                          // Maitrayani Samhita: [Page I,1] blocks
      const m = t.match(/^\[Page ([^\]]+)\]/);
      if (m) { pageGroup = m[1].replace(/\s+/g, ""); continue; }
      if (pageGroup) add(pageGroup, null, t);
      continue;
    }
    if (w.format === "shatapatha") {                     // "1.1.1.[7]" starts a paragraph of kanda.adhyaya.brahmana
      const m = t.match(/^(\d+)\.(\d+)\.(\d+)\.\[(\d+)\]$/);
      if (m) { if (sbVerse && buf.length) add(sbVerse.g, sbVerse.n, buf.join(" ")); buf = []; sbVerse = { g: `${m[1]}.${m[2]}.${m[3]}`, n: `${m[1]}.${m[2]}.${m[3]}.${m[4]}` }; continue; }
      if (sbVerse) buf.push(t);
      continue;
    }
    if (w.format === "samaveda") {                       // "1 1 1 0105c  text .. 5"
      const m = t.match(/^(\d+) (\d+) (\d+) (\d{4})[a-f]\s+(.*)$/);
      if (m) {
        const g = `${m[1]}.${m[2]}.${m[3]}`, n = `${g}.${Number(m[4])}`;
        if (!curStart || curStart.n !== n) { flushStart(); curStart = { g, n }; }
        buf.push(m[5].replace(/\.\.\s*\d+\s*$/, "॥").replace(/\s\.\s*$/, " ।"));
      }
      continue;
    }
    const s = t.match(REF_START);
    if (s) {
      if (s[2]) { continue; }                            // "*" = a passage the critical edition rejects (interpolation)
      const parts = nums(s[1]);
      const depth = w.depth ?? parts.length - 1;
      // the verse is chapter + one number; deeper numbers (half-verse lines "RV 1.1.4.1", ".2") join that verse
      const g = parts.slice(0, depth).join("."), n = parts.slice(0, depth + 1).join(".");
      if (!curStart || curStart.n !== n) { flushStart(); curStart = { g, n }; }
      buf.push(t.slice(s[0].length));
      continue;
    }
    const alone = t.match(REF_ALONE);
    if (alone && !curStart) {
      const parts = nums(alone[1]);
      const depth = w.depth ?? parts.length - 1;
      if (buf.length) add(parts.slice(0, depth).join(".") || "1", parts.join("."), buf.join("\n"));
      buf = [];
      continue;
    }
    const er = endRef(t);
    if (er) {
      const parts = nums(er.num);
      const depth = w.depth ?? parts.length - 1;
      buf.push(t.slice(0, er.m.index).trim());
      add(parts.slice(0, depth).join(".") || "1", parts.join("."), buf.join("\n"));
      buf = []; curStart = null;
      continue;
    }
    buf.push(t);                                         // a line inside a verse whose number comes later (or a heading)
  }
  if (w.format === "shatapatha" && sbVerse && buf.length) add(sbVerse.g, sbVerse.n, buf.join(" "));
  else flushStart();
  return groups;
}

async function buildGretil(w) {
  const all = new Map();
  const credits = new Set();
  for (const f of w.files) {
    let html;
    try { html = await readFile(path.join(SRC, "gretil", "1_sanskr", ...f.split("/")), "utf8"); } catch { console.warn(`  missing ${f}`); continue; }
    const { lines, credit } = gretilBody(html);
    if (credit) credits.add(credit);
    for (const [g, verses] of parseGretil(lines, w)) {
      if (!all.has(g)) all.set(g, []);
      all.get(g).push(...verses);
    }
  }
  if (!all.size) return { skipped: "no text found" };
  const parts = [];
  let verses = 0;
  for (const [g, vs] of all) {
    const body = vs.map((v) => {
      const deva = iastToDeva(v.text).replace(/\s*[।॥]+\s*$/, "").replace(/[ \t]+/g, " ").trim();
      verses++;
      return v.n ? `${deva} ॥ ${v.n} ॥` : deva;
    }).join("\n");
    parts.push(`[ref ${w.label} ${g}]\n${body}`);
  }
  const text = parts.join("\n\n");
  const header = [
    `# title: ${w.title} (Sanskrit)`, `# author: Sanskrit original (GRETIL e-text${credits.size ? `; ${[...credits][0].slice(0, 160)}` : ""})`, "# language: Sanskrit (Devanagari)",
    `# source: https://gretil.sub.uni-goettingen.de/ (${w.files[0]}${w.files.length > 1 ? ` + ${w.files.length - 1} more` : ""})`,
    "# licence: GRETIL e-text, CC BY-NC-SA 4.0 (non-commercial use with credit); the Sanskrit original itself is public domain",
    `# category: ${w.dir}`, "# clean: yes", "",
  ].join("\n");
  const out = path.join(LIB, ...w.dir.split("/"), `${safeName(`${w.title} (Sanskrit, GRETIL)`)}.txt`);
  return { out, body: header + "\n" + text, refs: all.size, verses, chars: text.length, lang: "Sanskrit", credit: "GRETIL", source: "GRETIL" };
}

// ---------------- build ----------------
const catalogue = [];
for (const w of WORKS) {
  const name = w.title;
  if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
  const r = w.source === "gretil" ? await buildGretil(w) : await buildSacredTexts(w);
  if (r.skipped) { console.log(`·  ${name} [${w.source}]: ${r.skipped}`); catalogue.push({ title: name, dir: w.dir, source: w.source, status: r.skipped, study: w.study }); continue; }
  await mkdir(path.dirname(r.out), { recursive: true });
  // write only if changed, so the reader does not re-read unchanged books
  let old = null; try { old = await readFile(r.out, "utf8"); } catch {}
  if (old !== r.body) await writeFile(r.out, r.body);
  console.log(`✓  ${name} [${r.lang}]: ${r.refs} sections${r.verses ? `, ${r.verses} verses` : ""}, ${(r.chars / 1e6).toFixed(2)} M chars`);
  catalogue.push({ title: name, dir: w.dir, language: r.lang, credit: r.credit, source: r.source, sections: r.refs, verses: r.verses || null,
    chars: r.chars, file: path.relative(LIB, r.out).replace(/\\/g, "/"), study: w.study, status: "ready" });
}
if (!only) {
  await writeFile(path.join(LIB, "..", "catalogue.json"), JSON.stringify(catalogue, null, 1));
  const byTop = {};
  for (const c of catalogue) (byTop[c.dir.split("/")[0]] ||= []).push(c);
  const md = ["# Krishna Sakha — library catalogue", "", "Clean texts only (no OCR). English: public-domain translations from sacred-texts.com. Sanskrit: GRETIL e-texts in Devanagari.", ""];
  for (const [top, list] of Object.entries(byTop)) {
    md.push(`## ${top}`, "", "| Work | Language | Translator / source | Sections | Status |", "|---|---|---|---|---|");
    for (const c of list) md.push(`| ${c.title} | ${c.language || ""} | ${c.credit || c.source} | ${c.sections ?? ""} | ${c.status} |`);
    md.push("");
  }
  await writeFile(path.join(LIB, "..", "CATALOGUE.md"), md.join("\n"));
  console.log(`\ncatalogue: ${catalogue.filter((c) => c.status === "ready").length} ready, ${catalogue.filter((c) => c.status !== "ready").length} waiting`);
}
