// SANATAN — "What I've read": list of books + ask/search across them (no API credits needed).
(function () {
  const $ = (id) => document.getElementById(id);
  const modal = $("knowModal"), form = $("knowForm"), q = $("knowQ"), bookSel = $("knowBook");
  const results = $("knowResults"), list = $("knowList"), summary = $("knowSummary");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let books = [], refreshTimer = null;

  // ---------- open / close ----------
  function open(tab) {
    modal.hidden = false;
    showTab(tab || "ask");
    load();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(load, 5000); // keep "reading now" progress live
    setTimeout(() => q.focus(), 50);
  }
  function close() { modal.hidden = true; clearInterval(refreshTimer); }
  $("knowBtn").addEventListener("click", () => open());
  document.querySelectorAll("[data-open-know]").forEach((b) => b.addEventListener("click", () => open()));
  $("knowClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) { e.stopPropagation(); close(); } }, true);

  // tabs: "Ask my books", then one list each for 📚 Books, 🎧 Audio and 🎬 Video (they share the list area)
  let listKind = "books";
  function showTab(name) {
    if (name === "list") name = listKind;                  // older callers
    modal.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on); t.setAttribute("aria-selected", String(on));
    });
    const body = name === "ask" ? "ask" : "list";
    modal.querySelectorAll(".tab-body").forEach((b) => { b.hidden = b.dataset.body !== body; });
    if (body === "list") { listKind = name; renderList(); }
  }
  modal.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  // ---------- books list ----------
  async function load() {
    try {
      const d = await (await fetch("/api/knowledge", { cache: "no-store" })).json();
      books = d.books;
      const read = books.filter((b) => b.searchable);
      const s = d.status;
      const now = s.state === "reading" && s.file ? ` Now ${s.mode === "listen" ? "listening to" : "reading"} “${s.title || s.file}”${s.pages > 1 && s.mode !== "listen" ? `, page ${s.page} of ${s.pages}` : ""}.` : "";
      const count = (k, arr) => arr.filter((b) => kindOf(b) === k).length;
      const nBooks = count("books", read), allBooks = count("books", books);
      const nAud = count("audio", read), allAud = count("audio", books), nVid = count("video", read), allVid = count("video", books);
      summary.textContent = `I have read ${nBooks} of ${allBooks} books` +
        (allAud ? `, listened to ${nAud} of ${allAud} audio recordings` : "") +
        (allVid ? `${allAud ? "," : ""} and studied ${nVid} of ${allVid} videos` : "") + `.${now}`;
      for (const k of ["books", "audio", "video"]) {
        const el = modal.querySelector(`[data-n="${k}"]`);
        if (el) el.textContent = count(k, books) ? String(count(k, books)) : "";
      }
      renderBookSelect(read);
      syncSumBtn();
      syncReadToggle(s);
      renderList();
    } catch {
      summary.textContent = "Could not reach the server.";
    }
  }

  function renderBookSelect(read) {
    const cur = bookSel.value;
    bookSel.innerHTML = `<option value="">All books I've read (${read.length})</option>` +
      read.map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("");
    bookSel.value = read.some((b) => b.id === cur) ? cur : "";
  }

  function renderList() {
    const group = (title, items, cls) => !items.length ? "" :
      `<h4 class="${cls}">${title} <span>${items.length}</span></h4><ul>` + items.map((b) => {
        const date = b.learnedAt ? new Date(b.learnedAt).toLocaleDateString() : "";
        const mins = b.duration ? `${Math.round(b.duration / 60)} min` : "";
        const meta = [b.kind === "media" ? mins : (b.pages ? `${b.pages} pages` : ""),
          b.via === "ocr" ? "via OCR" : b.via === "listen" ? "listened (speech to text)" : b.via === "youtube" ? "YouTube subtitles" : "", date].filter(Boolean).join(" · ");
        const ask = b.searchable
          ? `<button class="ask-book sum-book" data-sum="${esc(b.id)}" title="Summarize this book">Summary</button>` +
            `<button class="ask-book" data-id="${esc(b.id)}" title="Ask from this book">Ask ›</button>`
          : "";
        return `<li><div class="bk"><span class="nm" title="${esc(b.file)}">${esc(b.title)}</span>` +
          `<span class="meta">${esc(b.searchable ? meta : b.label)}</span></div>${ask}</li>`;
      }).join("") + "</ul>";
    // one category at a time: 📚 Books, 🎧 Audio or 🎬 Video (tabs)
    const items = books.filter((b) => kindOf(b) === listKind);
    const busy = (b) => b.status === "ocr-in-progress" || b.status === "listening";
    const isBook = listKind === "books";
    const EMPTY = { books: "No books yet. Add PDFs, EPUBs or text files from the 📚 Library.",
      audio: "No audio yet. Add recordings (MP3, WAV, M4A…) from the 📚 Library.",
      video: "No video yet. Add video files or YouTube links from the 📚 Library." };
    list.innerHTML =
      group(isBook ? "✅ Read" : listKind === "video" ? "✅ Watched & understood" : "✅ Listened", items.filter((b) => b.searchable), "ok") +
      group(isBook ? "📖 Reading now" : "🎧 Listening now", items.filter(busy), "now") +
      group(isBook ? "⏳ Waiting to be read" : "⏳ Waiting", items.filter((b) => !b.searchable && !busy(b)), "wait") ||
      `<p class="empty">${EMPTY[listKind]}</p>`;
  }
  function kindOf(b) { return b.kind !== "media" ? "books" : b.media === "video" ? "video" : "audio"; }

  list.addEventListener("click", (e) => {
    const b = e.target.closest(".ask-book");
    if (!b) return;
    if (b.dataset.sum) {                     // "Summary" button
      bookSel.value = b.dataset.sum;
      syncSumBtn();
      showTab("ask");
      summarize(b.dataset.sum);
      return;
    }
    bookSel.value = b.dataset.id;
    syncSumBtn();
    showTab("ask");
    q.focus();
  });

  // ---------- speaking results ----------
  const Voice = () => window.SanatanVoice;
  function listenButton(text) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "listen-btn"; btn.textContent = "▶ Listen";
    btn.addEventListener("click", () => {
      const v = Voice();
      if (!v) return;
      if (btn.classList.contains("on")) { v.stop(); btn.classList.remove("on"); btn.textContent = "▶ Listen"; return; }
      document.querySelectorAll(".listen-btn.on").forEach((x) => { x.classList.remove("on"); x.textContent = "▶ Listen"; });
      v.stop(); v.speak(text);
      btn.classList.add("on"); btn.textContent = "■ Stop";
    });
    return btn;
  }
  // reply language follows the language buttons in the panel
  function replyLang() {
    try { return (JSON.parse(localStorage.getItem("sanatan.lang") || "{}").name || "").split(" ")[0]; } catch { return ""; }
  }

  // show a Markdown answer (summary, book list…) as a card, and read it aloud
  function showAnswer(md) {
    results.innerHTML = "";
    const card = document.createElement("article");
    card.className = "answer-card";
    card.innerHTML = window.SanatanMD.render(md);
    const btn = listenButton(md);
    card.appendChild(btn);
    results.appendChild(card);
    if (Voice() && Voice().settings.enabled) btn.click(); // speak it straight away
  }

  // Summary in the selected language. It streams in: headings first, then each sentence as soon as it
  // is translated (the first time can take a while; after that it's cached and instant). Spoken as it arrives.
  let sumAbort = null;
  async function summarize(bookId) {
    const title = bookSel.selectedOptions[0]?.textContent || "this book";
    const lang = langCode();
    if (sumAbort) sumAbort.abort();
    sumAbort = new AbortController();
    if (Voice()) Voice().stop();
    results.innerHTML = "";
    const status = document.createElement("p");
    status.className = "hint";
    status.textContent = `Reading through “${title}” to pick its key sentences…`;
    const card = document.createElement("article");
    card.className = "answer-card";
    card.hidden = true;
    results.append(status, card);

    let md = "", lines = 0;
    const speak = Voice() && Voice().settings.enabled;
    try {
      const r = await fetch(`/api/knowledge/summary?stream=1&book=${encodeURIComponent(bookId)}&lang=${encodeURIComponent(lang)}`, { signal: sumAbort.signal });
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5));
          if (ev.error) throw new Error(ev.error);
          if (ev.t) {
            md += ev.t;
            card.hidden = false;
            card.innerHTML = window.SanatanMD.render(md);
            if (speak) Voice().speak(ev.t);                       // speak each piece as it arrives
            if (/^\d+\. /.test(ev.t)) lines++;
            status.textContent = lang === "en" || lines >= 8 ? "" : `Translating… ${lines} of 8 sentences ready (first time only; then it's instant).`;
          }
        }
      }
      status.remove();
      card.appendChild(listenButton(md));
    } catch (e) {
      if (e.name === "AbortError") return;
      status.className = "empty";
      status.textContent = "Could not make a summary right now.";
    }
  }
  // the language chosen with the language buttons (Auto = English)
  function langCode() {
    try {
      const code = JSON.parse(localStorage.getItem("sanatan.lang") || "{}").code || "auto";
      return code === "auto" ? "en" : code;
    } catch { return "en"; }
  }

  const sumBtn = $("sumBtn");
  function syncSumBtn() { sumBtn.disabled = !bookSel.value; }
  bookSel.addEventListener("change", syncSumBtn);
  sumBtn.addEventListener("click", () => { if (bookSel.value) summarize(bookSel.value); });

  const SUMMARY_RE = /summar|summery|overview|\bgist\b|what is (this|the|it)? ?(book )?about|saa?ransh|\bsaar\b|सारांश|सार\b|सार बता|संक्षेप|संक्षिप्त|थोडक्यात|किस बारे में|बारे में है/i;
  const SPECIAL_RE = /(which|what|list).*(books?|granth).*(read|studied)|कौन.?स[ेी]? (पुस्तक|किताब|ग्रंथ)|कोणते ग्रंथ|kaun se (granth|books?)/i;

  // ---------- ask ----------
  function highlight(text, words) {
    let html = esc(text);
    for (const w of words || []) {
      if (w.length < 2) continue;
      const re = new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      html = html.replace(re, (m) => `<mark>${m}</mark>`);
    }
    return html;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = q.value.trim();
    if (!query) { if (bookSel.value) summarize(bookSel.value); return; }

    // summaries and "which books have you read?" go to the answer engine
    if (SUMMARY_RE.test(query) || SPECIAL_RE.test(query)) {
      if (SUMMARY_RE.test(query) && bookSel.value) return summarize(bookSel.value);
      results.innerHTML = `<p class="hint">Thinking…</p>`;
      try {
        const d = await (await fetch(`/api/knowledge/ask?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(replyLang())}`)).json();
        showAnswer(d.markdown);
      } catch { results.innerHTML = `<p class="empty">Could not reach the server.</p>`; }
      return;
    }

    results.innerHTML = `<p class="hint">Searching ${bookSel.value ? "this book" : "everything I've read"}…</p>`;
    try {
      const d = await (await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}&book=${encodeURIComponent(bookSel.value)}`)).json();
      if (!d.results?.length) {
        results.innerHTML = `<p class="empty">I haven't found this in the ${d.searched || 0} books I've read so far. Try other words (Hindi or English), or wait until more scanned books are read.</p>`;
        return;
      }
      results.innerHTML = `<p class="hint">${d.results.length} passages found in ${d.searched} books:</p>` + d.results.map((r) =>
        `<article class="hit"><header><strong>${esc(r.book)}</strong>${r.page ? `<span>${String(r.page).includes(":") ? "⏱ " : "page "}${r.page}</span>` : ""}</header>` +
        `<p>${highlight(r.text, d.words)}</p></article>`).join("");
      results.querySelectorAll(".hit").forEach((el, i) => el.appendChild(listenButton(d.results[i].text.replace(/^…\s*|\s*…$/g, ""))));
    } catch {
      results.innerHTML = `<p class="empty">Could not reach the server.</p>`;
    }
  });

  // ---------- owner: pause / resume reading ----------
  const readToggle = $("readToggle");
  let pausedNow = false;
  function syncReadToggle(s) {
    pausedNow = !!s.manualPause;
    readToggle.textContent = pausedNow ? "▶ Resume reading" : "⏸ Pause reading";
  }
  readToggle.addEventListener("click", async () => {
    let key = "";
    try { key = sessionStorage.getItem("sanatan.admin") || ""; } catch {}
    if (!key) key = window.prompt("Owner password (ADMIN_PASSWORD in .env):") || "";
    if (!key) return;
    readToggle.disabled = true;
    try {
      const r = await fetch(`/api/learner/${pausedNow ? "resume" : "pause"}`, { method: "POST", headers: { "x-admin-key": key } });
      const d = await r.json();
      if (!r.ok) {
        try { sessionStorage.removeItem("sanatan.admin"); } catch {}
        alert(d.error || "Could not change reading.");
      } else {
        try { sessionStorage.setItem("sanatan.admin", key); } catch {}
        syncReadToggle(d);
        load();
      }
    } catch { alert("Could not reach the server."); }
    readToggle.disabled = false;
  });

  window.SanatanKnowledge = { open };
})();
