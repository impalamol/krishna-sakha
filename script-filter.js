// KRISHNA SAKHA — keeps an answer in ONE script.
// A small local model sometimes slips a word of another language into its answer (a Hindi word inside Urdu,
// Telugu letters inside Malayalam, a Spanish word inside Kannada). The voice would then read it wrongly. This
// filter works on the streamed answer word by word and removes letters of any OTHER script.
// Latin words are kept only when they look intended: capitalised names ("Om", "Mudra Vigyan") and anything
// inside brackets (citations like "(Mudra Vigyan, page 21)"). Lowercase Latin words, and Latin glued onto a word
// of the answer's own script ("ചിന്തകളെInner"), are removed.
// If the model starts writing mostly in the wrong script, `derailed` tells the caller to stop it early.

const SCRIPTS = {
  deva: /[ऀ-ॿ꣠-ꣿ]/u, beng: /[ঀ-৿]/u, guru: /[਀-੿]/u, gujr: /[઀-૿]/u,
  orya: /[଀-୿]/u, taml: /[஀-௿]/u, telu: /[ఀ-౿]/u, knda: /[ಀ-೿]/u,
  mlym: /[ഀ-ൿ]/u, arab: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/u,
};
const LATIN = /[A-Za-zÀ-ɏ]/u;

/** script key for a reply-language description ("Urdu, in Urdu script"…), or null = no filtering (English, Hinglish) */
export function scriptFor(langName = "") {
  const n = langName.toLowerCase();
  if (/english|hinglish/.test(n)) return null;
  if (/hindi|marathi|sanskrit/.test(n)) return "deva";
  return { bengali: "beng", punjabi: "guru", gujarati: "gujr", odia: "orya", tamil: "taml", telugu: "telu",
    kannada: "knda", malayalam: "mlym", urdu: "arab" }[(n.match(/bengali|punjabi|gujarati|odia|tamil|telugu|kannada|malayalam|urdu/) || [])[0]] || null;
}

/** Streaming filter: push(text) returns the cleaned text that is ready; end() returns the rest. */
// "page 12", "pages 12-14", "p. 12", "पृष्ठ 12", "पेज 12", "पान 12", "பக்கம் 12"…
const PAGE_WORD = "pages?|p\\.|pg\\.?|पृष्ठ|पेज|पन्ना|पान|পৃষ্ঠা|પાનું|પૃષ્ઠ|ਪੰਨਾ|பக்கம்|పేజీ|ಪುಟ|പേജ്|صفحہ";
const PAGE_RE = new RegExp(`([,;]?\\s*(?:${PAGE_WORD})\\s*)(\\d+)(?:\\s*[-–]\\s*(\\d+))?`, "giu");
const ENDS_WITH_PAGE = new RegExp(`(?:${PAGE_WORD})\\s*$`, "iu");

/**
 * Streaming filter: push(text) returns the cleaned text that is ready; end() returns the rest.
 * allowedPages: page numbers that really appear in the passages he was given; any other cited page is a guess
 * of the model and is removed (a wrong page is worse than none).
 */
export function createScriptFilter(langName, { allowedPages = null } = {}) {
  const key = scriptFor(langName);
  const own = key && SCRIPTS[key];
  let buf = "", last = "\n", depth = 0, kept = 0, removed = 0;
  const checkPages = (s) => !allowedPages ? s : s.replace(PAGE_RE, (m, pre, a, b) =>
    allowedPages.has(a) && (!b || allowedPages.has(b)) ? m : "");

  function cleanWord(word) {
    const chars = [...word];
    const hasOwn = chars.some((ch) => own.test(ch));
    const latinWord = !hasOwn && chars.some((ch) => LATIN.test(ch));
    // a Latin word is kept inside brackets or when capitalised (a name); a lowercase one is a slip
    const keepLatin = latinWord && (depth > 0 || /[()]/.test(word) || /^[^\p{L}]*[A-Z]/u.test(word));
    let out = "";
    for (const ch of chars) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (!/[\p{L}\p{M}]/u.test(ch)) { out += ch; continue; }        // digits, punctuation, markdown
      if (own.test(ch)) { out += ch; kept++; continue; }
      if (LATIN.test(ch) && keepLatin) { out += ch; kept++; continue; }
      removed++;                                                       // another script, or a Latin slip
    }
    if (!/[\p{L}\p{N}]/u.test(out)) return out.replace(/[^\p{P}]/gu, "").replace(/[-‐]/g, "");
    return out.replace(/^[-‐]+|[-‐]+$/g, "");                          // "ruido-വിഷ" -> "വിഷ"
  }

  // copies of the context's labels (<passage index="1" book="…">, page="12">) and what removed words leave behind
  const tidy = (s) => s
    .replace(/<\/?[a-z_]+(?:\s+[a-z_]+="[^"]*")*\s*\/?>/gi, "")
    .replace(/\b[a-z_]+="[^"]*"\s*>?/gi, "").replace(/(^|\s)="[^"]*"\s*>?/g, "$1")
    .replace(/[‘'"“«]\s*[’'"”»]/g, "").replace(/[,;]\s*\)/g, ")").replace(/\s*\(\s*[,;]?\s*\)/g, "")
    .replace(/(?:^|\n)\s*\/\s*(?=\n|$)/g, "\n").replace(/(,\s*){2,}/g, ", ");

  const clean = (s) => {
    let out = tidy(checkPages(s));
    if (key) out = out.split(/(\s+)/).map((part) => /^\s+$/.test(part) ? part : cleanWord(part)).join("");
    out = tidy(out).replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:।॥،۔؟])/g, "$1");
    if (/[ \t]$/.test(last) || last === "\n") out = out.replace(/^[ \t]+/, "");
    if (out) last = out.slice(-1);
    return out;
  };

  return {
    active: !!key,
    /** true when most of what the model wrote lately was in the wrong script: stop it, keep what was good */
    get derailed() { return removed > 120 && removed > kept * 0.6; },
    push(t) {
      buf += t;
      // an unfinished label (<passage … ) or bracket ("(Book, page …") is held until it closes, so it can be
      // checked and cleaned whole
      const lt = buf.lastIndexOf("<"), par = buf.lastIndexOf("(");
      const openLt = lt >= 0 && buf.indexOf(">", lt) < 0 ? lt : -1;
      const openPar = par >= 0 && buf.indexOf(")", par) < 0 ? par : -1;
      const open = Math.max(openLt, openPar);
      if (open >= 0 && buf.length - open < 300) {
        const head = buf.slice(0, open), cut = Math.max(head.lastIndexOf(" "), head.lastIndexOf("\n"));
        if (cut < 0) return "";
        const ready = buf.slice(0, cut + 1); buf = buf.slice(cut + 1);
        return clean(ready);
      }
      let cut = Math.max(buf.lastIndexOf(" "), buf.lastIndexOf("\n"));
      if (cut < 0) return "";
      // "… page" with its number still to come: wait, so the citation can be checked as a whole
      if (allowedPages && ENDS_WITH_PAGE.test(buf.slice(0, cut))) {
        const m = buf.slice(0, cut).match(new RegExp(`[,;]?\\s*(?:${PAGE_WORD})\\s*$`, "iu"));
        const before = buf.slice(0, m.index);
        cut = Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n"));   // cut only at a space, never inside "(page"
        if (cut < 0) return "";
      }
      const ready = buf.slice(0, cut + 1);
      buf = buf.slice(cut + 1);
      return clean(ready);
    },
    end() { const r = clean(buf); buf = ""; return r; },
  };
}
