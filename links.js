// KRISHNA SAKHA — learning from links (library/links.txt, or "Add links" in the 📚 Library).
//  • YouTube video WITH subtitles  -> the subtitles are saved as a timed transcript (no video download)
//                                     in library/media/YouTube/, then read like any talk.
//  • YouTube video WITHOUT subtitles -> listed as "no subtitles"; it can't be learned without the audio.
//  • PDF link                         -> downloaded into library/books/Web/ and read like a book.
//  • Web page                         -> its text is saved into library/books/Web/ and read.
// Progress is kept in library/.knowledge/links.json so every link is processed once.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const safe = (s) => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "untitled";
const clock = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`; };
const youtubeId = (u) => {
  try {
    const url = new URL(u);
    if (/youtu\.be$/.test(url.hostname)) return url.pathname.slice(1, 12);
    if (/youtube\.com$/.test(url.hostname.replace(/^www\.|^m\./, ""))) return url.searchParams.get("v") || (url.pathname.match(/\/(shorts|live|embed)\/([\w-]{11})/) || [])[2] || null;
  } catch {}
  return null;
};
const stripHtml = (h) => h
  .replace(/<(script|style|nav|footer|header|noscript)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr|section|article)>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

export function createLinkLearner(rootDir, { onNewFile = () => {} } = {}) {
  const LIB = path.join(rootDir, "library");
  const LINKS = path.join(LIB, "links.txt");
  const STATE = path.join(LIB, ".knowledge", "links.json");
  let state = null, busy = false;

  async function load() {
    if (state) return;
    try { state = JSON.parse(await readFile(STATE, "utf8")); } catch { state = {}; }
  }
  async function save() {
    await mkdir(path.dirname(STATE), { recursive: true });
    await writeFile(STATE, JSON.stringify(state, null, 1));
  }
  async function readLinks() {
    try { return (await readFile(LINKS, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l)); } catch { return []; }
  }

  async function youtube(url, id) {
    const html = await (await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { "User-Agent": UA, "Accept-Language": "en" } })).text();
    const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s);
    if (!m) return { status: "error", note: "Could not read the YouTube page." };
    const p = JSON.parse(m[1]);
    const v = p.videoDetails || {};
    const info = { title: v.title || id, author: v.author || "", seconds: Number(v.lengthSeconds || 0), kind: "media" };
    const tracks = p.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks.length) {
      return { ...info, status: "no-captions", note: "This video has no subtitles, so it can't be learned from YouTube. If you have the audio, upload it in the 📚 Library and he will listen to it." };
    }
    // prefer human subtitles in Hindi/Sanskrit/English, then automatic ones
    const rank = (t) => (t.kind === "asr" ? 10 : 0) + (["hi", "sa", "en", "mr"].indexOf(t.languageCode) + 1 || 5);
    const track = [...tracks].sort((a, b) => rank(a) - rank(b))[0];
    const json = await (await fetch(`${track.baseUrl}&fmt=json3`, { headers: { "User-Agent": UA } })).json();
    let text = "", lastMark = -60;
    for (const ev of json.events || []) {
      const line = (ev.segs || []).map((s) => s.utf8).join("").replace(/\s+/g, " ").trim();
      if (!line) continue;
      const t = (ev.tStartMs || 0) / 1000;
      if (t - lastMark >= 30) { text += `\n\n[time ${clock(t)}]\n`; lastMark = t; } // a time marker every ~30 s
      text += line + " ";
    }
    if (text.replace(/\[time [\d:]+\]/g, "").trim().length < 200) return { ...info, status: "error", note: "The subtitles were empty." };
    const dir = path.join(LIB, "media", "YouTube");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${safe(info.title)} [${id}].txt`);
    await writeFile(file, [`# title: ${info.title}`, `# author: ${info.author}`, `# source: ${url}`,
      `# subtitles: ${track.name?.simpleText || track.languageCode}${track.kind === "asr" ? " (automatic)" : ""}`, "", text.trim()].join("\n"));
    onNewFile();
    return { ...info, status: "learned-file", file: path.relative(LIB, file).replace(/\\/g, "/"), note: `Subtitles imported (${track.languageCode}${track.kind === "asr" ? ", automatic" : ""}).` };
  }

  async function web(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return { status: "error", note: `The page answered ${r.status}.` };
    const type = r.headers.get("content-type") || "";
    const dir = path.join(LIB, "books", "Web");
    await mkdir(dir, { recursive: true });
    if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(url)) {
      const name = safe(decodeURIComponent(path.basename(new URL(url).pathname)).replace(/\.pdf$/i, "")) + ".pdf";
      await writeFile(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
      onNewFile();
      return { status: "learned-file", kind: "book", title: name, file: `books/Web/${name}`, note: "PDF downloaded." };
    }
    const html = await r.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(url).hostname).replace(/\s+/g, " ").trim();
    const text = stripHtml(html);
    if (text.length < 300) return { status: "error", title, note: "The page had too little text." };
    const name = `${safe(title)}.txt`;
    await writeFile(path.join(dir, name), [`# title: ${title}`, `# author: ${new URL(url).hostname}`, `# source: ${url}`, "", text].join("\n"));
    onNewFile();
    return { status: "learned-file", kind: "book", title, file: `books/Web/${name}`, note: "Web page text saved." };
  }

  /** Process every link that hasn't been handled yet. */
  async function run() {
    if (busy) return;
    busy = true;
    try {
      await load();
      for (const url of await readLinks()) {
        if (state[url] && state[url].status !== "error") continue;
        let res;
        try {
          const id = youtubeId(url);
          res = id ? await youtube(url, id) : await web(url);
        } catch (e) { res = { status: "error", note: String(e?.message || e).slice(0, 160) }; }
        state[url] = { ...res, url, at: new Date().toISOString() };
        await save();
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally { busy = false; }
  }

  /** Links that could not become a file (e.g. YouTube without subtitles), for the 📖 list. */
  function pending() {
    return Object.values(state || {}).filter((s) => s.status !== "learned-file");
  }

  load();
  return { run, pending };
}
