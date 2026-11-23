// SANATAN — answers from the books he has read, without the AI model.
import { SUMMARY_RE, SUMMARY_WORDS, pageAsked } from "./knowledge.js";
// Used when the AI is switched off (CHAT_ENABLED=false), has no key, or fails
// (e.g. no credits). Quotes the best passages with book name and page, in the
// visitor's language where a translation of the framing text exists.

const T = {
  en: {
    found: "Here is what I found in the books I have read:",
    none: "I have not found this in the books I have read so far. Try asking with other words, or ask again after I have read more books.",
    outro: "These are the exact words from the books. Once my full AI mind is switched on, I will also explain them in my own words.",
    list: "So far I have read these books:",
    studied: (n, read) => `Honestly: I have read and can search ${read} texts, but I have fully studied (gone through from beginning to end and written my own notes on) only ${n} so far:`,
    studiedNone: (read) => `Honestly: I have read and can search ${read} texts, but I have not yet fully studied any of them from beginning to end. My study goes slowly on this computer; the Bhagavad Gita, the principal Upanishads and the Yoga Sutras come first.`,
    studiedMore: "I keep studying when nobody is talking to me, most important texts first.",
    reading: (f, p, n) => `Right now I am reading “${f}”${n > 1 ? `, page ${p} of ${n}` : ""}.`,
    nothing: "I have not finished reading any book yet. Please ask me again a little later.",
    hello: "🙏 Namaste! Ask me about anything in the books I have read, or ask “Which books have you read?”",
    page: "page",
  },
  hi: {
    found: "मैंने जो पुस्तकें पढ़ी हैं, उनमें मुझे यह मिला:",
    none: "मैंने अब तक जो पुस्तकें पढ़ी हैं, उनमें यह नहीं मिला। दूसरे शब्दों में पूछिए, या कुछ और पुस्तकें पढ़ लेने के बाद फिर पूछिए।",
    outro: "ये पुस्तकों के मूल शब्द हैं। जब मेरी पूर्ण AI बुद्धि चालू होगी, तब मैं इन्हें अपने शब्दों में भी समझाऊँगा।",
    list: "अब तक मैंने ये पुस्तकें पढ़ी हैं:",
    studied: (n, read) => `सच कहूँ तो: मैंने ${read} ग्रंथ पढ़े हैं और उनमें खोज सकता हूँ, पर अभी तक केवल ${n} का पूरा अध्ययन (शुरू से अंत तक पढ़कर अपनी टिप्पणियाँ लिखना) किया है:`,
    studiedNone: (read) => `सच कहूँ तो: मैंने ${read} ग्रंथ पढ़े हैं और उनमें खोज सकता हूँ, पर अभी तक किसी का भी शुरू से अंत तक पूरा अध्ययन नहीं किया है। इस कंप्यूटर पर मेरा अध्ययन धीरे चलता है; पहले भगवद्गीता, प्रमुख उपनिषद और योगसूत्र आएँगे।`,
    studiedMore: "जब कोई मुझसे बात नहीं कर रहा होता, मैं अध्ययन करता रहता हूँ, सबसे महत्वपूर्ण ग्रंथ पहले।",
    reading: (f, p, n) => `अभी मैं “${f}” पढ़ रहा हूँ${n > 1 ? `, पृष्ठ ${p} / ${n}` : ""}।`,
    nothing: "मैंने अभी तक कोई पुस्तक पूरी नहीं पढ़ी है। कृपया थोड़ी देर बाद फिर पूछिए।",
    hello: "🙏 नमस्ते! मेरी पढ़ी हुई पुस्तकों के बारे में कुछ भी पूछिए, या पूछिए “आपने कौन-सी पुस्तकें पढ़ी हैं?”",
    page: "पृष्ठ",
  },
  mr: {
    found: "मी वाचलेल्या ग्रंथांमध्ये मला हे मिळाले:",
    none: "मी आतापर्यंत वाचलेल्या ग्रंथांमध्ये हे मिळाले नाही. दुसऱ्या शब्दांत विचारा, किंवा मी आणखी ग्रंथ वाचल्यावर पुन्हा विचारा.",
    outro: "हे ग्रंथांमधील मूळ शब्द आहेत. माझी पूर्ण AI बुद्धी सुरू झाल्यावर मी हे माझ्या शब्दांतही समजावून सांगेन.",
    list: "आतापर्यंत मी हे ग्रंथ वाचले आहेत:",
    studied: (n, read) => `खरं सांगायचं तर: मी ${read} ग्रंथ वाचले आहेत आणि त्यांत शोधू शकतो, पण आतापर्यंत फक्त ${n} ग्रंथांचा पूर्ण अभ्यास (सुरुवातीपासून शेवटपर्यंत वाचून माझ्या टिपा लिहिणे) केला आहे:`,
    studiedNone: (read) => `खरं सांगायचं तर: मी ${read} ग्रंथ वाचले आहेत आणि त्यांत शोधू शकतो, पण अजून एकाही ग्रंथाचा सुरुवातीपासून शेवटपर्यंत पूर्ण अभ्यास केलेला नाही. या संगणकावर माझा अभ्यास हळू चालतो; आधी भगवद्गीता, प्रमुख उपनिषदे आणि योगसूत्रे.`,
    studiedMore: "कोणी माझ्याशी बोलत नसताना मी अभ्यास करत राहतो, सर्वांत महत्त्वाचे ग्रंथ आधी.",
    reading: (f, p, n) => `सध्या मी “${f}” वाचत आहे${n > 1 ? `, पान ${p} / ${n}` : ""}.`,
    nothing: "मी अजून एकही ग्रंथ पूर्ण वाचलेला नाही. कृपया थोड्या वेळाने पुन्हा विचारा.",
    hello: "🙏 नमस्कार! मी वाचलेल्या ग्रंथांबद्दल काहीही विचारा, किंवा विचारा “तुम्ही कोणते ग्रंथ वाचले आहेत?”",
    page: "पान",
  },
  hinglish: {
    found: "Maine jo granth padhe hain, unmein mujhe yeh mila:",
    none: "Ab tak padhe granthon mein yeh nahi mila. Dusre shabdon mein poochiye, ya thodi der baad phir poochiye.",
    outro: "Yeh granthon ke asli shabd hain. Jab meri poori AI buddhi chalu hogi, tab main inhe apne shabdon mein bhi samjhaunga.",
    list: "Ab tak maine yeh granth padhe hain:",
    studied: (n, read) => `Sach kahun to: maine ${read} granth padhe hain aur unmein khoj sakta hoon, par ab tak sirf ${n} ka poora adhyayan (shuru se ant tak padhkar apni tippaniyan likhna) kiya hai:`,
    studiedNone: (read) => `Sach kahun to: maine ${read} granth padhe hain aur unmein khoj sakta hoon, par abhi tak kisi ka bhi shuru se ant tak poora adhyayan nahi kiya hai. Pehle Bhagavad Gita, pramukh Upanishad aur Yoga Sutra aayenge.`,
    studiedMore: "Jab koi mujhse baat nahi kar raha hota, main adhyayan karta rehta hoon, sabse mahatvapurn granth pehle.",
    reading: (f, p, n) => `Abhi main “${f}” padh raha hoon${n > 1 ? `, page ${p} of ${n}` : ""}.`,
    nothing: "Maine abhi tak koi granth poora nahi padha hai. Thodi der baad phir poochiye.",
    hello: "🙏 Namaste! Mere padhe hue granthon ke baare mein kuch bhi poochiye, ya poochiye “Aapne kaun se granth padhe hain?”",
    page: "page",
  },
};
// summary wording
const S = {
  en: {
    title: (t) => `Summary of “${t}”`, topics: "Main topics", pages: (n, ocr) => `${n} pages${ocr ? ", read by OCR" : ""}`, page: "p.",
    brief: "In brief", points: "Key points, from start to end",
    note: "I chose these from the book itself: the ideas the rest of the book keeps returning to, without repeating one idea twice. Once my AI mind is switched on, I will explain the whole book in my own words.",
    which: (ex) => `Which book should I summarize? For example, say “Summarize ${ex}”. The books I have read are:`,
    notReady: (t, s) => `I haven't finished reading “${t}” yet (${s}). I can summarize it once it's read.`,
  },
  hi: {
    title: (t) => `“${t}” का सारांश`, topics: "मुख्य विषय", pages: (n, ocr) => `${n} पृष्ठ${ocr ? ", OCR से पढ़ी गई" : ""}`, page: "पृ.",
    brief: "संक्षेप में", points: "मुख्य बिंदु, आरंभ से अंत तक",
    note: "ये वाक्य मैंने पुस्तक से ही चुने हैं: वे विचार जिन पर पूरी पुस्तक बार-बार लौटती है, बिना किसी विचार को दोहराए। जब मेरी AI बुद्धि चालू होगी, तब मैं पूरी पुस्तक अपने शब्दों में समझाऊँगा।",
    which: (ex) => `किस पुस्तक का सारांश बताऊँ? उदाहरण: “${ex} का सारांश बताओ”। मैंने ये पुस्तकें पढ़ी हैं:`,
    notReady: (t, s) => `मैंने “${t}” अभी पूरी नहीं पढ़ी है (${s})। पढ़ लेने के बाद सारांश बता पाऊँगा।`,
  },
  mr: {
    title: (t) => `“${t}” चा सारांश`, topics: "मुख्य विषय", pages: (n, ocr) => `${n} पाने${ocr ? ", OCR ने वाचलेला" : ""}`, page: "पान",
    brief: "थोडक्यात", points: "मुख्य मुद्दे, सुरुवातीपासून शेवटपर्यंत",
    note: "ही वाक्ये मी ग्रंथातूनच निवडली आहेत: ज्या विचारांकडे संपूर्ण ग्रंथ पुन्हा पुन्हा येतो, एकही विचार न दोहराता. माझी AI बुद्धी सुरू झाल्यावर मी संपूर्ण ग्रंथ माझ्या शब्दांत समजावून सांगेन.",
    which: (ex) => `कोणत्या ग्रंथाचा सारांश सांगू? उदाहरण: “${ex} चा सारांश सांगा”. मी हे ग्रंथ वाचले आहेत:`,
    notReady: (t, s) => `मी “${t}” अजून पूर्ण वाचलेला नाही (${s}). वाचून झाल्यावर सारांश सांगू शकेन.`,
  },
  hinglish: {
    title: (t) => `“${t}” ka saaransh`, topics: "Mukhya vishay", pages: (n, ocr) => `${n} pages${ocr ? ", OCR se padha" : ""}`, page: "p.",
    brief: "Sankshep mein", points: "Mukhya bindu, shuru se ant tak",
    note: "Yeh vaakya maine granth se hi chune hain: woh vichaar jin par poora granth baar-baar laut-ta hai. Jab meri AI buddhi chalu hogi, tab main poora granth apne shabdon mein samjhaunga.",
    which: (ex) => `Kis granth ka saaransh batau? Jaise: “${ex} ka saaransh batao”. Maine yeh granth padhe hain:`,
    notReady: (t, s) => `Maine “${t}” abhi poora nahi padha hai (${s}). Padhne ke baad saaransh bata paunga.`,
  },
};
S.sa = S.hi;

