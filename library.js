// SANATAN — owner-only Library API
// Stores uploaded books, media, notes and links in ./library so they can be
// imported into Sanatan's knowledge later. Protected by ADMIN_PASSWORD.

import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, rename, unlink, readFile, writeFile } from "node:fs/promises";
import { timingSafeEqual, createHash } from "node:crypto";
import path from "node:path";

const FOLDERS = {
  books: [".pdf", ".epub", ".txt", ".md", ".docx", ".doc", ".rtf", ".html", ".htm", ".djvu"],
  media: [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".mp4", ".mkv", ".webm", ".mov", ".avi", ".srt", ".vtt"],
  notes: [".txt", ".md", ".docx", ".pdf"],
};

export function createLibrary(rootDir, { onChange = () => {} } = {}) {
  const LIB = path.join(rootDir, "library");
  const LINKS = path.join(LIB, "links.txt");
  // No file size limit: every file is accepted, MB or GB. Large files are
  // streamed to disk in chunks, so memory use stays small whatever the size.

  const send = (res, status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
  };

  function authorized(req) {
    const pass = process.env.ADMIN_PASSWORD;
    if (!pass) return "disabled";
    const given = String(req.headers["x-admin-key"] || "");
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(pass).digest();
    return timingSafeEqual(a, b) ? "ok" : "denied";
  }

  // "Gita/ch 1.pdf" -> safe relative path inside the folder (keeps sub-folders)
  function safeRel(folder, name) {
    if (!FOLDERS[folder]) return null;
    const parts = String(name || "").replace(/\\/g, "/").split("/")
      .map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, "").trim())
      .filter((p) => p && p !== "." && p !== "..");
    if (!parts.length) return null;
    const rel = parts.join("/");
    if (!FOLDERS[folder].includes(path.extname(rel).toLowerCase())) return null;
    const full = path.resolve(LIB, folder, rel);
    if (!full.startsWith(path.join(LIB, folder) + path.sep)) return null;
    return { rel, full };
  }

  async function walk(dir, base = "") {
    let out = [];
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.endsWith(".uploading")) continue;
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) out = out.concat(await walk(path.join(dir, e.name), rel));
      else {
        const s = await stat(path.join(dir, e.name));
        out.push({ name: rel, size: s.size, added: s.mtimeMs });
      }
    }
    return out;
  }

  async function readLinks() {
    try {
      return (await readFile(LINKS, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    } catch { return []; }
  }

  async function list(res) {
    const data = {};
    for (const f of Object.keys(FOLDERS)) data[f] = await walk(path.join(LIB, f));
    data.links = await readLinks();
    data.accept = FOLDERS;
    send(res, 200, data);
  }

  // Resumable, chunked upload. Bytes collect in "<file>.uploading"; the client
  // sends each chunk with the offset it starts at, and "final=1" on the last one.
  // After any failure the client asks /upload-status for the saved size and resumes there.
  const partSize = async (tmp) => { try { return (await stat(tmp)).size; } catch { return 0; } };

  async function uploadStatus(res, url) {
    const target = safeRel(url.searchParams.get("folder"), url.searchParams.get("name"));
    if (!target) return send(res, 400, { error: "This file type is not accepted in that folder." });
    let existing = null; // size of the finished file already in the library, if any
    try { existing = (await stat(target.full)).size; } catch {}
    send(res, 200, { size: await partSize(`${target.full}.uploading`), existing });
  }

  async function upload(req, res, url) {
    const target = safeRel(url.searchParams.get("folder"), url.searchParams.get("name"));
    if (!target) return send(res, 400, { error: "This file type is not accepted in that folder." });
    const offset = Number(url.searchParams.get("offset") || 0);
    const total = Number(url.searchParams.get("total") || 0);
    const final = url.searchParams.get("final") === "1";

    await mkdir(path.dirname(target.full), { recursive: true });
    const tmp = `${target.full}.uploading`;
    let current = await partSize(tmp);
    if (offset === 0 && current > 0 && url.searchParams.get("fresh") === "1") {
      await unlink(tmp).catch(() => {}); current = 0;
    }
    if (offset !== current) {
      req.resume(); // discard body
      return send(res, 409, { error: "Out of sync; resume from saved size.", size: current });
    }

    const out = createWriteStream(tmp, { flags: "a" });
    let failed = false;
    try {
      for await (const chunk of req) {
        if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
      }
    } catch { failed = true; }
    await new Promise((r) => out.end(r));
    const size = await partSize(tmp);
    if (failed) return send(res, 500, { error: "Connection dropped. Partial data kept, retry to resume.", size });

    if (final) {
      if (total && size !== total) return send(res, 409, { error: "Size mismatch; resume from saved size.", size });
      await rename(tmp, target.full);
      onChange();
      return send(res, 200, { ok: true, done: true, name: target.rel, size });
    }
    send(res, 200, { ok: true, size });
  }

  async function addLinks(req, res) {
    let body = "";
    for await (const c of req) { body += c; if (body.length > 100_000) return send(res, 413, { error: "Too much text." }); }
    let links;
    try { links = JSON.parse(body).links; } catch { return send(res, 400, { error: "Invalid request." }); }
    const existing = new Set(await readLinks());
    const added = [], rejected = [];
    for (const raw of Array.isArray(links) ? links : []) {
      const l = String(raw).trim();
      if (!l) continue;
      try {
        const u = new URL(l);
        if (!/^https?:$/.test(u.protocol)) throw 0;
        if (!existing.has(u.href)) { existing.add(u.href); added.push(u.href); }
      } catch { rejected.push(l); }
    }
    await mkdir(LIB, { recursive: true });
    let header = "";
    try { header = (await readFile(LINKS, "utf8")).split(/\r?\n/).filter((l) => l.trim().startsWith("#")).join("\n"); } catch {}
    await writeFile(LINKS, (header ? header + "\n" : "") + [...existing].join("\n") + "\n");
    onChange("links"); // learn from the new links right away
    send(res, 200, { ok: true, added, rejected });
  }

  async function remove(res, url) {
    const kind = url.searchParams.get("folder");
    if (kind === "links") {
      const target = url.searchParams.get("name");
      const keep = (await readLinks()).filter((l) => l !== target);
      let header = "";
      try { header = (await readFile(LINKS, "utf8")).split(/\r?\n/).filter((l) => l.trim().startsWith("#")).join("\n"); } catch {}
      await writeFile(LINKS, (header ? header + "\n" : "") + keep.join("\n") + (keep.length ? "\n" : ""));
      return send(res, 200, { ok: true });
    }
    const target = safeRel(kind, url.searchParams.get("name"));
    if (!target) return send(res, 400, { error: "Invalid file." });
    try { await unlink(target.full); onChange(); send(res, 200, { ok: true }); }
    catch { send(res, 404, { error: "File not found." }); }
  }

  // returns true if the request was handled
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/library")) return false;
    const auth = authorized(req);
    if (auth === "disabled") { send(res, 403, { error: "Library is turned off. Add ADMIN_PASSWORD to the .env file and restart the server." }); return true; }
    if (auth !== "ok") { send(res, 401, { error: "Wrong owner password." }); return true; }

    const p = url.pathname, m = req.method;
    if (m === "GET" && p === "/api/library") await list(res);
    else if (m === "POST" && p === "/api/library/upload") await upload(req, res, url);
    else if (m === "GET" && p === "/api/library/upload-status") await uploadStatus(res, url);
    else if (m === "POST" && p === "/api/library/links") await addLinks(req, res);
    else if (m === "DELETE" && p === "/api/library/item") await remove(res, url);
    else send(res, 404, { error: "Unknown library action." });
    return true;
  };
}
