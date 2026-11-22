// KRISHNA SAKHA — clean English scriptures from the Internet Sacred Text Archive (sacred-texts.com).
// All are public-domain translations (published 1930 or earlier; checked from each book's own metadata).
//
// For each book: read its metadata, start at its first page and follow the "next page" links to the end, one page at
// a time with a pause (polite crawling, as the site's robots.txt allows). Pages are kept in
// ../corpus-sources/sacred-texts/<book>.jsonl, so an interrupted run resumes where it stopped and nothing is
// downloaded twice. Then build-corpus.mjs turns them into library files with exact references.
//
//   node scripts/corpus/fetch-sacred-texts.mjs            all books
//   node scripts/corpus/fetch-sacred-texts.mjs the-rig-veda   one book
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WORKS } from "./works.mjs";
const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.resolve(ROOT, "..", "corpus-sources", "sacred-texts");
const SITE = "https://sacred-texts.com";
const UA = "Mozilla/5.0 (compatible; scripture-study-bot/1.0; personal non-commercial study)";
const DELAY_MS = 2500;   // the site answers "429 Too Many Requests" when asked faster (measured); one worker only

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastFetch = 0;
async function get(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const wait = lastFetch + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    try {
      // through curl: the site's firewall refuses Node's own HTTP client (by its connection fingerprint), while
      // robots.txt welcomes crawlers; we still say honestly who we are (User-Agent) and keep the slow pace
      const { stdout } = await run("curl", ["-sL", "--compressed", "--max-time", "60", "-A", UA, "-w", "\n%{http_code}", url], { maxBuffer: 64 * 1024 * 1024 });
      const cut = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(cut + 1)), body = stdout.slice(0, cut);
      if (status === 429 || status >= 500 || status === 0) throw new Error(`HTTP ${status}`);
      if (status !== 200) return null;
      return body;
    } catch (e) {
      // asked to slow down (429) or a server hiccup: wait a long time, longer each time (1.5, 3, 4.5 … minutes)
      const wait = /429/.test(e.message) ? 90_000 * (i + 1) : 10_000 * (i + 1);
      console.warn(`  ${e.message} on ${url.split("/").pop()}: waiting ${Math.round(wait / 1000)} s (try ${i + 1}/${tries})`);
      await sleep(wait);
    }
  }
  throw new Error(`could not fetch ${url}`);
}

const decode = (s) => s
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// the page's own text: the reader block, without the site's navigation, ads and footnote links
function pageText(html) {
  const i = html.indexOf('data-slot="reader-prose"');
  if (i < 0) return "";
  const j = html.indexOf("</article>", i);
  let h = html.slice(html.indexOf(">", i) + 1, j < 0 ? undefined : j);
  h = h.replace(/<(script|style|nav|aside|button|figure)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h1[^>]*class="sr-only[\s\S]*?<\/h1>/i, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li|tr|blockquote|table)>/gi, "\n\n")
    .replace(/<h(\d)[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decode(h).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const titleOf = (html) => decode((html.match(/<h1 class="sr-only[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const nextOf = (html) => {
  const m = html.match(/<link rel="next" href="([^"]+)"/);
  return m ? m[1].replace(/^https?:\/\/sacred-texts\.com(:\d+)?/, SITE) : null;
};

async function bookMeta(slug) {
  const html = await get(`${SITE}/book/${slug}`);
  if (!html) return null;
  const graph = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
  const flat = JSON.stringify(graph);
  const year = Number((flat.match(/"datePublished":"(\d{4})/) || [])[1]) || null;
  const authors = [...flat.matchAll(/"@type":"Person","name":"([^"]+)"|"name":"([^"]+)","@type":"Person"/g)].map((m) => m[1] || m[2]);
  // the first page of the text: the first chapter link of this book in its contents
  const first = (html.match(new RegExp(`href="(/book/${slug}/[^"#?]+)"`)) || [])[1];
  return { slug, year, authors: [...new Set(authors)], first: first ? SITE + first : null };
}

async function fetchBook(w) {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `${w.slug}.jsonl`);
  let lines = [];
  try { lines = (await readFile(file, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch {}
  let meta = lines.find((l) => l.meta)?.meta;
  if (!meta) {
    meta = await bookMeta(w.slug);
    if (!meta || !meta.first) { console.warn(`✗ ${w.slug}: book page or first chapter not found`); return; }
    if (meta.year && meta.year > 1930 && !w.allowYear) { console.warn(`✗ ${w.slug}: published ${meta.year}, may still be under copyright; skipped`); return; }
    await appendFile(file, JSON.stringify({ meta }) + "\n");
  }
  const pages = lines.filter((l) => l.url);
  if (lines.some((l) => l.done)) { console.log(`✓ ${w.slug}: already complete (${pages.length} pages)`); return; }
  let url = pages.length ? pages[pages.length - 1].next : meta.first;
  const seen = new Set(pages.map((p) => p.url));
  let n = pages.length;
  console.log(`→ ${w.slug} (${meta.year || "?"}, ${meta.authors.join(", ") || "?"}) from page ${n + 1}`);
  while (url && url.startsWith(`${SITE}/book/${w.slug}/`) && !seen.has(url)) {
    const html = await get(url);
    if (!html) { console.warn(`  missing page ${url}`); break; }
    const next = nextOf(html);
    const rec = { url, title: titleOf(html), text: pageText(html), next };
    await appendFile(file, JSON.stringify(rec) + "\n");
    seen.add(url); n++;
    if (n % 50 === 0) console.log(`  ${w.slug}: ${n} pages`);
    url = next;
  }
  await appendFile(file, JSON.stringify({ done: true, pages: n, at: new Date().toISOString() }) + "\n");
  console.log(`✓ ${w.slug}: ${n} pages`);
  // put it in his library right away (he starts reading it within a minute)
  // (a full build: unchanged files are not rewritten, and the catalogue with study priorities stays complete)
  try { await run("node", [path.join(ROOT, "scripts", "corpus", "build-corpus.mjs")], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }); } catch (e) { console.warn(`  build: ${e.message}`); }
}

// "--worker 2/3": this process takes every third book (several workers share the books, never the same one)
const args = process.argv.slice(2);
const wk = args.indexOf("--worker") >= 0 ? args[args.indexOf("--worker") + 1].split("/").map(Number) : null;
const only = args.find((a) => !a.startsWith("--") && !/^\d+\/\d+$/.test(a));
const list = WORKS.filter((w) => w.source === "sacred-texts" && (!only || w.slug === only))
  .filter((w, i) => !wk || i % wk[1] === wk[0] - 1)
  .sort((a, b) => (a.study ?? 9) - (b.study ?? 9));   // the most important texts first (Gita, Upanishads, Yoga Sutras)
for (const w of list) {
  try { await fetchBook(w); } catch (e) { console.error(`✗ ${w.slug}: ${e.message}`); }
}
console.log("finished");
