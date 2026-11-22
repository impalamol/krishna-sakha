// KRISHNA SAKHA — single works added on request, from clean sources (no OCR):
//   • Vijnana Bhairava Tantra — Sanskrit, GRETIL e-text (encoded by Marino Faliero), CC BY-NC-SA 4.0
//   • Satyanarayan Vrat Katha — Sanskrit with the Hindi explanation, Sanskrit Wikisource (CC BY-SA 4.0):
//       Skanda Purana, Reva Khanda, chapters 233–237 (the well-known five-chapter katha), and the
//       Bhavishya Purana version (Pratisarga Parva 3.2.24–29)
// Each becomes a library file with "[ref …]" before every chapter and every verse numbered ("॥ 2.12 ॥"),
// so "Satyanarayan Katha 2.12" or "Vijnana Bhairava 24" is found exactly.
//   node scripts/corpus/fetch-extra.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iastToDeva } from "./iast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(ROOT, "..", "corpus-sources", "extra");
const LIB = path.join(ROOT, "library", "books");
const UA = "Mozilla/5.0 (compatible; scripture-study-bot/1.0; personal non-commercial study)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const latin = (s) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966));

async function cached(name, url) {
  const file = path.join(SRC, name);
  try { return await readFile(file, "utf8"); } catch {}
  await sleep(1500);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const t = await r.text();
  await mkdir(SRC, { recursive: true });
  await writeFile(file, t);
  return t;
}

async function save(dir, name, header, body) {
  const out = path.join(LIB, ...dir.split("/"), name);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, header.join("\n") + "\n\n" + body + "\n");
  console.log(`✓ ${path.relative(LIB, out)} (${(body.length / 1000).toFixed(0)}k chars)`);
}

// ---------------- Vijnana Bhairava Tantra (GRETIL, IAST -> Devanagari) ----------------
async function vijnanaBhairava() {
  const raw = await cached("sa_vijJAnabhairava.txt", "https://gretil.sub.uni-goettingen.de/gretil/corpustei/transformations/plaintext/sa_vijJAnabhairava.txt");
  const text = raw.slice(raw.indexOf("\n# Text") + 7);
  // the three parts of the text: Devi's questions and Bhairava's answer (1–23), the 112 ways of centering (24–138),
  // the closing teaching on true japa, worship and sacrifice (139–163)
  const part = (n) => (n <= 23 ? "1–23: the question and the answer" : n <= 138 ? `24–138: the 112 dharanas (verses ${Math.floor((n - 24) / 10) * 10 + 24}–${Math.min(138, Math.floor((n - 24) / 10) * 10 + 33)})` : "139–163: true japa, worship and sacrifice");
  const groups = new Map();
  let buf = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.replace(/\.(?=[ṅñ])/g, "").trim();          // "ka.ṅthe" -> "kaṅthe" (encoding slip in the source)
    if (!t) continue;
    const m = t.match(/\|\|\s*(\d+)\s*\|\|\s*$/);
    if (!m) { buf.push(t); continue; }
    const n = Number(m[1]);
    buf.push(t.slice(0, m.index));
    const g = part(n);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(`${buf.map((x) => iastToDeva(x).replace(/\s*[।॥]\s*$/, "")).join("\n")} ॥ ${n} ॥`);
    buf = [];
  }
  const body = [...groups].map(([g, vs]) => `[ref Vijnana Bhairava Tantra ${g}]\n${vs.join("\n")}`).join("\n\n");
  await save("tantra/vijnana-bhairava", "Vijnana Bhairava Tantra (Sanskrit, GRETIL).txt", [
    "# title: Vijnana Bhairava Tantra (Sanskrit)", "# author: Sanskrit original (GRETIL e-text, encoded by Marino Faliero, 1998)",
    "# language: Sanskrit (Devanagari)", "# source: https://gretil.sub.uni-goettingen.de/gretil/corpustei/sa_vijJAnabhairava.xml",
    "# licence: GRETIL e-text, CC BY-NC-SA 4.0; the Sanskrit original itself is public domain", "# category: tantra/vijnana-bhairava", "# clean: yes",
  ], body);
}