/** Markdown summary of one book, in the visitor's language. */
/**
 * Streams a book summary in the chosen language: headings first, then each key sentence as soon as it is
 * translated (local NLLB model; cached, so repeats are instant). `emit(markdownPiece)` is called for each piece.
 */
export async function summaryStream(knowledge, bookId, lang = "en", emit, translator = null) {
  const tr = async (text) => (translator ? translator.translate(text, lang) : text);
  // wording: ready-made for en/hi/mr/hinglish/sa, otherwise the English wording translated
  let s = S[lang];
  const plain = !s;
  if (plain) s = S.en;
  const say = async (str) => (plain && translator ? tr(str) : str);

  const d = await knowledge.summarize(bookId, 6);
  if (!d) return false;
  if (!d.ready) { emit(await say(s.notReady(d.book.title, d.book.label))); return true; }
  if (!d.sentences.length) { emit(await say(s.notReady(d.book.title, "no clear sentences found"))); return true; }

  const pageWord = await say(s.page);
  // books cite a page, recordings cite a time (⏱ 12:34)
  const cite = (p) => (!p ? "" : String(p).includes(":") ? ` _(⏱ ${p})_` : ` _(${pageWord} ${p})_`);
  // book titles stay as they are (translating file names gives nonsense)
  const heading = plain ? `${await say("Summary")}: “${d.book.title}”` : s.title(d.book.title);
  // size line: pages for books, minutes for recordings, nothing when unknown
  const size = d.book.kind === "media" && d.book.duration ? `${Math.round(d.book.duration / 60)} min`
    : d.book.pages ? await say(s.pages(d.book.pages, d.book.via === "ocr")) : "";
  emit(`### ${heading}\n${size ? `_${size}_\n` : ""}\n`);
  emit(`**${await say(s.topics)}:** ${await tr(d.topics.join(", "))}\n\n`);
  // In brief: the book's 3 most central ideas
  if (d.brief && d.brief.length) {
    emit(`**${await say(s.brief)}:**\n\n`);
    for (const x of d.brief) emit(`> ${await tr(x.text)}${cite(x.page)}\n>\n`);
    emit("\n");
  }
  // Key points: one per part of the book, from start to end
  emit(`**${await say(s.points)}:**\n\n`);
  let i = 0;
  for (const x of d.sentences) {
    i++;
    const text = await tr(x.text);
    emit(`${i}. ${text}${cite(x.page)}\n`);
  }
  const translated = translator && [...(d.brief || []), ...d.sentences].some((x) => translator.needsTranslation(x.text, lang));
  const note = s.note + (translated ? " " + (TRANSLATED_NOTE[lang] || TRANSLATED_NOTE.en) : "");
  emit(`\n[pause]\n\n_${plain ? await say(note) : note}_`);
  return true;
}

