// KRISHNA SAKHA — add public-domain scriptures from the Internet Archive to the library.
// Usage:  node scripts/fetch-online.mjs
// Only texts that are free to use are listed: translations published before 1930 by translators who died
// long ago. Each book's existing OCR text (archive.org "_djvu.txt") is downloaded, its page breaks are
// kept as [page N] markers (so answers can cite pages), and it is saved as a .txt file with its real title.
// The server's reader picks new files up automatically within ~2 minutes.

import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "library", "books", "Online Sources");
const UA = "KrishnaSakha-LibraryFetcher/1.0 (personal study library)";

// [folder, title, translator, year, archive.org identifier]
const SOURCES = [
  ["Bhagavad Gita", "The Bhagavadgita, with the Sanatsugatiya and the Anugita", "K. T. Telang", 1882, "bhagavadgtwi00tela"],
  ["Bhagavad Gita", "The Song Celestial (Bhagavad Gita)", "Edwin Arnold", 1893, "cu31924075056071"],
  ["Ramayana", "The Ramayan of Valmiki (complete)", "Ralph T. H. Griffith", 1874, "thermyanofvlmkit24869gut"],
  ["Puranas", "Vishnu Purana, Vol. 1", "H. H. Wilson", 1864, "TheVishnuPuranaVolI"],
  ["Puranas", "Vishnu Purana, Vol. 2", "H. H. Wilson", 1865, "in.ernet.dli.2015.529052"],
  ["Puranas", "Vishnu Purana, Vol. 3", "H. H. Wilson", 1866, "in.ernet.dli.2015.196043"],
  ["Puranas", "Vishnu Purana, Vol. 4", "H. H. Wilson", 1868, "in.ernet.dli.2015.108565"],
  ["Puranas", "Vishnu Purana, Vol. 5", "H. H. Wilson", 1877, "TheVishnuPuranaASystemOfHinduMythologyAndTraditionVolV"],
  ["Puranas", "Markandeya Purana", "F. Eden Pargiter", 1904, "in.ernet.dli.2015.47519"],
  ["Puranas", "Markandeya Purana, Vol. 2", "F. Eden Pargiter", 1904, "in.ernet.dli.2015.48873"],
  ["Puranas", "Garuda Purana, Vol. 1", "M. N. Dutt", 1908, "in.ernet.dli.2015.33648"],
  ["Puranas", "Garuda Purana, Vol. 2", "M. N. Dutt", 1908, "in.ernet.dli.2015.33649"],
  ["Puranas", "Garuda Purana (Preta Kalpa)", "S. V. Subrahmanyam", 1911, "in.ernet.dli.2015.45762"],
  ["Puranas", "Agni Purana, Vol. 1", "M. N. Dutt", 1903, "in.ernet.dli.2015.279469"],
  ["Puranas", "Agni Purana, Vol. 2", "M. N. Dutt", 1904, "in.ernet.dli.2015.33600"],
  ["Puranas", "Agni Purana, Vol. 3", "M. N. Dutt", 1904, "in.ernet.dli.2015.189132"],
  ["Puranas", "Agni Purana, Vol. 4", "M. N. Dutt", 1904, "in.ernet.dli.2015.33602"],
  ["Puranas", "Matsya Purana, Part 1", "A Taluqdar of Oudh (Sacred Books of the Hindus)", 1916, "in.ernet.dli.2015.45856"],
  ["Puranas", "Matsya Purana, Part 2", "A Taluqdar of Oudh (Sacred Books of the Hindus)", 1917, "in.ernet.dli.2015.45858"],
  ["Puranas", "Skanda Purana: Sahyadri Khanda", "J. Gerson da Cunha", 1877, "india.history.resource.111190"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asJson = false) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.ok) return asJson ? r.json() : r.text();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(2000 * attempt);
  }
  return null;
}

const safe = (s) => s.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();

function clean(raw) {
  // archive.org text: pages are separated by form feeds; keep them as [page N] markers
  const pages = raw.split("\f");
  const body = pages.length > 3
    ? pages.map((p, i) => `[page ${i + 1}]\n${p.trim()}`).join("\n\n")
    : raw;
  return body.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

let added = 0, skipped = 0, failed = 0;
for (const [folder, title, translator, year, id] of SOURCES) {
  const dir = path.join(OUT, folder);
  const file = path.join(dir, `${safe(title)} - ${safe(translator)} (${year}).txt`);
  try { if ((await stat(file)).size > 1000) { skipped++; console.log(`✓ already have  ${title}`); continue; } } catch {}

  const meta = await get(`https://archive.org/metadata/${encodeURIComponent(id)}`, true);
  const txt = meta?.files?.filter((f) => /_djvu\.txt$|\.txt$/i.test(f.name)).sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0];
  if (!txt) { failed++; console.log(`✗ no text found  ${title} (${id})`); continue; }
  const raw = await get(`https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(txt.name)}`);
  if (!raw || raw.length < 5000) { failed++; console.log(`✗ download failed  ${title}`); continue; }

  let text = clean(raw);
  // Project Gutenberg copies: drop the licence header/footer
  text = text.replace(/^[\s\S]*?\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i, "").replace(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG[\s\S]*$/i, "");
  const header = [
    `# title: ${title}`,
    `# author: ${translator} (tr.), ${year}`,
    `# source: https://archive.org/details/${id}`,
    `# licence: public domain (published ${year})`,
    "",
  ].join("\n");
  await mkdir(dir, { recursive: true });
  await writeFile(file, header + "\n" + text);
  added++;
  console.log(`+ added  ${title} — ${translator} (${year})  ${(text.length / 1e6).toFixed(1)} MB`);
  await sleep(1500); // be gentle with archive.org
}
console.log(`\nDone: ${added} added, ${skipped} already present, ${failed} failed.`);
