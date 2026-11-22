// IAST (the scholarly Roman spelling of Sanskrit, used by GRETIL) -> Devanagari, letter for letter.
// "agnim īḻe purohitaṁ" -> "अग्निम् ईळे पुरोहितं". Accent marks are dropped; GRETIL's
// verse markers ("/", "//", "|", "||") become danda "।" and double danda "॥".

const VOWELS = [ // [iast, independent letter, vowel sign after a consonant]
  ["ai", "ऐ", "ै"], ["au", "औ", "ौ"], ["ā", "आ", "ा"], ["ī", "ई", "ी"], ["ū", "ऊ", "ू"], ["ṝ", "ॠ", "ॄ"], ["ḹ", "ॡ", "ॣ"],
  ["ṛ", "ऋ", "ृ"], ["ḷ", "ऌ", "ॢ"], ["a", "अ", ""], ["i", "इ", "ि"], ["u", "उ", "ु"], ["e", "ए", "े"], ["o", "ओ", "ो"],
  ["ï", "इ", "ि"], ["ü", "उ", "ु"], // a diaeresis marks a separate vowel: "praüga" = pra + uga
];
const CONSONANTS = [
  ["kh", "ख"], ["gh", "घ"], ["ch", "छ"], ["jh", "झ"], ["ṭh", "ठ"], ["ḍh", "ढ"], ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"],
  ["ḻh", "ळ्ह"], ["k", "क"], ["g", "ग"], ["ṅ", "ङ"], ["c", "च"], ["j", "ज"], ["ñ", "ञ"], ["ṭ", "ट"], ["ḍ", "ड"], ["ṇ", "ण"],
  ["t", "त"], ["d", "द"], ["n", "न"], ["p", "प"], ["b", "ब"], ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"],
  ["ś", "श"], ["ṣ", "ष"], ["s", "स"], ["h", "ह"], ["ḻ", "ळ"], ["f", "फ़"], ["z", "ज़"], ["q", "क़"], ["w", "व"], ["x", "क्ष"],
];
const MARKS = [["m̐", "ँ"], ["ṃ", "ं"], ["ṁ", "ं"], ["ḥ", "ः"], ["ẖ", "ᳵ"], ["ḫ", "ᳶ"], ["'", "ऽ"], ["’", "ऽ"]];
const VIRAMA = "्";

// longest spelling first, so "kh" wins over "k" and "ai" over "a"
const TABLE = [
  ...MARKS.map(([s, d]) => ({ s, d, kind: "mark" })),
  ...VOWELS.map(([s, ind, sign]) => ({ s, ind, sign, kind: "vowel" })),
  ...CONSONANTS.map(([s, d]) => ({ s, d, kind: "cons" })),
].sort((a, b) => b.s.length - a.s.length);

/** Convert one stretch of IAST text to Devanagari. Non-letters (spaces, digits, punctuation) pass through. */
// join: GRETIL separates words even inside sandhi ("karmaṇy evādhikāras te"); printed Devanagari joins a word
// that ends in a consonant to the next one ("कर्मण्येवाधिकारस्ते"), which is also how people type and search it
export function iastToDeva(input, { join = true } = {}) {
  // drop the Vedic accent marks (acute, grave, and GRETIL's svarita/anudatta signs), keep the letters
  // (ś is "s + acute" when decomposed, so it is protected before the accents are removed; ḻ is "l + macron below")
  let s = String(input).normalize("NFC").toLowerCase().replace(/ś/g, "").replace(/ḻ/g, "");
  s = s.normalize("NFD").replace(/[̱̀́̂̍̎]/g, "").normalize("NFC")
    .replace(//g, "ś").replace(//g, "ḻ");
  // Vedic texts write the consonant ळ as "ḷ" too (agnim īḷe); before a vowel it is always that consonant,
  // the vowel ऌ (kḷpta) is never followed by a vowel
  s = s.replace(/ḷ(?=[aāiīuūṛṝeo])/g, "ḻ");
  let out = "", i = 0, pendingCons = false;
  const endCons = () => { if (pendingCons) { out += VIRAMA; pendingCons = false; } };
  while (i < s.length) {
    let hit = null;
    for (const t of TABLE) if (s.startsWith(t.s, i)) { hit = t; break; }
    if (!hit) {
      const ch = s[i];
      if (join && ch === " " && pendingCons && /[a-zāīūṛṝḷḹṅñṭḍṇśṣḻ]/.test(s[i + 1] || "")) { i++; continue; }
      endCons();
      if (ch === "/" || ch === "|") {
        const dbl = s[i + 1] === ch;
        out += dbl ? "॥" : "।"; i += dbl ? 2 : 1; continue;
      }
      out += ch; i++; continue;
    }
    if (hit.kind === "vowel") {
      if (pendingCons) { out += hit.sign; pendingCons = false; } else out += hit.ind;
    } else if (hit.kind === "cons") {
      if (pendingCons) out += VIRAMA;          // consonant cluster
      out += hit.d; pendingCons = true;
    } else {                                    // anusvara, visarga, candrabindu, avagraha
      if (hit.s === "'" || hit.s === "’") { endCons(); out += hit.d; }
      else { pendingCons = false; out += hit.d; }
    }
    i += hit.s.length;
  }
  endCons();
  return out;
}

// A quick self-test: node scripts/corpus/iast.mjs
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("iast.mjs")) {
  const cases = [
    ["agnim īḻe purohitaṁ yajñasya devam ṛtvijam", "अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम्"],
    ["dharmakṣetre kurukṣetre samavetā yuyutsavaḥ", "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः"],
    ["māmakāḥ pāṇḍavāś caiva kim akurvata sañjaya", "मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय"],
    ["sa devām̐ eha vakṣati", "स देवाँ एह वक्षति"],
    ["namas te 'stu brahman", "नमस्ते ऽस्तु ब्रह्मन्"],
    ["om ity etad akṣaram udgīthaḥ |", "ओमित्येतदक्षरमुद्गीथः ।"],
    ["tejovārimṛdāṃ yathā vinimayo", "तेजोवारिमृदां यथा विनिमयो"],
    ["kṛṣṇadvaipāyano muniḥ //", "कृष्णद्वैपायनो मुनिः ॥"],
  ];
  let bad = 0;
  for (const [a, want] of cases) { const got = iastToDeva(a); if (got !== want) { bad++; console.log("✗", a, "\n  got ", got, "\n  want", want); } }
  console.log(bad ? `${bad} failed` : `all ${cases.length} conversions correct`);
}
