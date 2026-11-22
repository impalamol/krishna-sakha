// KRISHNA SAKHA — English spoken into a Hindi/Marathi microphone.
// When the browser's speech recogniser is set to Hindi or Marathi and someone speaks ENGLISH, it writes the English
// words in Devanagari: "टेल मी हाउ यू गेन सर्च" (= "tell me how you gain such"). Nothing downstream can understand
// that as Hindi. This turns such a sentence back into English words. It only acts when most words are English
// words in Devanagari and at least two are unmistakably English, so real Hindi or Marathi is never touched.

const WORDS = {
  // unmistakably English (never Hindi/Marathi words)
  "टेल": "tell", "हाउ": "how", "हाऊ": "how", "व्हाट": "what", "वॉट": "what", "व्हाट्स": "what's", "अबाउट": "about", "अबाऊट": "about",
  "प्लीज": "please", "प्लीज़": "please", "एक्सप्लेन": "explain", "व्हाई": "why", "वाय": "why", "व्हेन": "when", "वेन": "when",
  "व्हेयर": "where", "वेयर": "where", "युवर": "your", "योर": "your", "यॉर": "your", "यूअर": "your", "सेल्फ": "self", "योरसेल्फ": "yourself",
  "युवरसेल्फ": "yourself", "थैंक": "thank", "थैंक्स": "thanks", "थैंक्यू": "thank you", "हेलो": "hello", "हैलो": "hello", "गुड": "good",
  "मॉर्निंग": "morning", "इवनिंग": "evening", "नाइट": "night", "गेन": "gain", "गेंड": "gained", "लर्न": "learn", "लर्नड": "learned",
  "नॉलेज": "knowledge", "मीनिंग": "meaning", "स्टोरी": "story", "बुक": "book", "बुक्स": "books", "रीड": "read", "स्पीक": "speak",
  "इंग्लिश": "English", "आंसर": "answer", "क्वेश्चन": "question", "गिव": "give", "वांट": "want", "नीड": "need", "हेल्प": "help",
  "डिड": "did", "डज": "does", "डज़": "does", "कैन": "can", "कॅन": "can", "कुड": "could", "विल": "will", "वुड": "would", "आर": "are",
  "वाज": "was", "वाज़": "was", "दिस": "this", "दैट": "that", "दीज": "these", "देयर": "there", "हियर": "here", "थिंक": "think",
  "नो": "know", "डू": "do", "डोंट": "don't", "इज": "is", "इज़": "is", "द": "the", "ऑफ": "of", "ऑफ़": "of", "एंड": "and", "ऐंड": "and",
  "विद": "with", "फ्रॉम": "from", "फॉर": "for", "टू": "to", "इन": "in", "ऑन": "on", "एट": "at", "यू": "you", "आई": "I", "माय": "my",
  "मी": "me", "ही": "he", "शी": "she", "वी": "we", "दे": "they", "हिम": "him", "हर": "her", "इट": "it", "सच": "such", "सर्च": "such",
  "सो": "so", "मच": "much", "मेनी": "many", "मोर": "more", "ऑल": "all", "एवरीथिंग": "everything", "समथिंग": "something",
  "लाइफ": "life", "लव": "love", "गॉड": "God", "पीस": "peace", "हैप्पी": "happy", "सैड": "sad", "वर्क": "work", "डे": "day",
  "मेडिटेशन": "meditation", "मेडिटेट": "meditate", "योगा": "yoga", "कर्मा": "karma", "धर्मा": "dharma", "गीता": "Gita",
  "नेम": "name", "हू": "who", "व्हिच": "which", "हाउ'स": "how's", "बी": "be", "बिकम": "become", "गेट": "get", "गॉट": "got",
  "सम": "some", "एनी": "any", "वन": "one", "टाइम": "time", "प्रे": "pray", "प्रेयर": "prayer", "वर्शिप": "worship",
  "चैप्टर": "chapter", "चॅप्टर": "chapter", "वर्स": "verse", "श्लोका": "shloka", "नंबर": "number", "फर्स्ट": "first", "सेकंड": "second",
  "थर्ड": "third", "थ्री": "three", "फोर": "four", "फाइव": "five", "सिक्स": "six", "सेवन": "seven", "एट्थ": "eighth", "टेन": "ten",
};
const NUM = { one: 1, to: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };
// words that are ALSO everyday Hindi/Marathi (मी = "I" in Marathi, नो, दे, हर, इन, सो, सम, वन, ही …): they count
// only when the sentence is already clearly English
const SHARED = new Set(["मी", "नो", "दे", "हर", "इन", "सो", "सम", "वन", "ही", "डे", "बी", "द", "आर", "इट", "सच", "गीता", "कर्मा", "योगा", "धर्मा", "डू", "टू"]);

export function englishFromDevanagari(text) {
  const s = String(text || "").trim();
  if (!/[ऀ-ॿ]/.test(s) || /[A-Za-z]{3}/.test(s)) return null;
  const words = s.split(/\s+/).map((w) => w.replace(/[?!.,।॥"'“”]+$/g, "").replace(/^["'“”]+/, "")).filter(Boolean);
  if (words.length < 3) return null;
  const known = words.filter((w) => WORDS[w] !== undefined);
  const sure = known.filter((w) => !SHARED.has(w));
  if (sure.length < 2 || known.length / words.length < 0.6) return null;
  const out = words.map((w) => WORDS[w] ?? w).join(" ")
    .replace(/\b(chapter|verse|number|shloka) (one|to|two|three|four|five|six|seven|ten)\b/g, (m, a, n) => `${a} ${NUM[n]}`);
  return out.charAt(0).toUpperCase() + out.slice(1) + (/[?]\s*$/.test(s) ? "?" : "");
}