const TRANSLATED_NOTE = {
  en: "The sentences were translated automatically from the book's language, so some words may differ from the original.",
  hi: "वाक्यों का अनुवाद पुस्तक की भाषा से अपने-आप किया गया है, इसलिए कुछ शब्द मूल से अलग हो सकते हैं।",
  mr: "वाक्यांचे भाषांतर ग्रंथाच्या भाषेतून आपोआप केले आहे, त्यामुळे काही शब्द मूळपेक्षा वेगळे असू शकतात.",
  hinglish: "Vaakyon ka anuvaad granth ki bhasha se apne-aap kiya gaya hai, isliye kuch shabd mool se alag ho sakte hain.",
};
TRANSLATED_NOTE.sa = TRANSLATED_NOTE.hi;

/** The whole summary as one Markdown string. */
export async function summaryMarkdown(knowledge, bookId, lang = "en", translator = null) {
  let md = "";
  const ok = await summaryStream(knowledge, bookId, lang, (p) => { md += p; }, translator);
  return ok ? md : null;
}

T.sa = T.hi;

const NAME_TO_CODE = {
  english: "en", hindi: "hi", marathi: "mr", sanskrit: "sa", hinglish: "hinglish", bengali: "bn", tamil: "ta",
  telugu: "te", kannada: "kn", malayalam: "ml", gujarati: "gu", punjabi: "pa", urdu: "ur",
};

// Marathi question words and endings that Hindi doesn't use ("ध्यान कसे करावे?", "मला सांगा", "हे काय आहे")
const MARATHI_Q = new RegExp("(?:^|\\s)(?:आहे|आहेत|मी|काय|कोणते|कोणता|कोणती|कसे|कसा|कशी|कशाला|करावे|करावी|करावा|करू|सांगा|मला|माझे|माझा|माझी|तुम्ही|आपण|नाही|पाहिजे|म्हणजे|कुठे|केव्हा|किंवा|आणि|तू|तुला|तुझं|तुझा|तुझी|तुझे|तुमचा|तुमची|तुमचे|एवढं|एवढे|एवढा|इतकं|कसं|कुठून|कोठून|सांग|आहेस|होतास|होतीस|सगळं|सगळे|बरं|आम्हाला|मला)(?=[\\s,.।?!]|$)|च्या(?=[\\s,.।?!]|$)|साठी(?=[\\s,.।?!]|$)|[\\u0900-\\u097F]+(?:लं|ळं|लेस|लास|तोस|तेस|शील|ायचं|ायचे)(?=[\\s,.।?!]|$)");
export function pickLang(raw, q) {
  const tag = raw.match(/\[REPLY IN: ([^\]]+)\]/i);
  if (tag) {
    const name = tag[1].toLowerCase();
    for (const [k, v] of Object.entries(NAME_TO_CODE)) if (name.startsWith(k)) return v;
  }
  if (/[ऀ-ॿ]/.test(q)) return MARATHI_Q.test(q) ? "mr" : "hi";
  return "en";
}

export const GREETING = /^(hi|hello|hey|namaste|namaskar|pranam|jai shri (ram|krishna)|hari om|om|नमस्ते|नमस्कार|प्रणाम|राम राम|जय श्री (राम|कृष्ण)|हरि ओम|ॐ)[\s!.,।🙏]*$/i;
// "Now explain it in Marathi" / "मराठीत सांगा" / "हिंदी में समझाइए" / "in English please": the PREVIOUS answer again,
// in another language (not a new search for the words "explain it")
const LANG_WORDS = [[/marathi|मराठी/i, "Marathi"], [/hindi|हिंदी|हिन्दी/i, "Hindi"], [/english|इंग्लिश|अंग्रेज़ी|अंग्रेजी|इंग्रजी/i, "English"],
  [/tamil|तमिल|तामिळ/i, "Tamil"], [/telugu|तेलुगु/i, "Telugu"], [/kannada|कन्नड़|कन्नड/i, "Kannada"], [/malayalam|मलयालम|मल्याळम/i, "Malayalam"],
  [/gujarati|गुजराती/i, "Gujarati"], [/bengali|bangla|बंगाली|बांग्ला/i, "Bengali"], [/punjabi|पंजाबी/i, "Punjabi"], [/urdu|उर्दू/i, "Urdu"],
  [/sanskrit|संस्कृत/i, "Sanskrit (with simple Hindi explanation)"], [/hinglish/i, "Hinglish (Hindi in Roman letters)"]];