// ---------------- Satyanarayan Katha (Sanskrit Wikisource) ----------------
const wikitext = (s) => s
  .replace(/<!--[\s\S]*?-->/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "").replace(/<[^>\n]{0,200}>/g, "")
  .replace(/\{\{[^{}]*\}\}/g, "").replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").replace(/'{2,}/g, "").replace(/^[=:*#;]+|=+$/gm, "")
  .replace(/^\s*"/gm, "").replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function satyanarayan() {
  const SK = "स्कन्दपुराणम्/खण्डः ५ (अवन्तीखण्डः)/रेवा खण्डम्/अध्याय:";
  const parts = [];
  for (let ch = 1; ch <= 5; ch++) {
    const adhyaya = 232 + ch;
    const title = SK + "२३" + "३४५६७"[ch - 1];
    const raw = await cached(`satyanarayan-skanda-${adhyaya}.wiki`, "https://sa.wikisource.org/w/index.php?action=raw&title=" + encodeURIComponent(title));
    // every verse number "॥१२॥" becomes "॥ 2.12 ॥" (chapter.verse) so a verse can be asked for exactly
    const text = latin(wikitext(raw)).replace(/[।॥]\s*(\d{1,3})\s*॥/g, (m, n) => ` ॥ ${ch}.${n} ॥\n`).replace(/\n{3,}/g, "\n\n");
    parts.push(`[ref Satyanarayan Katha, Chapter ${ch} (Skanda Purana, Reva Khanda ${adhyaya})]\n${text}`);
  }
  await save("vrata-katha/satyanarayan", "Satyanarayan Vrat Katha - Skanda Purana, Reva Khanda (Sanskrit with Hindi, Wikisource).txt", [
    "# title: Satyanarayan Vrat Katha (Skanda Purana, Reva Khanda 233–237)", "# author: Sanskrit original with Hindi explanation (Sanskrit Wikisource contributors)",
    "# language: Sanskrit and Hindi (Devanagari)", "# source: https://sa.wikisource.org/wiki/" + encodeURIComponent(SK + "२३३") + " (and chapters 234–237)",
    "# licence: text from Wikisource, CC BY-SA 4.0; the Sanskrit original itself is public domain", "# category: vrata-katha/satyanarayan", "# clean: yes",
  ], parts.join("\n\n"));

  const BH = "भविष्यपुराणम् /पर्व ३ (प्रतिसर्गपर्व)/खण्डः २/अध्यायः ";
  const bparts = [];
  for (const [i, n] of ["२४", "२५", "२६", "२७", "२८", "२९"].entries()) {
    const raw = await cached(`satyanarayan-bhavishya-3-2-${24 + i}.wiki`, "https://sa.wikisource.org/w/index.php?action=raw&title=" + encodeURIComponent(BH + n));
    const ch = 24 + i;
    const text = latin(wikitext(raw)).replace(/[।॥]\s*(\d{1,3})\s*॥/g, (m, v) => ` ॥ ${ch}.${v} ॥\n`).replace(/\n{3,}/g, "\n\n");
    bparts.push(`[ref Bhavishya Purana 3.2.${ch} (Satyanarayan Vrat)]\n${text}`);
  }
  await save("vrata-katha/satyanarayan", "Satyanarayan Vrat - Bhavishya Purana, Pratisarga Parva 3.2.24-29 (Sanskrit, Wikisource).txt", [
    "# title: Satyanarayan Vrat in the Bhavishya Purana (Pratisarga Parva 3.2.24–29) (Sanskrit)", "# author: Sanskrit original (Sanskrit Wikisource contributors)",
    "# language: Sanskrit (Devanagari)", "# source: https://sa.wikisource.org/wiki/" + encodeURIComponent(BH + "२४") + " (and chapters 25–29)",
    "# licence: text from Wikisource, CC BY-SA 4.0; the Sanskrit original itself is public domain", "# category: vrata-katha/satyanarayan", "# clean: yes",
  ], bparts.join("\n\n"));
}

await vijnanaBhairava();
await satyanarayan();
