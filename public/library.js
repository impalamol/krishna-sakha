// SANATAN — Library panel (owner only): upload files/folders, add links, view contents.
(function () {
  const $ = (id) => document.getElementById(id);
  const modal = $("libraryModal"), loginForm = $("libLogin"), body = $("libBody");
  const passInput = $("libPass"), loginMsg = $("libLoginMsg");
  const uploadList = $("uploadList"), contents = $("libContents");
  const MEDIA = /\.(mp3|wav|m4a|aac|ogg|opus|flac|mp4|mkv|webm|mov|avi|srt|vtt)$/i;
  const BOOKS = /\.(pdf|epub|txt|md|docx|doc|rtf|html?|djvu)$/i;

  let key = "";
  try { key = sessionStorage.getItem("sanatan.admin") || ""; } catch {}

  const fmtSize = (n) => n > 1e9 ? (n / 1e9).toFixed(1) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), "x-admin-key": key } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
    return data;
  }

  // ---------- open / close / login ----------
  function open() { modal.hidden = false; key ? refresh() : showLogin(); }
  function close() { modal.hidden = true; }
  function showLogin(msg = "") { loginForm.hidden = false; body.hidden = true; loginMsg.textContent = msg; passInput.focus(); }

  $("libraryBtn").addEventListener("click", open);
  $("libClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) close(); });

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    key = passInput.value;
    refresh();
  });

  // ---------- list ----------
  async function refresh() {
    try {
      const d = await api("/api/library");
      try { sessionStorage.setItem("sanatan.admin", key); } catch {}
      loginForm.hidden = true; body.hidden = false;
      renderContents(d);
    } catch (err) {
      key = "";
      try { sessionStorage.removeItem("sanatan.admin"); } catch {}
      showLogin(err.message);
    }
  }

  function renderContents(d) {
    const section = (title, folder, items, isLink) => {
      if (!items.length) return `<div class="lib-sec"><h4>${title} <span>0</span></h4><p class="empty">Nothing yet</p></div>`;
      const rows = items.map((it) => {
        const name = isLink ? it : it.name;
        const meta = isLink ? "" : `<span class="meta">${fmtSize(it.size)}</span>`;
        return `<li><span class="nm" title="${esc(name)}">${esc(name)}</span>${meta}` +
          `<button class="del" data-folder="${folder}" data-name="${esc(name)}" title="Remove">✕</button></li>`;
      }).join("");
      return `<div class="lib-sec"><h4>${title} <span>${items.length}</span></h4><ul>${rows}</ul></div>`;
    };
    contents.innerHTML =
      section("📖 Books", "books", d.books) +
      section("🎧 Audio / Video", "media", d.media) +
      section("📝 My notes", "notes", d.notes) +
      section("🔗 Links", "links", d.links, true);
  }

  contents.addEventListener("click", async (e) => {
    const b = e.target.closest(".del");
    if (!b) return;
    if (!confirm(`Remove "${b.dataset.name}" from the library?`)) return;
    try {
      await api(`/api/library/item?folder=${encodeURIComponent(b.dataset.folder)}&name=${encodeURIComponent(b.dataset.name)}`, { method: "DELETE" });
      refresh();
    } catch (err) { alert(err.message); }
  });

  // ---------- uploads ----------
  function folderFor(file) {
    const n = file.name;
    if (MEDIA.test(n)) return "media";
    if ($("asNotes").checked && /\.(txt|md|docx|pdf)$/i.test(n)) return "notes";
    if (BOOKS.test(n)) return "books";
    return null;
  }

  // ---------- resumable chunked uploads ----------
  const CHUNK = 8 * 1024 * 1024;   // 8 MB per request
  const AUTO_RETRIES = 3;          // automatic attempts before showing Retry
  const failedJobs = new Set();
  const retryAllBtn = document.createElement("button");
  retryAllBtn.className = "btn retry-all"; retryAllBtn.type = "button"; retryAllBtn.hidden = true;
  uploadList.before(retryAllBtn);
  const syncRetryAll = () => {
    retryAllBtn.hidden = failedJobs.size === 0;
    retryAllBtn.textContent = `↻ Retry all failed (${failedJobs.size})`;
  };
  retryAllBtn.addEventListener("click", async () => {
    const jobs = [...failedJobs];
    for (const j of jobs) await runJob(j);
    refresh();
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qs = (job, extra = "") =>
    `folder=${job.folder}&name=${encodeURIComponent(job.rel)}&total=${job.file.size}${extra}`;

  function sendChunk(job, start, end, fresh) {
    return new Promise((resolve) => {
      const final = end >= job.file.size ? 1 : 0;
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/library/upload?${qs(job, `&offset=${start}&final=${final}${fresh ? "&fresh=1" : ""}`)}`);
      xhr.setRequestHeader("x-admin-key", key);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) showProgress(job, start + e.loaded); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        resolve({ status: xhr.status, data });
      };
      xhr.onerror = () => resolve({ status: 0, data: { error: "Network error" } });
      xhr.ontimeout = () => resolve({ status: 0, data: { error: "Timed out" } });
      xhr.send(job.file.slice(start, end));
    });
  }

  function showProgress(job, sent) {
    const size = job.file.size || 1;
    const p = Math.min(100, (sent / size) * 100);
    job.bar.style.width = p + "%";
    job.st.textContent = `${Math.floor(p)}% · ${fmtSize(sent)} of ${fmtSize(job.file.size)}`;
  }

  // { size: bytes of an unfinished upload, existing: size of a finished copy or null }
  async function uploadStatus(job) {
    try {
      const r = await fetch(`/api/library/upload-status?${qs(job)}`, { headers: { "x-admin-key": key } });
      if (r.ok) return await r.json();
    } catch {}
    return null; // server unreachable
  }

  function markSkipped(job, why) {
    job.bar.style.width = "100%";
    job.row.classList.add("skip");
    job.st.textContent = why;
  }

  function setFailed(job, msg) {
    job.row.classList.remove("ok"); job.row.classList.add("bad");
    job.st.textContent = msg;
    job.retry.hidden = false;
    failedJobs.add(job); syncRetryAll();
  }

  async function runJob(job) {
    job.retry.hidden = true;
    job.row.classList.remove("bad", "ok");
    failedJobs.delete(job); syncRetryAll();

    let attempts = 0;
    for (;;) {
      // Where to (re)start: ask the server what it already has.
      const status = await uploadStatus(job);
      if (status && status.existing === job.file.size && !status.size) {
        markSkipped(job, "⤼ already in library, skipped");
        return "skipped";
      }
      const have = status ? status.size || 0 : null;
      let offset = have ?? 0, fresh = false;
      if (have === null) offset = -1;                         // server down
      else if (have > job.file.size) { offset = 0; fresh = true; } // stale leftover from a different file
      if (status && status.existing != null && !job.replacing) {
        job.replacing = true; // same name, different size: newer version replaces the old one
      }
      if (offset > 0) job.st.textContent = `resuming from ${fmtSize(offset)}…`;

      let ok = offset >= 0, errMsg = "Server not reachable";
      while (ok) {
        const end = Math.min(offset + CHUNK, job.file.size);
        const r = await sendChunk(job, offset, end, fresh);
        fresh = false;
        if (r.status === 200) {
          offset = r.data.size ?? end;
          showProgress(job, offset);
          if (r.data.done) {
            job.bar.style.width = "100%";
            job.st.textContent = job.replacing ? `✓ updated (replaced older copy)` : `✓ saved to ${job.folder}`;
            job.row.classList.add("ok");
            return true;
          }
          attempts = 0; // progress made, reset the retry budget
          continue;
        }
        if (r.status === 409 && typeof r.data.size === "number") { offset = r.data.size; continue; } // re-sync
        if (r.status === 400 || r.status === 401) {
          setFailed(job, r.data.error || `failed (${r.status})`);
          if (r.status === 401) showLogin("Password no longer accepted. Unlock again, then press Retry.");
          return false;
        }
        ok = false; errMsg = r.data.error || `error ${r.status}`;
      }

      attempts++;
      if (attempts > AUTO_RETRIES) { setFailed(job, `${errMsg}. Press Retry to resume.`); return false; }
      job.st.textContent = `${errMsg}, retrying (${attempts}/${AUTO_RETRIES})…`;
      await sleep(1000 * 2 ** (attempts - 1)); // 1s, 2s, 4s
    }
  }

  function makeJob(file) {
    const rel = file.webkitRelativePath || file.relativePath || file.name;
    const row = document.createElement("div");
    row.className = "up-row";
    row.innerHTML = `<span class="nm" title="${esc(rel)}">${esc(rel)}</span><span class="bar"><i></i></span>` +
      `<span class="st">waiting</span><button class="retry" type="button" hidden>↻ Retry</button>`;
    uploadList.prepend(row);
    const job = { file, rel, folder: folderFor(file), row, bar: row.querySelector("i"), st: row.querySelector(".st"), retry: row.querySelector(".retry") };
    job.retry.addEventListener("click", async () => { await runJob(job); refresh(); });
    return job;
  }

  const summary = document.createElement("p");
  summary.className = "up-summary"; summary.hidden = true;
  uploadList.before(summary);

  async function uploadAll(files) {
    files = [...files].filter((f) => !f.name.startsWith("."));
    const jobs = files.map(makeJob);
    const seen = new Set();
    const count = { saved: 0, skipped: 0, failed: 0, unsupported: 0 };
    const show = (done) => {
      summary.hidden = false;
      summary.textContent = `${done ? "Finished" : "Uploading"}: ${count.saved} uploaded · ${count.skipped} already in library` +
        (count.failed ? ` · ${count.failed} failed` : "") + (count.unsupported ? ` · ${count.unsupported} unsupported type` : "") +
        ` · ${jobs.length} total`;
    };
    for (const job of jobs) {
      if (!job.folder) { job.st.textContent = "skipped (type not supported)"; job.row.classList.add("bad"); count.unsupported++; show(); continue; }
      const id = `${job.folder}/${job.rel}|${job.file.size}`;
      if (seen.has(id)) { markSkipped(job, "⤼ duplicate in this batch, skipped"); count.skipped++; show(); continue; }
      seen.add(id);
      const r = await runJob(job); // one at a time keeps big media stable
      if (r === "skipped") count.skipped++; else if (r) count.saved++; else count.failed++;
      show();
    }
    show(true);
    refresh();
  }

  $("pickFiles").addEventListener("change", (e) => { uploadAll(e.target.files); e.target.value = ""; });
  $("pickFolder").addEventListener("change", (e) => { uploadAll(e.target.files); e.target.value = ""; });

  // drag & drop, including whole folders
  const drop = $("dropZone");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    const items = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!items.length) return uploadAll(e.dataTransfer.files);
    const files = [];
    const readAll = (reader) => new Promise((res) => { const out = []; const next = () => reader.readEntries((b) => { if (!b.length) return res(out); out.push(...b); next(); }); next(); });
    async function walk(entry, prefix) {
      if (entry.isFile) {
        const f = await new Promise((res) => entry.file(res));
        f.relativePath = prefix + f.name;
        files.push(f);
      } else if (entry.isDirectory) {
        for (const child of await readAll(entry.createReader())) await walk(child, prefix + entry.name + "/");
      }
    }
    for (const it of items) await walk(it, "");
    uploadAll(files);
  });

  // ---------- links ----------
  $("addLinksBtn").addEventListener("click", async () => {
    const msg = $("linksMsg");
    const links = $("linksInput").value.split(/\s+/).filter(Boolean);
    if (!links.length) { msg.textContent = "Paste at least one link."; return; }
    try {
      const r = await api("/api/library/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links }) });
      msg.textContent = `Added ${r.added.length}` + (r.rejected.length ? `, ignored ${r.rejected.length} invalid` : "") + ".";
      $("linksInput").value = "";
      refresh();
    } catch (err) { msg.textContent = err.message; }
  });
})();