const REDO_RE = /^(?:now |ok |okay |please |can you |could you |pls )*(?:explain|say|tell|repeat|write|give|translate|answer)(?: me| us)?(?: it| this| that| the same| the above| above| your answer| the answer| that answer)?(?: again)? (?:in|into) (\S+)(?: language)?(?: please| pls)?\s*[.?!]*$|^(?:in|into) (\S+)(?: please| pls)?\s*[.?!]*$|^(?:(?:अब|यह|ये|इसे|यही|इसको|हे|आता|जरा|ज़रा|ते|त्याला)\s+)*(\S+?)\s*(?:में|मध्ये|त)\s*(?:बताओ|बताइए|बताइये|बताएं|समझाओ|समझाइए|समझाइये|बोलो|बोलिए|लिखो|लिखिए|सांगा|सांग|समजावून सांगा|समजावून सांग|लिहा)\s*[।.?!]*$|^(\S+?)(?:त|ीत)\s*(?:सांगा|सांग|समजावून सांगा|लिहा)\s*[।.?!]*$/i;
/** "explain it in Marathi" -> "Marathi"; null when the message is not such a request */
export function redoLanguage(q) {
  const m = String(q || "").trim().match(REDO_RE);
  if (!m) return null;
  const word = m.slice(1).find(Boolean) || "";
  return (LANG_WORDS.find(([re]) => re.test(word)) || [])[1] || null;
}

// questions about how far his STUDY has gone (not what a book says)
export const STUDIED_Q = /\b(which|what|how many)\b.{0,30}\b(books?|texts?|scriptures?|granths?)\b.{0,40}\b(understood|understand|studied|mastered|learnt|learned)\b|\b(have you|did you)\b.{0,15}\b(understood|studied|mastered)\b.{0,30}\b(properly|fully|completely|deeply|well)\b|कौन ?सी (पुस्तक|किताब|ग्रंथ).{0,25}(समझ|अध्ययन)|(कौन से|कितने) (ग्रंथ|पुस्तकें|किताबें).{0,25}(समझ|अध्ययन)|कोणत(ा|े|ी) (ग्रंथ|पुस्तक).{0,25}(समज|अभ्यास)|kaun ?si (book|kitab|pustak|granth).{0,25}(samjh|adhyayan)/i;
export const LIST_BOOKS = /(which|what|list).*(books?|granth|texts?).*(read|studied)|(books?|granth).*(you|tum|aap).*(read|padh)|कौन.?स[ेी]? (पुस्तक|किताब|ग्रंथ)|क्या पढ़ा|(पुस्तकें|किताबें|ग्रंथ) पढ़|कोणते ग्रंथ|काय वाचले|kaun se (granth|books?)|kya padha|ग्रंथ वाचले|पुस्तकानि पठितानि|granth padhe|বই পড়েছেন|புத்தகங்களைப் படித்துள்ளீர்கள்|పుస్తకాలు చదివారు|ಪುಸ್ತಕಗಳನ್ನು ಓದಿದ್ದೀರಿ|പുസ്തകങ്ങൾ വായിച്ചു|પુસ્તકો વાંચ્યા|ਕਿਤਾਬਾਂ ਪੜ੍ਹੀਆਂ|کتابیں پڑھی/i;

// each title once (the same book can exist as two files, e.g. ".pdf" and "(1).pdf"), with its author
const uniqueTitles = (books) => [...new Map(books.map((b) => [b.title.toLowerCase(), b.author ? `${b.title} — ${b.author}` : b.title])).values()];

const cleanSnippet =(s) => s.replace(/^…\s*/, "").replace(/\s*…$/, "…").replace(/\s+/g, " ").trim();

