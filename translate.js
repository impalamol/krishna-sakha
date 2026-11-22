// SANATAN — offline translation between Indian languages and English.
// Uses Meta's NLLB-200 (distilled 600M, 8-bit) through transformers.js, on this computer,
// with no API or fees. Licence: CC-BY-NC 4.0, i.e. free for NON-COMMERCIAL use only.
// Translations are cached on disk, so each sentence is translated only once.
// Turn off with TRANSLATE_LOCAL=false in .env.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// NLLB language codes. Sanskrit answers come with a simple Hindi explanation, so they use Hindi.
const CODES = {
  en: "eng_Latn", hi: "hin_Deva", mr: "mar_Deva", sa: "hin_Deva", hinglish: "hin_Deva",
  bn: "ben_Beng", ta: "tam_Taml", te: "tel_Telu", kn: "kan_Knda", ml: "mal_Mlym",
  gu: "guj_Gujr", pa: "pan_Guru", ur: "urd_Arab",
};
const MODEL = "Xenova/nllb-200-distilled-600M";

// Which language is this sentence in? (by script; Marathi vs Hindi by common Marathi words)
function sourceOf(text) {
  if (/[ऀ-ॿ]/.test(text)) {
    // Marathi only when its own words outnumber Hindi's ("होते" is common to both, so it doesn't count)
    const mr = (text.match(/आहे|आहेत|आणि|च्या|नाही|करावे|आपण|म्हणून/g) || []).length;
    const hi = (text.match(/है|हैं|और|नहीं|का |की |के |में/g) || []).length;
    return mr > hi ? "mar_Deva" : "hin_Deva";
  }
  const scripts = [[/[ঀ-৿]/, "ben_Beng"], [/[஀-௿]/, "tam_Taml"], [/[ఀ-౿]/, "tel_Telu"],
    [/[ಀ-೿]/, "kan_Knda"], [/[ഀ-ൿ]/, "mal_Mlym"], [/[઀-૿]/, "guj_Gujr"],
    [/[਀-੿]/, "pan_Guru"], [/[؀-ۿ]/, "urd_Arab"]];
  for (const [re, c] of scripts) if (re.test(text)) return c;
  return "eng_Latn";
}

// Hinglish = Hindi written in Roman letters: a light, readable transliteration.
const V = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au" };
const M = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ँ": "n", "ः": "h", "्": "" };
const C = { "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h", "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f" };
export function toRoman(text) {
  let out = "";
  const chars = [...text.normalize("NFC")];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i], next = chars[i + 1];
    if (C[ch]) {
      out += C[ch];
      const endOfWord = !next || !/[ऀ-ॿ]/.test(next);
      if (!(next && M[next] !== undefined) && !endOfWord) out += "a"; // inherent vowel, dropped at word end
    } else if (V[ch]) out += V[ch];
    else if (M[ch] !== undefined) out += M[ch];
    else if (ch === "।" || ch === "॥") out += ".";
    else out += ch;
  }
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

export function createTranslator(rootDir, { onBusy = () => {} } = {}) {
  const MODELS = path.join(rootDir, "tools", "models");
  const CACHE_FILE = path.join(MODELS, "translations.json");
  const on = process.env.TRANSLATE_LOCAL !== "false";
  let pipe = null, loading = null, cache = null, saveTimer = null, chain = Promise.resolve();

  async function loadCache() {
    if (cache) return;
    try { cache = JSON.parse(await readFile(CACHE_FILE, "utf8")); } catch { cache = {}; }
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await mkdir(MODELS, { recursive: true });
      await writeFile(CACHE_FILE, JSON.stringify(cache)).catch(() => {});
    }, 2000);
  }

  async function model() {
    if (pipe) return pipe;
    if (!loading) {
      loading = (async () => {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.cacheDir = MODELS;
        // only use the copy already on disk once it has been downloaded
        // (per model, not the global env switch, which would also block the speech model's first download)
        const local = existsSync(path.join(MODELS, ...MODEL.split("/")));
        pipe = await pipeline("translation", MODEL, { dtype: "q8", local_files_only: local });
        return pipe;
      })().catch((e) => { loading = null; throw e; });
    }
    return loading;
  }

  /** Translate one piece of text into language `lang` (our codes: en, hi, ta …). Returns the original on failure. */
  async function translate(text, lang) {
    const tgt = CODES[lang];
    const src = sourceOf(text);
    if (!on || !tgt || !text.trim()) return text;
    let out = text;
    if (src !== tgt) {
      await loadCache();
      const key = createHash("sha1").update(`${src}>${tgt}|${text}`).digest("hex");
      if (cache[key]) out = cache[key];
      else {
        // one translation at a time; each one keeps background reading paused
        out = await (chain = chain.then(async () => {
          onBusy();
          const tr = await model();
          const [r] = await tr(text, { src_lang: src, tgt_lang: tgt, max_length: 400 });
          return r?.translation_text?.trim() || text;
        }).catch(() => text));
        if (out !== text) { cache[key] = out; saveSoon(); }
      }
    }
    return lang === "hinglish" ? toRoman(out) : out;
  }

  const warm = () => { if (on) setTimeout(() => model().catch(() => {}), 5000); };
  return { translate, warm, enabled: on, needsTranslation: (text, lang) => on && !!CODES[lang] && sourceOf(text) !== CODES[lang] };
}
