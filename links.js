// KRISHNA SAKHA — learning from links (library/links.txt, or "Add links" in the 📚 Library).
//  • YouTube video WITH subtitles    -> the subtitles are saved as a timed transcript (no video download)
//                                       in library/media/YouTube/, then read like any talk.
//  • YouTube video WITHOUT subtitles -> with yt-dlp installed: its AUDIO is downloaded into library/media/YouTube/
//                                       and he listens to it (Whisper speech-to-text, offline, see learner.js).
//                                       Without yt-dlp: listed as "no subtitles" with how to enable it.
//  • YouTube playlist                -> with yt-dlp: every video in it is learned as above.
//  • Audio / video link (.mp3, .mp4, a podcast file…) -> downloaded into library/media/Web/ and listened to.
//  • PDF link                         -> downloaded into library/books/Web/ and read like a book.
//  • Web page                         -> its text is saved into library/books/Web/ and read.
// Progress is kept in library/.knowledge/links.json so every link is processed once.
//
// yt-dlp (https://github.com/yt-dlp/yt-dlp, free, open source) is used only if it is installed: put yt-dlp.exe in
// tools/yt-dlp/, or install it (winget install yt-dlp), or set YTDLP_PATH in .env. Learn only from videos you are
// allowed to use (your own talks, public teachings shared for learning).