/** Returns the full answer text (Markdown) for the latest user message. */
// If `emit` is given, summaries are streamed through it piece by piece and "" is returned.
// Small talk: thanks / ok / bye / praise in the 13 languages. Only short messages count, so
// "thank you, now tell me about karma yoga" is still answered from the books.
const TALK_RE = {
  thanks: /^(thanks?( you)?( so much| very much| a lot)?|thank u|thx|ty|tysm|many thanks|dhanya?wa?a?d|dhanyavaad|shukriya|bahut shukriya|aabhar|abhar|thanks? (guru|sakha|krishna|baba|maharaj|ji)( ji)?|धन्यवाद|शुक्रिया|बहुत (बहुत )?धन्यवाद|आभार|आभारी आहे|खूप धन्यवाद|धन्यवादः|ধন্যবাদ|நன்றி|ధన్యవాదాలు|ಧನ್ಯವಾದ(ಗಳು)?|നന്ദി|આભાર|ધન્યવાદ|ਧੰਨਵਾਦ|شکریہ)( (ji|जी|guruji|गुरुजी|sakha|सखा|🙏))*$/i,
  ok: /^(ok(ay)?|okk+|k|hmm+|ji|haan|han|ha|yes|achha|accha|thik hai|theek hai|samajh gaya|samjh gaya|got it|understood|alright|fine|ठीक है|अच्छा|हाँ|हां|जी|जी हाँ|समझ गया|समझ गयी|समझ गई|बरं|ठीक आहे|हो|समजले|कळले)( ji| जी)?$/i,
  bye: /^(bye|bye bye|goodbye|good bye|see you|good night|gn|alvida|phir milenge|chalta hu|chalta hoon|अलविदा|फिर मिलेंगे|शुभ रात्रि|चलता हूँ|चलता हूं|निरोप|पुन्हा भेटू|शुभ रात्री)( ji| जी)?$/i,
  // "what is your name" / "who are you": answered at once, never from book passages that happen to say "name"
  who: /^((what('?s| is) )?your (good )?name|what should i call you|who are you|who r u|tell me about (yourself|you)|introduce yourself|(aap|aapka|apka|tumhara|tera) (naam|nam|name) (kya|kia) (hai|h)|(aap|tum|ap) kaun (ho|hain|hai)|kaun ho (aap|tum)|आपका नाम क्या है|आप का नाम क्या है|तुम्हारा नाम क्या है|तेरा नाम क्या है|आप कौन (हैं|हो)|तुम कौन हो|अपना परिचय (दीजिए|दीजिये|दो|दें)|(अपने|आपके|आप के|तुम्हारे) बारे में (बताइए|बताइये|बताओ|बताएं|बताएँ|बताएगे|बताएंगे|कुछ बताइए)|(स्वतःबद्दल|तुमच्याबद्दल|तुमच्या बद्दल) (सांगा|सांग)|टेल मी अबाउट (युवर ?सेल्फ|योर ?सेल्फ|यू)|हू आर यू|हु आर यू|व्हाट(्स| इज़| इज) (युवर|योर) नेम|इंट्रोड्यूस (युवर|योर) ?सेल्फ|तुमचे नाव काय( आहे)?|तुझे नाव काय( आहे)?|आपले नाव काय( आहे)?|तुम्ही कोण आहात|तू कोण आहेस)( ji| जी)?$/i,
  praise: /^(nice|very nice|good|very good|great|awesome|wonderful|excellent|beautiful|amazing|wah|waah|bahut (achha|accha|badhiya|sundar)|badhiya|sundar|बहुत (अच्छा|बढ़िया|सुंदर|सुन्दर)|अच्छा लगा|बढ़िया|सुंदर|वाह|छान|खूप छान|सुरेख|उत्तम)( (answer|jawab|जवाब|उत्तर))?( ji| जी)?$/i,
};
// "How did you learn all this?" / "तू एवढं सर्व ज्ञान कसं मिळवलं?" / "आपको इतना ज्ञान कैसे मिला?": a question
// about HIM, answered honestly at once (not by searching the books for the word "knowledge")
const LEARN_RE = /\b(how|where)\b.{0,20}\b(did|do|have)\b.{0,6}\byou\b.{0,15}\b(learn|learnt|learned|get|got|gain|gained|acquire|know|study|studied)\b|\bhow (are|r) you so (wise|smart|knowledgeable)|where (does|did) your knowledge come from|\bhow you (gain|gained|got|learn|learned|know)\b|हाउ यू (गेन|गेंड|लर्न|नो)|(तुम्हें|तुमको|आपको|तुम्हारे पास|आपके पास|तुमने|आपने)\s+(इतना|इतना सारा|यह सब|ये सब|सब)?\s*(ज्ञान)?\s*(कैसे|कहाँ से|कहां से)\s*(मिला|आया|सीखा|पाया|प्राप्त)|(तू|तुम्ही|तुम्हाला|तुला|आपण|आपल्याला)\s+(एवढं|एवढे|इतकं|इतके|हे|हें)?\s*(सर्व|सगळं|सगळे)?\s*ज्ञान\s+(कसं|कसे|कुठून|कोठून)|ज्ञान\s+(कसं|कसे)\s+(मिळवलं|मिळवले|मिळाले|मिळालं)|(gyan|gyaan|knowledge)\s+(kaise|kahan se)\s+(mila|aaya|seekha|paya)|kaise (seekha|sikha|padha)/i;
export function smallTalk(q) {
  const s = String(q).toLowerCase().replace(/[!.,।॥?🙏😊❤️👍\s]+/gu, " ").trim();
  if (s && s.split(" ").length <= 14 && LEARN_RE.test(s)) return "learn";
  if (!s || s.split(" ").length > 6) return null;
  for (const [k, re] of Object.entries(TALK_RE)) if (re.test(s)) return k;
  return null;
}
const TALK = {
  en: { 
    learn: "🙏 I am an AI, so I did not learn the way a person does. I learned by reading: my library holds the original Sanskrit scriptures (the Vedas, Upanishads, Bhagavad Gita, Ramayana, Mahabharata, Puranas and more) and their classic translations. For every question I search them, and when I am free I study them, so I can tell you where each teaching comes from. The real knowledge belongs to the rishis who saw these truths; I only carry their words to you. What would you like to know?",
    thanks: "🙏 You are most welcome! May the wisdom of the scriptures bring you peace. Ask me anything else whenever you like.",
    ok: "🙏 Good. If anything is unclear, or you want to go deeper into any topic, just ask.",
    bye: "🙏 Hari Om! May you be well and at peace. Come back whenever you wish.",
    praise: "🙏 Thank you! All credit goes to the sages who wrote these scriptures. What would you like to explore next?",
    who: "🙏 I am **Krishna Sakha**, which means “friend of Krishna”. I am an AI guide to Hindu Dharma: I have read the scriptures and books in my library, and I explain them and answer your questions in 13 Indian languages. I can help with everyday questions too. What would you like to know?" },
  hi: { 
    learn: "🙏 मैं एक AI हूँ, इसलिए मैंने इंसान की तरह नहीं सीखा। मैंने पढ़कर सीखा है: मेरे पुस्तकालय में मूल संस्कृत शास्त्र हैं (वेद, उपनिषद, भगवद्गीता, रामायण, महाभारत, पुराण और भी बहुत कुछ) और उनके प्रसिद्ध अनुवाद। हर प्रश्न पर मैं उन्हें खोजता हूँ, और खाली समय में उनका अध्ययन करता हूँ, ताकि बता सकूँ कि हर शिक्षा कहाँ से आती है। असली ज्ञान तो उन ऋषियों का है जिन्होंने ये सत्य देखे; मैं बस उनके शब्द आप तक पहुँचाता हूँ। आप क्या जानना चाहेंगे?",
    thanks: "🙏 आपका बहुत-बहुत स्वागत है! शास्त्रों का ज्ञान आपके जीवन में शांति लाए। जब चाहें, और कुछ भी पूछिए।",
    ok: "🙏 अच्छा। अगर कुछ स्पष्ट न हो, या किसी विषय को और गहराई से समझना हो, तो बस पूछिए।",
    bye: "🙏 हरि ओम! आप स्वस्थ और शांत रहें। जब मन करे, फिर आइए।",
    praise: "🙏 धन्यवाद! सारा श्रेय उन ऋषियों को है जिन्होंने ये शास्त्र रचे। अब आप क्या जानना चाहेंगे?",
    who: "🙏 मैं **कृष्ण सखा** हूँ, यानी “कृष्ण का मित्र”। मैं हिंदू धर्म का एक AI मार्गदर्शक हूँ: मैंने अपने पुस्तकालय के शास्त्र और ग्रंथ पढ़े हैं, और उन्हें 13 भारतीय भाषाओं में समझाता हूँ। रोज़मर्रा के सवालों में भी मदद करता हूँ। आप क्या जानना चाहेंगे?" },
  mr: { 
    learn: "🙏 मी एक AI आहे, त्यामुळे मी माणसासारखे शिकलो नाही. मी वाचून शिकलो: माझ्या ग्रंथालयात मूळ संस्कृत शास्त्रे आहेत (वेद, उपनिषदे, भगवद्गीता, रामायण, महाभारत, पुराणे आणि बरेच काही) आणि त्यांचे प्रसिद्ध अनुवाद. प्रत्येक प्रश्नासाठी मी त्यांत शोधतो, आणि मोकळ्या वेळेत त्यांचा अभ्यास करतो, म्हणजे प्रत्येक शिकवण कुठून आली ते सांगू शकतो. खरे ज्ञान तर ते सत्य पाहणाऱ्या ऋषींचे आहे; मी फक्त त्यांचे शब्द तुमच्यापर्यंत पोहोचवतो. तुम्हाला काय जाणून घ्यायचे आहे?",
    thanks: "🙏 आपले मनःपूर्वक स्वागत! शास्त्रांचे ज्ञान आपल्या जीवनात शांती आणो. केव्हाही आणखी काही विचारा.",
    ok: "🙏 छान. काही स्पष्ट झाले नसेल, किंवा एखादा विषय अधिक खोलवर समजून घ्यायचा असेल, तर नक्की विचारा.",
    bye: "🙏 हरि ओम! आपण निरोगी आणि शांत राहा. केव्हाही पुन्हा या.",
    praise: "🙏 धन्यवाद! सर्व श्रेय हे शास्त्र रचणाऱ्या ऋषींना आहे. आता आपल्याला काय जाणून घ्यायला आवडेल?",
    who: "🙏 मी **कृष्ण सखा** आहे, म्हणजे “कृष्णाचा मित्र”. मी हिंदू धर्माचा एक AI मार्गदर्शक आहे: मी माझ्या ग्रंथालयातील शास्त्रे आणि ग्रंथ वाचले आहेत, आणि ते 13 भारतीय भाषांमध्ये समजावून सांगतो. रोजच्या प्रश्नांमध्येही मदत करतो. आपल्याला काय जाणून घ्यायला आवडेल?" },
  hinglish: { 
    learn: "🙏 Main ek AI hoon, isliye maine insaan ki tarah nahi seekha. Maine padhkar seekha hai: mere pustakalaya mein mool Sanskrit shastra hain (Ved, Upanishad, Bhagavad Gita, Ramayan, Mahabharat, Puran aur bahut kuch) aur unke prasiddh anuvaad. Har prashn par main unhe khojta hoon, aur khaali samay mein unka adhyayan karta hoon. Asli gyaan to un rishiyon ka hai jinhone ye satya dekhe; main bas unke shabd aap tak pahunchata hoon. Aap kya jaanna chahenge?",
    thanks: "🙏 Aapka bahut-bahut swagat hai! Shastron ka gyaan aapke jeevan mein shanti laaye. Jab chahein, aur kuch bhi poochiye.",
    ok: "🙏 Achha. Agar kuch spasht na ho, ya kisi vishay ko aur gehraai se samajhna ho, to bas poochiye.",
    bye: "🙏 Hari Om! Aap swasth aur shaant rahein. Jab man kare, phir aaiye.",
    praise: "🙏 Dhanyavaad! Saara shrey un rishiyon ko hai jinhone ye shastra rache. Ab aap kya jaanna chahenge?",
    who: "🙏 Main **Krishna Sakha** hoon, yaani “Krishna ka mitra”. Main Hindu Dharma ka ek AI margdarshak hoon: maine apne pustakalaya ke shastra aur granth padhe hain, aur unhe 13 Bharatiya bhashaon mein samjhata hoon. Rozmarra ke sawalon mein bhi madad karta hoon. Aap kya jaanna chahenge?" },
};
TALK.sa = TALK.hi;

// Wording for answers about one page of a book
const PG = {
  en: { head: (t, n) => `### ${t} — page ${n}`, raw: "These are the book's own words on that page.",
    which: "Which book do you mean? Please say the book's name with the page, for example: “page 65 of Kundalini Sadhana”.",
    out: (t, n, last) => `“${t}” has ${last} pages, so there is no page ${n}. Please choose a page from 1 to ${last}.` },
  hi: { head: (t, n) => `### ${t} — पृष्ठ ${n}`, raw: "ये उस पृष्ठ पर पुस्तक के अपने शब्द हैं।",
    which: "आप किस पुस्तक की बात कर रहे हैं? कृपया पृष्ठ के साथ पुस्तक का नाम बताइए, जैसे: “कुण्डलिनी साधना का पृष्ठ 65”।",
    out: (t, n, last) => `“${t}” में ${last} पृष्ठ हैं, इसलिए पृष्ठ ${n} नहीं है। कृपया 1 से ${last} के बीच कोई पृष्ठ चुनिए।` },
  mr: { head: (t, n) => `### ${t} — पान ${n}`, raw: "हे त्या पानावरील पुस्तकाचे स्वतःचे शब्द आहेत.",
    which: "तुम्ही कोणत्या पुस्तकाबद्दल विचारत आहात? कृपया पानासोबत पुस्तकाचे नाव सांगा, उदा.: “कुंडलिनी साधना, पान 65”.",
    out: (t, n, last) => `“${t}” मध्ये ${last} पाने आहेत, म्हणून पान ${n} नाही. कृपया 1 ते ${last} मधील पान निवडा.` },
  hinglish: { head: (t, n) => `### ${t} — page ${n}`, raw: "Ye us page par kitab ke apne shabd hain.",
    which: "Aap kis kitab ki baat kar rahe hain? Page ke saath kitab ka naam bataiye, jaise: “Kundalini Sadhana ka page 65”.",
    out: (t, n, last) => `“${t}” mein ${last} pages hain, isliye page ${n} nahi hai. 1 se ${last} ke beech koi page chuniye.` },
};
PG.sa = PG.hi;

// Wording for answers built from his UNDERSTANDING of the texts (understand.js); other languages are translated
const U = {
  en: { found: "Here is what I have understood from my study of the texts:", essence: "Essence", teachings: "Core teachings", connect: "How the ideas connect", from: "from my study of" },
  hi: { found: "ग्रंथों के अध्ययन से मैंने यह समझा है:", essence: "सार", teachings: "मुख्य शिक्षाएँ", connect: "विचार आपस में कैसे जुड़ते हैं", from: "मेरे अध्ययन से:" },
  mr: { found: "ग्रंथांच्या अभ्यासातून मला हे समजले आहे:", essence: "सार", teachings: "मुख्य शिकवण", connect: "विचार एकमेकांशी कसे जोडलेले आहेत", from: "माझ्या अभ्यासातून:" },
  hinglish: { found: "Granthon ke adhyayan se maine yeh samjha hai:", essence: "Saar", teachings: "Mukhya shikshayein", connect: "Vichar aapas mein kaise jude hain", from: "mere adhyayan se:" },
};
U.sa = U.hi;

// An overview of one whole text from his understanding of it (instead of quoting raw sentences)
async function understoodOverview(title, u, lang, tr, put, pageWord) {
  const L = U[lang] || null;
  const lab = async (k) => (L ? L[k] : tr(U.en[k]));
  const cite = (p) => (!p ? "" : String(p).includes(":") ? ` _(⏱ ${p})_` : ` _(${pageWord} ${p})_`);
  put(`### ${title}\n\n**${await lab("essence")}:** ${await tr(u.essence)}\n\n**${await lab("teachings")}:**\n\n`);
  let i = 0;
  for (const t of (u.core_teachings || []).slice(0, 5)) put(`${++i}. **${await tr(t.teaching)}** ${await tr(t.explanation)}${cite(t.pages)}\n`);
  if (u.how_ideas_connect) put(`\n**${await lab("connect")}:** ${await tr(u.how_ideas_connect)}\n`);
}

export async function answerFromLibrary(messages, { knowledge, learner, book = "", translator = null, emit = null, understanding = null }) {
  const raw = messages[messages.length - 1].content;
  const q = raw.replace(/\[[A-Z ]+:[^\]]*\]\s*/g, "").trim();
  const lang = pickLang(raw, q);
  const tr = async (text) => (translator ? translator.translate(text, lang) : text);
  // wording: ready-made for en/hi/mr/hinglish/sa; other languages get the English wording translated
  const ready = !!T[lang];
  const base = T[lang] || T.en;
  const w = async (key, ...args) => {
    const v = typeof base[key] === "function" ? base[key](...args) : base[key];
    return ready ? v : tr(v);
  };
  // stream piece by piece when we can (translations take a moment), otherwise collect
  const out = [];
  const put = (p) => { if (emit) emit(p); else out.push(p); };
  const done = () => (emit ? "" : out.join(""));

  if (GREETING.test(q)) { put(await w("hello")); return done(); }

  // "thank you", "ok", "bye", "very nice"…: a kind reply, not a search through the books
  const talk = smallTalk(q);
  if (talk) { const r = (TALK[lang] || TALK.en)[talk]; put(TALK[lang] ? r : await tr(r)); return done(); }

  // "page 65 of Kundalini Sadhana" / "पेज 65 पर क्या है?": answer from exactly that page
  const pageNo = pageAsked(q);
  if (pageNo) {
    const P = PG[lang] || null;
    const say = async (k, ...a) => { const v = (P || PG.en)[k]; const s = typeof v === "function" ? v(...a) : v; return P ? s : tr(s); };
    const b = knowledge.bookForPage(q, messages.slice(0, -1));
    if (!b) { put(await say("which")); return done(); }
    const p = await knowledge.pageText(b.id, pageNo);
    if (!p) {
      const last = (await knowledge.pageText(b.id, 1))?.last || b.pages;
      put(await say("out", b.title, pageNo, last)); return done();
    }
    put(`${await say("head", b.title, pageNo)}\n\n`);
    const body = cleanSnippet(p.text);
    // judge the page by the script MOST of it is written in, so a few quoted Sanskrit lines (or OCR
    // specks in Latin letters) don't make a Hindi page "English" or the other way round
    const deva = (body.match(/[ऀ-ॿ]/g) || []).length, latin = (body.match(/[A-Za-z]/g) || []).length;
    const mainText = (body.match(deva > latin ? /[^A-Za-z]{20,}/g : /[^ऀ-ॿ]{20,}/g) || [body]).join(" ").slice(0, 600);
    const needTr = translator && translator.needsTranslation(mainText, lang);
    // translating takes a few seconds per piece, so a translated page is shown in up to 3 sentence-sized pieces
    const pieces = needTr ? (body.slice(0, 1300).match(/[^.।?!]{1,420}[.।?!]?/g) || [body.slice(0, 420)]).slice(0, 3) : [body.slice(0, 1800)];
    for (const piece of pieces) put(`> ${needTr ? await tr(piece.trim()) : piece.trim()}\n>\n`);
    if (!needTr && body.length > 1800) put("> …\n");
    put(`\n[pause]\n\n_${await say("raw")}${needTr ? " " + (TRANSLATED_NOTE[lang] || (await tr(TRANSLATED_NOTE.en))) : ""}_`);
    return done();
  }

  // "summarize <book>" / "<book> का सारांश"
  if (SUMMARY_RE.test(q)) {
    const target = book ? { id: book } : knowledge.findBook(q, SUMMARY_WORDS);
    const known = target && understanding && (await understanding.of(target.id));
    if (known) { await understoodOverview(knowledge.titleOf(target.id), known, lang, tr, put, await w("page")); return done(); }
    if (target) {
      if (emit) return (await summaryStream(knowledge, target.id, lang, emit, translator)) ? "" : w("none");
      return (await summaryMarkdown(knowledge, target.id, lang, translator)) || w("none");
    }
    const read = knowledge.books().filter((b) => b.searchable);
    if (!read.length) { put(await w("nothing")); return done(); }
    const s = S[lang];
    const ask = s ? s.which(read[0].title) : await tr(S.en.which(read[0].title));
    put(`${ask}\n\n${uniqueTitles(read).slice(0, 40).map((x) => `- ${x}`).join("\n")}`);
    return done();
  }

  // "Which book have you understood properly?" / "what have you studied fully?" / "कौन सी पुस्तक अच्छे से समझी?":
  // answered honestly from his real study records, never from a passage that happens to say "understood"
  if (STUDIED_Q.test(q)) {
    const read = knowledge.books().filter((b) => b.searchable).length;
    const finished = understanding ? await understanding.studied() : [];
    if (!finished.length) { put(await w("studiedNone", read)); return done(); }
    const names = [...new Set(finished.map((d) => d.title))];
    put(`${await w("studied", names.length, read)}\n\n${names.slice(0, 30).map((x) => `- ${x}`).join("\n")}\n\n${await w("studiedMore")}`);
    return done();
  }
  if (LIST_BOOKS.test(q)) {
    const read = knowledge.books().filter((b) => b.searchable);
    const s = learner.status();
    const now = s.state === "reading" && s.file ? `\n\n${await w("reading", s.id ? knowledge.titleOf(s.id) : s.file, s.page, s.pages)}` : "";
    if (!read.length) { put((await w("nothing")) + now); return done(); }
    const names = uniqueTitles(read);
    put(`${await w("list")}\n\n${names.slice(0, 40).map((x) => `- ${x}`).join("\n")}${names.length > 40 ? `\n- … +${names.length - 40}` : ""}${now}`);
    return done();
  }

  // Search in the question's own words AND in English + Hindi, so an English question finds Hindi books
  // and a Tamil/Bengali/… question finds anything at all.
  const queries = [q];
  if (translator) {
    for (const target of ["en", "hi"]) {
      try { const x = await translator.translate(q, target); if (x && x !== q) queries.push(x); } catch { /* keep going */ }
    }
  }
  const merged = new Map();
  for (const query of queries) {
    const { results, aboutBook } = await knowledge.search(query, { limit: 6, snippetLen: 480 });
    // a question about a whole book ("What does the Ashtavakra Gita teach?"): answer with its central ideas
    if (aboutBook) {
      const known = understanding && (await understanding.of(aboutBook));
      if (known) { await understoodOverview(knowledge.titleOf(aboutBook), known, lang, tr, put, await w("page")); return done(); }
      if (emit) return (await summaryStream(knowledge, aboutBook, lang, emit, translator)) ? "" : w("none");
      return (await summaryMarkdown(knowledge, aboutBook, lang, translator)) || w("none");
    }
    for (const r of results) {
      const key = `${r.id}|${r.page}`;
      if (!merged.has(key) || merged.get(key).score < r.score) merged.set(key, r);
    }
  }
  // First choice: what he has UNDERSTOOD (explained teachings, concepts, answered questions), not raw pages
  if (understanding) {
    const english = queries.find((x, i) => i > 0 && /^[\x00-\x7F]*$/.test(x)) || "";
    const found = await understanding.relevant(q, { limit: 3, english });
    if (found.length) {
      const L = U[lang];
      const pageWord = await w("page");
      put(`${L ? L.found : await tr(U.en.found)}\n\n`);
      const take = translator && translator.needsTranslation(found[0].body, lang) ? found.slice(0, 2) : found;
      let i = 0;
      for (const e of take) {
        const at = e.pages ? (String(e.pages).includes(":") ? `, ⏱ ${e.pages}` : `, ${pageWord} ${e.pages}`) : "";
        const head = e.type === "qa" ? "" : `**${await tr(e.head)}** — `;
        put(`**${++i}.** ${head}${await tr(e.body)} _(${e.title}${at})_\n\n`);
      }
      return done();
    }
  }

  const sorted = [...merged.values()].sort((a, b) => b.score - a.score);
  // keep only passages that are nearly as relevant as the best one (no weak "filler" passages)
  const ranked = sorted.filter((r) => r.score >= (sorted[0]?.score || 0) * 0.4);
  // translating takes time, so when the books are in another language: 2 shorter passages instead of 3 long ones
  const needTr = translator && ranked.slice(0, 3).some((r) => translator.needsTranslation(r.text, lang));
  const results = ranked.slice(0, needTr ? 2 : 3);
  const trim = (s) => { if (!needTr || s.length <= 320) return s; const cut = s.slice(0, 320); const end = Math.max(cut.lastIndexOf("।"), cut.lastIndexOf(". "), cut.lastIndexOf("? ")); return (end > 150 ? cut.slice(0, end + 1) : cut) + " …"; };
  if (!results.length) { put(await w("none")); return done(); }

  const pageWord = await w("page");
  put(`${await w("found")}\n\n`);
  let i = 0;
  for (const r of results) {
    i++;
    const text = await tr(trim(cleanSnippet(r.text)));     // the passage itself, in the selected language
    put(`**${i}. ${r.book}**${r.ref ? ` (${r.ref})` : r.page ? (String(r.page).includes(":") ? ` (⏱ ${r.page})` : ` (${pageWord} ${r.page})`) : ""}\n\n> ${text}\n\n`);
  }
  const translated = translator && results.some((r) => translator.needsTranslation(r.text, lang));
  put(`[pause]\n\n_${await w("outro")}${translated ? " " + (TRANSLATED_NOTE[lang] || (await tr(TRANSLATED_NOTE.en))) : ""}_`);
  return done();
}

/** Translate the prepared small-talk replies into the other languages once (they are cached on disk), so
 *  "thank you" or "who are you" in Tamil, Bengali… is answered instantly too. */
export async function warmSmallTalk(translator) {
  if (!translator?.enabled) return;
  for (const lang of ["bn", "ta", "te", "kn", "ml", "gu", "pa", "ur"])
    for (const text of Object.values(TALK.en)) { try { await translator.translate(text, lang); } catch {} }
}
