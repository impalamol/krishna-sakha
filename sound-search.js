// KRISHNA SAKHA — cross-language "sounds-alike" search keys.
//
// Most books in the library are in Hindi (Devanagari). A question in English ("neti", "kundalini"), Tamil
// (குண்டலினி), Bengali, Marathi… shares no WORDS with them, but it shares the SOUNDS of the Sanskrit terms that
// all Indian languages use. So both the question and the books are turned into a loose sound key:
//   1. any Indian script -> Devanagari (the Unicode blocks share one layout: Tamil = Devanagari + 0x280, etc.)
//   2. Roman letters -> Devanagari (simple phonetic transliteration: "dhauti" -> धौति)
//   3. the loose key ignores what scripts and spellers disagree on: long/short vowels, aspiration (ध = द),
//      retroflex/dental (ड = द), voiced/unvoiced (Tamil has one letter for k/g), श/ष/स, व/ब.
// Then "kundalini", குண்டலினி and कुण्डलिनी all become the same key.

// first code point of each Brahmic block (same internal layout as Devanagari)
const BLOCKS = [0x0980, 0x0A00, 0x0A80, 0x0B00, 0x0B80, 0x0C00, 0x0C80, 0x0D00];

/** Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam letters -> Devanagari */
export function toDeva(text) {
  return String(text).replace(/[ঀ-ൿ]/g, (ch) => {
    const c = ch.charCodeAt(0);
    const base = BLOCKS.findLast((b) => c >= b);
    const d = c - base + 0x0900;
    if (base === 0x0A00 && c === 0x0A70) return "ं";      // Gurmukhi tippi -> anusvara
    if (base === 0x0A00 && c === 0x0A71) return "";            // Gurmukhi addak (doubling)
    if (c === 0x0B9A) return "स";                              // Tamil ச: mostly "s" (சக்தி = शक्ति)
    if (base === 0x0D00 && c >= 0x0D7A && c <= 0x0D7F) return ["ण", "न", "र", "ल", "ळ", "क"][c - 0x0D7A] + "्"; // Malayalam chillu
    return String.fromCharCode(d);
  });
}

// Roman -> Devanagari, longest match first. Consonants carry an inherent "a" (dropped at word end).
const CONS = [["ksh", "क्ष"], ["gya", "ज्ञ"], ["jny", "ज्ञ"], ["chh", "छ"], ["kh", "ख"], ["gh", "घ"], ["ch", "च"], ["jh", "झ"],
  ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"], ["sh", "श"], ["ng", "ङ"], ["k", "क"], ["g", "ग"], ["c", "क"], ["j", "ज"],
  ["t", "त"], ["d", "द"], ["n", "न"], ["p", "प"], ["f", "फ"], ["b", "ब"], ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"],
  ["v", "व"], ["w", "व"], ["s", "स"], ["h", "ह"], ["z", "ज"], ["q", "क"], ["x", "क्स"]];
const VOW = [["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"], ["ee", "ई", "ी"], ["ii", "ई", "ी"], ["oo", "ऊ", "ू"], ["uu", "ऊ", "ू"],
  ["ri", "ऋ", "ृ"], ["a", "अ", ""], ["i", "इ", "ि"], ["u", "उ", "ु"], ["e", "ए", "े"], ["o", "ओ", "ो"]];

export function romanToDeva(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, "");
  let out = "", i = 0, afterCons = false;
  while (i < w.length) {
    const v = VOW.find(([r]) => w.startsWith(r, i));
    // "ri" is a vowel only after a consonant-less start or a consonant ("rishi" -> ऋषि); otherwise it is र + ि
    if (v && !(v[0] === "ri" && i === 0 && false)) {
      out += afterCons ? v[2] : v[1];
      i += v[0].length; afterCons = false; continue;
    }
    const c = CONS.find(([r]) => w.startsWith(r, i));
    if (c) {
      if (afterCons) out += "्";                                  // consonant cluster
      out += c[1]; i += c[0].length; afterCons = true; continue;
    }
    i++;
  }
  return out;
}

/** loose sound key of Devanagari text (applied to both the books and the question) */
export function soundFold(deva) {
  return String(deva)
    .replace(/[़ँ]/g, (m) => (m === "ँ" ? "ं" : ""))   // nukta, chandrabindu
    .replace(/[ङञणनम]्(?=[क-ह])/g, "ं")                              // nasal + consonant -> anusvara
    .replace(/[आ]/g, "अ").replace(/[ई]/g, "इ").replace(/[ऊ]/g, "उ").replace(/[ऐ]/g, "ए").replace(/[औ]/g, "ओ").replace(/ऋ/g, "रि")
    .replace(/ा/g, "").replace(/ी/g, "ि").replace(/ू/g, "ु").replace(/ै/g, "े").replace(/ौ/g, "ो").replace(/ृ/g, "ि")
    .replace(/[खग घ]/g, "क").replace(/[छजझ]/g, "च").replace(/[टठडढतथदध]/g, "त").replace(/[फबभव]/g, "प")
    .replace(/[शष]/g, "स").replace(/[णऩ]/g, "न").replace(/[ळऴ]/g, "ल").replace(/[ऱ]/g, "र").replace(/य़/g, "य")
    .replace(/[ॅॉ]/g, "").replace(/्/g, "")                          // vowel marks Tamil/Malayalam lack, and virama
    .replace(/(म्?|ं)(?=[\s.,;:!?।॥]|$)/g, "");                       // "-am" ending of Tamil/Telugu/Malayalam ("தியானம்", "ధ్యానం")
}

/** a question -> sound-key search words (from every script, and Roman words transliterated) */
export function soundTerms(q, stop = new Set()) {
  const words = String(q).toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !stop.has(w));
  const out = [];
  for (const w of words) {
    const deva = /[a-z]/.test(w) ? romanToDeva(w) : toDeva(w);
    let k = soundFold(deva).replace(/[^ऀ-ॿ]/g, "");
    if ([...k].length < 3) continue;                                   // too short to tell apart
    // light stemming: Marathi भटकले and Hindi भटकना share the root "भटक"
    const chars = [...k];
    if (chars.length >= 6) k = chars.slice(0, -2).join(""); else if (chars.length >= 5) k = chars.slice(0, -1).join("");
    out.push(k);
  }
  return [...new Set(out)].slice(0, 10);
}