import { readFile, writeFile, mkdir, stat, unlink, rename } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const MEDIA_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|mp4|m4v|mkv|webm|mov|avi)(?:$|\?)/i;
const MAX_MEDIA_BYTES = (Number(process.env.MEDIA_LINK_MAX_MB) || 3000) * 1024 * 1024;
const exec = (cmd, args, opts = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout || 0, ...opts }, (err, stdout, stderr) =>
    err ? reject(Object.assign(err, { stderr: String(stderr || "").slice(-400) })) : resolve(String(stdout))));

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

  // ---------- yt-dlp (optional) ----------
  let ytdlp; // undefined = not looked for yet, null = not installed, string = how to run it
  async function findYtDlp() {
    if (ytdlp !== undefined) return ytdlp;
    const candidates = [process.env.YTDLP_PATH, path.join(rootDir, "tools", "yt-dlp", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"), "yt-dlp"].filter(Boolean);
    for (const c of candidates) {
      if (c !== "yt-dlp" && !existsSync(c)) continue;
      try { await exec(c, ["--version"], { timeout: 20_000 }); ytdlp = c; console.log(`🎬 yt-dlp found (${c}): YouTube videos without subtitles will be listened to`); return ytdlp; } catch {}
    }
    ytdlp = null;
    return null;
  }
  const NO_YTDLP = "To learn from it anyway, install yt-dlp (free): run \"winget install yt-dlp\" or put yt-dlp.exe in tools/yt-dlp/, then restart Krishna Sakha.";
  // the video's AUDIO only (no picture: much smaller), saved where the learner listens to recordings
  async function youtubeAudio(url, id, info) {
    const tool = await findYtDlp();
    if (!tool) return { ...info, status: "no-captions", note: `This video has no subtitles. ${NO_YTDLP}` };
    const dir = path.join(LIB, "media", "YouTube");
    await mkdir(dir, { recursive: true });
    // the spoken language decides how Whisper listens: "[en]" in the file name = English, otherwise Hindi
    // (or Marathi/Sanskrit when the title says so; see speechLanguage in learner.js)
    let lang = "";
    try { lang = (await exec(tool, ["--no-warnings", "--skip-download", "--print", "%(language)s", url], { timeout: 120_000 })).trim(); } catch {}
    const tag = /^en/i.test(lang) ? " [en]" : "";
    const base = `${safe(info.title)} [${id}]${tag}`;
    const out = await exec(tool, ["--no-warnings", "--no-playlist", "-f", "bestaudio[ext=m4a]/bestaudio", "--max-filesize", `${Math.round(MAX_MEDIA_BYTES / 1048576)}M`,
      "-o", path.join(dir, `${base}.%(ext)s`), "--print", "after_move:filepath", url], { timeout: 60 * 60_000 });
    const file = out.trim().split(/\r?\n/).pop();
    if (!file || !existsSync(file)) return { ...info, status: "error", note: "The audio could not be downloaded." };
    onNewFile();
    return { ...info, status: "learned-file", file: path.relative(LIB, file).replace(/\\/g, "/"), note: "No subtitles: the audio was downloaded; he is listening to it (speech to text)." };
  }
  // a playlist: every video in it becomes its own link
  async function playlist(url) {
    const tool = await findYtDlp();
    if (!tool) return { status: "error", kind: "media", note: `This is a playlist. ${NO_YTDLP}` };
    const ids = (await exec(tool, ["--no-warnings", "--flat-playlist", "--print", "id", url], { timeout: 5 * 60_000 })).split(/\r?\n/).map((s) => s.trim()).filter((s) => /^[\w-]{11}$/.test(s));
    if (!ids.length) return { status: "error", kind: "media", note: "The playlist is empty or private." };
    const add = ids.map((v) => `https://www.youtube.com/watch?v=${v}`);
    const existing = await readLinks();
    const fresh = add.filter((u) => !existing.includes(u));
    if (fresh.length) await writeFile(LINKS, (await readFile(LINKS, "utf8").catch(() => "")).replace(/\s*$/, "\n") + fresh.join("\n") + "\n");
    return { status: "learned-file", kind: "media", title: `Playlist (${ids.length} videos)`, note: `${fresh.length} new videos added; each is learned on its own.` };
  }

  async function youtube(url, id) {
    let html = "";
    try { html = await (await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { "User-Agent": UA, "Accept-Language": "en" } })).text(); } catch {}
    const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s);
    let p = {};
    try { p = m ? JSON.parse(m[1]) : {}; } catch {}
    const v = p.videoDetails || {};
    const info = { title: v.title || id, author: v.author || "", seconds: Number(v.lengthSeconds || 0), kind: "media" };
    const tool = await findYtDlp();
    if (!m && !tool) return { status: "error", note: "Could not read the YouTube page." };
    if (!m) { try { info.title = (await exec(tool, ["--no-warnings", "--skip-download", "--print", "%(title)s", url], { timeout: 120_000 })).trim() || id; } catch {} }
    const tracks = p.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    // prefer human subtitles in Hindi/Sanskrit/English, then automatic ones
    const rank = (t) => (t.kind === "asr" ? 10 : 0) + (["hi", "sa", "en", "mr"].indexOf(t.languageCode) + 1 || 5);
    const track = [...tracks].sort((a, b) => rank(a) - rank(b))[0];
    let json = {}, label = track ? `${track.languageCode}${track.kind === "asr" ? ", automatic" : ""}` : "";
    // Since 2025 YouTube often answers a plain subtitle request with an empty file; then yt-dlp (which handles
    // YouTube's checks) fetches them; if there are none at all, he listens to the audio instead.
    if (track) { try { json = await (await fetch(`${track.baseUrl}&fmt=json3`, { headers: { "User-Agent": UA } })).json(); } catch {} }
    if (!json.events?.length && tool) {
      const got = await subtitlesViaYtDlp(tool, url, id);
      if (got) { json = got.json; label = got.label; }
    }
    if (!json.events?.length) {
      if (!tool) return { ...info, status: "no-captions", note: tracks.length
        ? `YouTube no longer lets its subtitles be read directly. ${NO_YTDLP}` : `This video has no subtitles. ${NO_YTDLP}` };
      return youtubeAudio(url, id, info);
    }
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
      `# subtitles: ${label}`, "", text.trim()].join("\n"));
    onNewFile();
    return { ...info, status: "learned-file", file: path.relative(LIB, file).replace(/\\/g, "/"), note: `Subtitles imported (${label}).` };
  }

  // subtitles through yt-dlp: human ones first, then automatic, in Hindi / Sanskrit / Marathi / English
  async function subtitlesViaYtDlp(tool, url, id) {
    const tmp = path.join(LIB, ".knowledge", "yt-subs");
    await mkdir(tmp, { recursive: true });
    for (const auto of [false, true]) {
      try {
        await exec(tool, ["--no-warnings", "--skip-download", auto ? "--write-auto-subs" : "--write-subs", "--sub-langs", "hi.*,sa.*,mr.*,en.*",
          "--sub-format", "json3", "-o", path.join(tmp, `${id}.%(ext)s`), url], { timeout: 180_000 });
      } catch { continue; }
      for (const lang of ["hi", "sa", "mr", "en"]) {
        const f = (await import("node:fs")).readdirSync(tmp).find((n) => n.startsWith(`${id}.${lang}`) && n.endsWith(".json3"));
        if (!f) continue;
        try {
          const json = JSON.parse(await readFile(path.join(tmp, f), "utf8"));
          if (json.events?.length) return { json, label: `${lang}${auto ? ", automatic" : ""}` };
        } catch {}
      }
    }
    return null;
  }

  async function web(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return { status: "error", note: `The page answered ${r.status}.` };
    const type = r.headers.get("content-type") || "";
    // an audio or video file (a talk, a podcast episode, a recorded discourse): download it and listen to it
    if (/^(audio|video)\//i.test(type) || MEDIA_EXT.test(new URL(url).pathname)) {
      const size = Number(r.headers.get("content-length") || 0);
      if (size > MAX_MEDIA_BYTES) { r.body?.cancel(); return { status: "error", kind: "media", note: `The file is too large (${Math.round(size / 1048576)} MB).` }; }
      const dir = path.join(LIB, "media", "Web");
      await mkdir(dir, { recursive: true });
      const raw = decodeURIComponent(path.basename(new URL(url).pathname)) || "recording";
      const ext = (raw.match(MEDIA_EXT)?.[1] || (/video/i.test(type) ? "mp4" : /mpeg/i.test(type) ? "mp3" : /ogg/i.test(type) ? "ogg" : "m4a")).toLowerCase();
      const name = `${safe(raw.replace(MEDIA_EXT, ""))}.${ext}`;
      const file = path.join(dir, name), part = file + ".part";
      let bytes = 0;
      const limit = new TransformStream({ transform(chunk, ctl) { bytes += chunk.byteLength; if (bytes > MAX_MEDIA_BYTES) ctl.error(new Error("too large")); else ctl.enqueue(chunk); } });
      try { await pipeline(Readable.fromWeb(r.body.pipeThrough(limit)), createWriteStream(part)); }
      catch (e) { await unlink(part).catch(() => {}); return { status: "error", kind: "media", note: `Download failed: ${e.message}` }; }
      await rename(part, file);
      onNewFile();
      return { status: "learned-file", kind: "media", title: name, file: `media/Web/${name}`, note: `Recording downloaded (${Math.round(bytes / 1048576)} MB); he is listening to it (speech to text).` };
    }
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
      // links the owner removed are forgotten (they no longer show in the 📖 list)
      const current = new Set(await readLinks());
      let pruned = false;
      for (const u of Object.keys(state)) if (!current.has(u)) { delete state[u]; pruned = true; }
      if (pruned) await save();
      for (const url of current) {
        // done links are skipped; a video that could not be learned without yt-dlp is tried again once it is installed
        if (state[url] && state[url].status !== "error" && !(state[url].status === "no-captions" && (await findYtDlp()))) continue;
        let res;
        try {
          const id = youtubeId(url);
          const list = !id && /youtube\.com\/(playlist|@|c\/|channel\/)/i.test(url) || (/[?&]list=/.test(url) && /playlist/i.test(url));
          res = list ? await playlist(url) : id ? await youtube(url, id) : await web(url);
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
