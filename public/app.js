// SANATAN — chat app logic
(function () {
  const $ = (id) => document.getElementById(id);
  const Voice = window.SanatanVoice;
  const Avatar = window.SanatanAvatar;
  const MD = window.SanatanMD;

  const messagesEl = $("messages"), input = $("input"), form = $("composer");
  const sendBtn = $("sendBtn"), micBtn = $("micBtn"), muteBtn = $("muteBtn");
  const startersEl = $("starters"), statusLine = $("statusLine");

  const GREETINGS = {
    en:
      "🙏 **Namaste. I am Krishna Sakha.**\n\n" +
      "I am an AI guide to Hindu Dharma: the Vedas, Upanishads, Puranas, Ramayana, Mahabharata, the Bhagavad Gita and Ayurveda. " +
      "I can also help with daily life, like studies, work, planning and writing.\n\n" +
      "Ask me in any language, and I will answer in yours. [pause]\n\n" +
      "Where shall we begin: a Purana, the Ramayana, the Mahabharata, or Ayurveda?",
    hi:
      "🙏 **नमस्ते। मैं कृष्ण सखा हूँ।**\n\n" +
      "मैं हिन्दू धर्म का एक AI मार्गदर्शक हूँ: वेद, उपनिषद, पुराण, रामायण, महाभारत, भगवद्गीता और आयुर्वेद। " +
      "मैं आपके दैनिक जीवन में भी मदद कर सकता हूँ, जैसे पढ़ाई, काम, योजना और लेखन।\n\n" +
      "आप किसी भी भाषा में पूछिए, मैं उसी भाषा में उत्तर दूँगा। [pause]\n\n" +
      "हम कहाँ से शुरू करें: कोई पुराण, रामायण, महाभारत या आयुर्वेद?",
    mr:
      "🙏 **नमस्कार. मी कृष्ण सखा आहे.**\n\n" +
      "मी हिंदू धर्माचा एक AI मार्गदर्शक आहे: वेद, उपनिषदे, पुराणे, रामायण, महाभारत, भगवद्गीता आणि आयुर्वेद. " +
      "मी तुमच्या दैनंदिन जीवनातही मदत करू शकतो, जसे अभ्यास, काम, नियोजन आणि लेखन.\n\n" +
      "तुम्ही कोणत्याही भाषेत विचारा, मी त्याच भाषेत उत्तर देईन. [pause]\n\n" +
      "आपण कुठून सुरुवात करूया: एखादे पुराण, रामायण, महाभारत की आयुर्वेद?",
    sa:
      "🙏 **नमो नमः। अहं कृष्णसखः।**\n\n" +
      "अहं हिन्दूधर्मस्य AI-मार्गदर्शकः अस्मि। वेदाः, उपनिषदः, पुराणानि, रामायणम्, महाभारतम्, भगवद्गीता, आयुर्वेदः च मम विषयाः। [pause]\n\n" +
      "कुतः आरभामहे: पुराणात्, रामायणात्, महाभारतात्, आयुर्वेदात् वा?",
    hinglish:
      "🙏 **Namaste. Main Krishna Sakha hoon.**\n\n" +
      "Main Hindu Dharma ka ek AI guide hoon: Vedas, Upanishads, Puranas, Ramayana, Mahabharata, Bhagavad Gita aur Ayurveda. " +
      "Daily life mein bhi madad kar sakta hoon, jaise padhai, kaam, planning aur writing.\n\n" +
      "Aap kisi bhi language mein poochiye, main usi mein jawab doonga. [pause]\n\n" +
      "Kahan se shuru karein: koi Purana, Ramayana, Mahabharata ya Ayurveda?",
  };
  Object.assign(GREETINGS, {
    bn:
      "🙏 **নমস্কার। আমি কৃষ্ণ সখা।**\n\n" +
      "আমি হিন্দু ধর্মের একজন AI পথপ্রদর্শক: বেদ, উপনিষদ, পুরাণ, রামায়ণ, মহাভারত, ভগবদ্গীতা ও আয়ুর্বেদ। দৈনন্দিন জীবনেও আমি সাহায্য করতে পারি।\n\n" +
      "যেকোনো ভাষায় জিজ্ঞাসা করুন, আমি সেই ভাষাতেই উত্তর দেব। [pause]\n\n" +
      "কোথা থেকে শুরু করবেন: পুরাণ, রামায়ণ, মহাভারত, না আয়ুর্বেদ?",
    ta:
      "🙏 **வணக்கம். நான் கிருஷ்ண சகா.**\n\n" +
      "நான் இந்து தர்மத்தின் AI வழிகாட்டி: வேதங்கள், உபநிடதங்கள், புராணங்கள், இராமாயணம், மகாபாரதம், பகவத் கீதை, ஆயுர்வேதம். அன்றாட வாழ்க்கையிலும் உதவ முடியும்.\n\n" +
      "எந்த மொழியிலும் கேளுங்கள், அதே மொழியில் பதில் சொல்வேன். [pause]\n\n" +
      "எங்கிருந்து தொடங்கலாம்: புராணம், இராமாயணம், மகாபாரதம், அல்லது ஆயுர்வேதம்?",
    te:
      "🙏 **నమస్కారం. నేను కృష్ణ సఖా.**\n\n" +
      "నేను హిందూ ధర్మానికి AI మార్గదర్శిని: వేదాలు, ఉపనిషత్తులు, పురాణాలు, రామాయణం, మహాభారతం, భగవద్గీత మరియు ఆయుర్వేదం. రోజువారీ జీవితంలో కూడా సహాయం చేయగలను.\n\n" +
      "ఏ భాషలోనైనా అడగండి, అదే భాషలో సమాధానం ఇస్తాను. [pause]\n\n" +
      "ఎక్కడ నుండి మొదలుపెడదాం: పురాణం, రామాయణం, మహాభారతం, లేదా ఆయుర్వేదం?",
    kn:
      "🙏 **ನಮಸ್ಕಾರ. ನಾನು ಕೃಷ್ಣ ಸಖಾ.**\n\n" +
      "ನಾನು ಹಿಂದೂ ಧರ್ಮದ AI ಮಾರ್ಗದರ್ಶಿ: ವೇದಗಳು, ಉಪನಿಷತ್ತುಗಳು, ಪುರಾಣಗಳು, ರಾಮಾಯಣ, ಮಹಾಭಾರತ, ಭಗವದ್ಗೀತೆ ಮತ್ತು ಆಯುರ್ವೇದ. ದೈನಂದಿನ ಜೀವನದಲ್ಲೂ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ.\n\n" +
      "ಯಾವುದೇ ಭಾಷೆಯಲ್ಲಿ ಕೇಳಿ, ಅದೇ ಭಾಷೆಯಲ್ಲಿ ಉತ್ತರಿಸುತ್ತೇನೆ. [pause]\n\n" +
      "ಎಲ್ಲಿಂದ ಪ್ರಾರಂಭಿಸೋಣ: ಪುರಾಣ, ರಾಮಾಯಣ, ಮಹಾಭಾರತ, ಅಥವಾ ಆಯುರ್ವೇದ?",
    ml:
      "🙏 **നമസ്കാരം. ഞാൻ കൃഷ്ണ സഖാ.**\n\n" +
      "ഞാൻ ഹിന്ദു ധർമ്മത്തിന്റെ AI വഴികാട്ടിയാണ്: വേദങ്ങൾ, ഉപനിഷത്തുകൾ, പുരാണങ്ങൾ, രാമായണം, മഹാഭാരതം, ഭഗവദ്ഗീത, ആയുർവേദം. ദൈനംദിന ജീവിതത്തിലും സഹായിക്കാം.\n\n" +
      "ഏത് ഭാഷയിലും ചോദിക്കൂ, അതേ ഭാഷയിൽ ഉത്തരം നൽകാം. [pause]\n\n" +
      "എവിടെ നിന്ന് തുടങ്ങാം: പുരാണം, രാമായണം, മഹാഭാരതം, അതോ ആയുർവേദം?",
    gu:
      "🙏 **નમસ્તે. હું કૃષ્ણ સખા છું.**\n\n" +
      "હું હિંદુ ધર્મનો AI માર્ગદર્શક છું: વેદ, ઉપનિષદ, પુરાણ, રામાયણ, મહાભારત, ભગવદ્ગીતા અને આયુર્વેદ. રોજિંદા જીવનમાં પણ મદદ કરી શકું છું.\n\n" +
      "કોઈપણ ભાષામાં પૂછો, હું એ જ ભાષામાં જવાબ આપીશ. [pause]\n\n" +
      "ક્યાંથી શરૂ કરીએ: પુરાણ, રામાયણ, મહાભારત કે આયુર્વેદ?",
    pa:
      "🙏 **ਨਮਸਕਾਰ। ਮੈਂ ਕ੍ਰਿਸ਼ਨ ਸਖਾ ਹਾਂ।**\n\n" +
      "ਮੈਂ ਹਿੰਦੂ ਧਰਮ ਦਾ AI ਮਾਰਗਦਰਸ਼ਕ ਹਾਂ: ਵੇਦ, ਉਪਨਿਸ਼ਦ, ਪੁਰਾਣ, ਰਾਮਾਇਣ, ਮਹਾਭਾਰਤ, ਭਗਵਦ ਗੀਤਾ ਅਤੇ ਆਯੁਰਵੇਦ। ਰੋਜ਼ਾਨਾ ਜ਼ਿੰਦਗੀ ਵਿੱਚ ਵੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ।\n\n" +
      "ਕਿਸੇ ਵੀ ਭਾਸ਼ਾ ਵਿੱਚ ਪੁੱਛੋ, ਮੈਂ ਉਸੇ ਭਾਸ਼ਾ ਵਿੱਚ ਜਵਾਬ ਦਿਆਂਗਾ। [pause]\n\n" +
      "ਕਿੱਥੋਂ ਸ਼ੁਰੂ ਕਰੀਏ: ਪੁਰਾਣ, ਰਾਮਾਇਣ, ਮਹਾਭਾਰਤ ਜਾਂ ਆਯੁਰਵੇਦ?",
    ur:
      "🙏 **نمستے۔ میں کرشن سکھا ہوں۔**\n\n" +
      "میں ہندو دھرم کا ایک AI رہنما ہوں: وید، اپنشد، پران، رامائن، مہابھارت، بھگود گیتا اور آیوروید۔ روزمرہ زندگی میں بھی مدد کر سکتا ہوں۔\n\n" +
      "کسی بھی زبان میں پوچھیے، میں اسی زبان میں جواب دوں گا۔ [pause]\n\n" +
      "کہاں سے شروع کریں: پران، رامائن، مہابھارت یا آیوروید؟",
  });
  const greeting = () => GREETINGS[replyLang.code] || GREETINGS.en;

  const STATUS = {
    idle: "Scholar of Hindu Dharma · Daily-life guide",
    listening: "Listening…",
    thinking: "Reflecting…",
    speaking: "Speaking…",
  };

  // ---------- storage (best-effort) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  let history = store.get("sanatan.history", []); // [{role, content, mode?}]
  let mode = "";
  let controller = null;
  let chatEnabled = true;
  let introDone = false;
  let replyLang = store.get("sanatan.lang", { code: "auto", speech: "auto", name: "" });

  Object.assign(Voice.settings, store.get("sanatan.voice", {}));

  // ---------- state → avatar + status line ----------
  function setState(s) {
    Avatar.setState(s);
    statusLine.textContent = STATUS[s] || STATUS.idle;
  }
  Voice.onIdle = () => { if (!controller) setState("idle"); window.dispatchEvent(new Event("sanatan-idle")); };
  setInterval(() => {
    const s = Avatar.getState();
    if (Date.now() < (window.__statusHold || 0)) return;
    if (statusLine.textContent !== STATUS[s]) statusLine.textContent = STATUS[s];
  }, 300);

  // ---------- rendering ----------
  function bubble(role, content, opts = {}) {
    const el = document.createElement("div");
    el.className = `msg ${role === "user" ? "user" : "bot"}${opts.error ? " error" : ""}`;
    if (role === "user") {
      el.textContent = content;
      if (opts.mode) {
        const tag = document.createElement("div");
        tag.style.cssText = "font-size:11px;opacity:.7;margin-bottom:2px";
        tag.textContent = opts.mode;
        el.prepend(tag);
      }
    } else {
      el.innerHTML = MD.render(content);
      if (!opts.error && Voice.supported.tts) addSpeakAgain(el, content);
    }
    messagesEl.appendChild(el);
    scrollDown();
    return el;
  }

  function addSpeakAgain(el, content) {
    const b = document.createElement("button");
    b.className = "speak-again";
    b.type = "button";
    b.textContent = "▶ Listen";
    b.onclick = () => { Voice.stop(); Voice.speak(content); };
    el.appendChild(b);
  }

  function scrollDown() { messagesEl.scrollTop = messagesEl.scrollHeight; }

  // suggested questions in the selected language
  const STARTERS = {
    en: ["Which books have you read?", "What is Kundalini awakening?", "Tell me about the Gayatri mantra", "How should I meditate?", "What do the Vedas say about Agni?"],
    hi: ["आपने कौन-सी पुस्तकें पढ़ी हैं?", "कुंडलिनी जागरण क्या है?", "गायत्री मंत्र के बारे में बताइए", "ध्यान कैसे करें?", "वेदों में अग्नि के बारे में क्या कहा गया है?"],
    mr: ["तुम्ही कोणते ग्रंथ वाचले आहेत?", "कुंडलिनी जागरण म्हणजे काय?", "गायत्री मंत्राबद्दल सांगा", "ध्यान कसे करावे?", "वेदांमध्ये अग्नीबद्दल काय सांगितले आहे?"],
    sa: ["भवता कानि पुस्तकानि पठितानि?", "कुण्डलिनीजागरणं किम्?", "गायत्रीमन्त्रविषये वदतु", "ध्यानं कथं करणीयम्?", "वेदाः अग्निविषये किं वदन्ति?"],
    hinglish: ["Aapne kaun se granth padhe hain?", "Kundalini jagran kya hai?", "Gayatri mantra ke baare mein batao", "Dhyan kaise karein?", "Vedon mein Agni ke baare mein kya kaha gaya hai?"],
    bn: ["আপনি কোন কোন বই পড়েছেন?", "কুণ্ডলিনী জাগরণ কী?", "গায়ত্রী মন্ত্র সম্পর্কে বলুন", "কীভাবে ধ্যান করব?", "বেদে অগ্নি সম্পর্কে কী বলা হয়েছে?"],
    ta: ["நீங்கள் எந்த புத்தகங்களைப் படித்துள்ளீர்கள்?", "குண்டலினி விழிப்பு என்றால் என்ன?", "காயத்ரி மந்திரம் பற்றி சொல்லுங்கள்", "தியானம் செய்வது எப்படி?", "வேதங்கள் அக்னியைப் பற்றி என்ன சொல்கின்றன?"],
    te: ["మీరు ఏ పుస్తకాలు చదివారు?", "కుండలినీ జాగరణ అంటే ఏమిటి?", "గాయత్రీ మంత్రం గురించి చెప్పండి", "ధ్యానం ఎలా చేయాలి?", "వేదాలు అగ్ని గురించి ఏమి చెబుతాయి?"],
    kn: ["ನೀವು ಯಾವ ಪುಸ್ತಕಗಳನ್ನು ಓದಿದ್ದೀರಿ?", "ಕುಂಡಲಿನಿ ಜಾಗೃತಿ ಎಂದರೇನು?", "ಗಾಯತ್ರಿ ಮಂತ್ರದ ಬಗ್ಗೆ ಹೇಳಿ", "ಧ್ಯಾನ ಮಾಡುವುದು ಹೇಗೆ?", "ವೇದಗಳು ಅಗ್ನಿಯ ಬಗ್ಗೆ ಏನು ಹೇಳುತ್ತವೆ?"],
    ml: ["നിങ്ങൾ ഏതൊക്കെ പുസ്തകങ്ങൾ വായിച്ചു?", "കുണ്ഡലിനി ഉണർവ് എന്താണ്?", "ഗായത്രി മന്ത്രത്തെക്കുറിച്ച് പറയൂ", "ധ്യാനം എങ്ങനെ ചെയ്യാം?", "വേദങ്ങൾ അഗ്നിയെക്കുറിച്ച് എന്ത് പറയുന്നു?"],
    gu: ["તમે કયા પુસ્તકો વાંચ્યા છે?", "કુંડલિની જાગરણ શું છે?", "ગાયત્રી મંત્ર વિશે જણાવો", "ધ્યાન કેવી રીતે કરવું?", "વેદો અગ્નિ વિશે શું કહે છે?"],
    pa: ["ਤੁਸੀਂ ਕਿਹੜੀਆਂ ਕਿਤਾਬਾਂ ਪੜ੍ਹੀਆਂ ਹਨ?", "ਕੁੰਡਲਿਨੀ ਜਾਗਰਣ ਕੀ ਹੈ?", "ਗਾਇਤ੍ਰੀ ਮੰਤਰ ਬਾਰੇ ਦੱਸੋ", "ਧਿਆਨ ਕਿਵੇਂ ਕਰੀਏ?", "ਵੇਦ ਅਗਨੀ ਬਾਰੇ ਕੀ ਕਹਿੰਦੇ ਹਨ?"],
    ur: ["آپ نے کون سی کتابیں پڑھی ہیں؟", "کنڈلنی جاگرن کیا ہے؟", "گایتری منتر کے بارے میں بتائیے", "دھیان کیسے کریں؟", "وید اگنی کے بارے میں کیا کہتے ہیں؟"],
  };
  function renderStarters() {
    const list = STARTERS[replyLang.code] || STARTERS.en;
    startersEl.innerHTML = "";
    for (const q of list) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = q;
      startersEl.appendChild(b);
    }
  }

  function renderAll() {
    renderStarters();
    messagesEl.innerHTML = "";
    bubble("assistant", greeting());
    if (!chatEnabled) { startersEl.hidden = true; return; }
    for (const m of history) bubble(m.role, m.content, { mode: m.mode });
    startersEl.hidden = history.length > 0;
  }

  // ---------- streaming speech: speak whole sentences as they arrive ----------
  // Smooth speech: when the answer is written slower than he speaks (a hot laptop GPU slows itself down), speaking
  // each sentence at once leads to silences in the middle of the answer. So at the START he waits (still in his
  // "thinking" look) until enough is written that the rest will arrive before he runs out of words, at most 3 s.
  // Once he has begun, every sentence is spoken as soon as it is complete.
  function makeSpeaker({ voice = false } = {}) {
    let spoken = 0, started = false, firstAt = 0, readyAt = 0, timer = 0, last = "";
    const expected = voice ? 360 : 800;               // typical answer length (characters) in each mode
    const speechCps = () => 13.5 * (Voice.settings.rate || 1);
    function cutAt(raw, final) {
      if (final) return raw.length;
      let cut = -1;
      const re = /([.!?।॥:](?=\s)|\n\n)/g;
      let m;
      while ((m = re.exec(raw)) && m.index < raw.length - 1) {
        if (m.index + 1 > spoken) cut = m.index + 1;
      }
      // don't cut inside a code block
      if (cut > 0 && (raw.slice(0, cut).match(/```/g) || []).length % 2) cut = -1;
      return cut;
    }
    function feed(raw, final) {
      last = raw;
      if (!firstAt && raw) firstAt = performance.now();
      const cut = cutAt(raw, final);
      if (cut <= spoken) return;
      if (!started && !final) {
        const now = performance.now();
        if (!readyAt) readyAt = now;
        const secs = Math.max(0.3, (now - firstAt) / 1000);
        const rate = raw.length / secs;                                  // characters written per second
        const bufferedSecs = (cut - spoken) / speechCps();                // speech ready to play
        const remainingSecs = Math.max(0, expected - raw.length) / rate;  // time to write the rest
        if (bufferedSecs + 0.5 < remainingSecs && now - readyAt < 3000) {
          clearTimeout(timer);
          timer = setTimeout(() => feed(last, false), 400);               // check again even if no new text comes
          return;
        }
      }
      clearTimeout(timer);
      started = true;
      const piece = raw.slice(spoken, cut);
      spoken = cut;
      if (piece.trim()) Voice.speak(piece);
    }
    return { feed, cancel: () => clearTimeout(timer) };
  }

  // a short, natural "let me think" line, spoken only when an answer is slow to start (after 4 s)
  const HOLD = {
    auto: "हम्म, एक पल सोचने दीजिए।", hi: "हम्म, एक पल सोचने दीजिए।", sa: "हम्म, एक पल सोचने दीजिए।",
    en: "Hmm, let me think for a moment.", hinglish: "Hmm, ek pal sochne dijiye.",
    mr: "हम्म, एक क्षण विचार करू द्या.", bn: "হুম, একটু ভেবে দেখি।", ta: "ம்ம், ஒரு கணம் யோசிக்கிறேன்.",
    te: "హ్మ్, ఒక్క క్షణం ఆలోచిస్తాను.", kn: "ಹ್ಮ್, ಒಂದು ಕ್ಷಣ ಯೋಚಿಸುತ್ತೇನೆ.", ml: "ഹ്മ്, ഒരു നിമിഷം ആലോചിക്കട്ടെ.",
    gu: "હમ્મ, એક ક્ષણ વિચારવા દો.", pa: "ਹੰਮ, ਇੱਕ ਪਲ ਸੋਚਣ ਦਿਓ।", ur: "ہمم، ذرا ایک لمحہ سوچنے دیجیے۔",
  };


  // ---------- send ----------
  // voice: true = spoken in a live voice conversation (the server answers briefly, like a person talking)
  async function send(text, { voice = false } = {}) {
    engage();
    text = text.trim();
    if (!text || controller || !chatEnabled) return;
    Voice.stop();
    startersEl.hidden = true;

    const userMsg = { role: "user", content: text, mode: mode || undefined };
    history.push(userMsg);
    bubble("user", text, { mode });
    input.value = ""; autoGrow();

    const botEl = document.createElement("div");
    botEl.className = "msg bot";
    botEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    messagesEl.appendChild(botEl); scrollDown();

    setState("thinking");
    controller = new AbortController();
    setSending(true);

    if (replyLang.name) userMsg.lang = replyLang.name;
    const payload = history.map((m) => {
      if (m.role !== "user") return { role: m.role, content: m.content };
      const tags = (m.lang ? `[REPLY IN: ${m.lang}] ` : "") + (m.mode ? `[MODE: ${m.mode}] ` : "");
      return { role: "user", content: tags + m.content };
    });

    let raw = "", pendingRender = false, errorMsg = "";
    const speaker = makeSpeaker({ voice });
    // Answers from the books can take a while (offline translation): say so aloud right away,
    // so a voice-chat visitor knows he heard them instead of hearing silence.
    const holdTimer = setTimeout(() => {
      if (!raw && Voice.settings.enabled && Voice.supported.tts && !Voice.isSpeaking()) {
        Voice.speak(HOLD[replyLang.code] || HOLD.en);
        setState("thinking");
      }
    }, 4000);   // only if nothing has started by then: most answers begin before it
    const render = () => {
      pendingRender = false;
      botEl.innerHTML = MD.render(raw) || '<span class="typing"><i></i><i></i><i></i></span>';
      scrollDown();
    };

    // never wait forever: if no answer has started within 2 minutes (the server restarted, the brain is stuck),
    // stop and say so, so the visitor can simply ask again
    let timedOut = false;
    const watchdog = setInterval(() => {
      if (!raw && Date.now() - sentAt > 120_000) { timedOut = true; clearInterval(watchdog); controller?.abort(); }
    }, 5000);
    const sentAt = Date.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // who is in front of the camera (man / woman / child), if the camera is on: he adapts how he answers
        body: JSON.stringify({ messages: payload, voice, visitor: window.SanatanCamera?.visitor || undefined }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5));
          if (evt.t) {
            raw += evt.t;
            speaker.feed(raw, false);
            if (!pendingRender) { pendingRender = true; requestAnimationFrame(render); }
          }
          if (evt.error) errorMsg = evt.error;
        }
      }
    } catch (e) {
      if (timedOut) errorMsg = "Sorry, I could not answer that in time. Please ask me again. 🙏";
      else if (e.name !== "AbortError") errorMsg = /fetch|network|load/i.test(e.message || "") ? "I lost the connection for a moment. Please ask me again. 🙏" : e.message || "Network error. Please try again.";
    }

    clearTimeout(holdTimer);
    clearInterval(watchdog);
    render();
    if (controller.signal.aborted) speaker.cancel();
    else if (raw.trim()) speaker.feed(raw, true);
    if (raw.trim()) {
      history.push({ role: "assistant", content: raw });
      if (Voice.supported.tts) addSpeakAgain(botEl, raw);
    } else {
      history.pop(); // drop the unanswered question so history stays valid
    }
    if (errorMsg) {
      if (!raw.trim()) botEl.remove();
      bubble("assistant", errorMsg, { error: true });
    }
    store.set("sanatan.history", history.slice(-40));
    controller = null;
    setSending(false);
    if (!Voice.isSpeaking()) { setState("idle"); window.dispatchEvent(new Event("sanatan-idle")); }
  }

  function setSending(on) {
    sendBtn.classList.toggle("stop", on);
    sendBtn.textContent = on ? "■" : "➤";
    sendBtn.setAttribute("aria-label", on ? "Stop" : "Send");
  }

  // ---------- events ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (controller) { controller.abort(); Voice.stop(); return; }
    if (Voice.isSpeaking() && !input.value.trim()) { Voice.stop(); return; }
    send(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
    input.style.overflowY = input.scrollHeight > 140 ? "auto" : "hidden";
  }
  input.addEventListener("input", autoGrow);

  startersEl.addEventListener("click", (e) => { if (e.target.tagName === "BUTTON") send(e.target.textContent); });

  // mode chips: mouse wheel and click-drag scroll sideways
  const modesEl = document.querySelector(".modes");
  const updateFade = () => modesEl.classList.toggle("at-end", modesEl.scrollLeft + modesEl.clientWidth >= modesEl.scrollWidth - 2);
  modesEl.addEventListener("scroll", updateFade);
  window.addEventListener("resize", updateFade);
  updateFade();
  modesEl.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { modesEl.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  let drag = null, dragged = false;
  modesEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return; // touch already scrolls natively
    drag = { x: e.clientX, left: modesEl.scrollLeft }; dragged = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) { dragged = true; modesEl.classList.add("dragging"); }
    modesEl.scrollLeft = drag.left - dx;
  });
  window.addEventListener("pointerup", () => { drag = null; modesEl.classList.remove("dragging"); });
  modesEl.addEventListener("click", (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      mode = chip.dataset.mode;
      input.placeholder = mode ? `${chip.textContent}: what would you like?` : "Ask Krishna Sakha anything…";
      input.focus();
    });
  });

  $("newChatBtn").addEventListener("click", () => {
    if (controller) controller.abort();
    Voice.stop();
    history = [];
    store.set("sanatan.history", history);
    renderAll();
  });

  // mute
  function syncMute() {
    muteBtn.textContent = Voice.settings.enabled ? "🔊" : "🔇";
    muteBtn.setAttribute("aria-pressed", String(!Voice.settings.enabled));
  }
  muteBtn.addEventListener("click", () => {
    Voice.settings.enabled = !Voice.settings.enabled;
    if (!Voice.settings.enabled) Voice.stop();
    store.set("sanatan.voice", Voice.settings);
    syncMute();
  });

  // settings drawer
  const settingsEl = $("settings");
  $("settingsBtn").addEventListener("click", () => { settingsEl.hidden = !settingsEl.hidden; });
  const langSel = $("langSelect"), voiceSel = $("voiceSelect"), rateR = $("rateRange"), pitchR = $("pitchRange"), engineSel = $("engineSelect");
  engineSel.value = Voice.settings.engine || "natural";
  langSel.value = Voice.settings.lang; rateR.value = Voice.settings.rate; pitchR.value = Voice.settings.pitch;
  function fillVoices() {
    const cur = Voice.settings.voiceURI;
    voiceSel.innerHTML = '<option value="">Auto (prefer male)</option>';
    Voice.voices
      .filter((v) => /^(en|hi|mr|bn|ta|te|kn|ml|gu|pa|ur|or|sa|ne)/i.test(v.lang))
      .forEach((v) => {
        const o = document.createElement("option");
        o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`;
        voiceSel.appendChild(o);
      });
    voiceSel.value = cur;
  }
  window.addEventListener("sanatan-voices", fillVoices);
  fillVoices();
  const saveVoice = () => {
    Object.assign(Voice.settings, {
      lang: langSel.value, voiceURI: voiceSel.value, engine: engineSel.value, rate: Number(rateR.value), pitch: Number(pitchR.value),
    });
    store.set("sanatan.voice", Voice.settings);
  };
  [langSel, voiceSel, rateR, pitchR, engineSel].forEach((el) => el.addEventListener("change", saveVoice));
  engineSel.addEventListener("change", () => { Voice.stop(); Voice.speak("Namaste. I am Krishna Sakha."); });
  voiceSel.addEventListener("change", () => { Voice.stop(); Voice.speak("Namaste. I am Krishna Sakha."); });

  // microphone
  if (!Voice.supported.stt) { micBtn.title = "Voice input is not supported in this browser (try Chrome or Edge)"; micBtn.disabled = true; micBtn.style.opacity = 0.4; }
  let listening = false;
  micBtn.addEventListener("click", () => {
    if (listening) { Voice.stopListening(); return; }
    const ok = Voice.listen({
      lang: Voice.settings.lang,
      onInterim: (t) => { input.value = t; autoGrow(); },
      onError: (msg) => { statusLine.textContent = msg; window.__statusHold = Date.now() + 7000; },
      onFinal: (t) => send(t),
      onEnd: () => { listening = false; micBtn.classList.remove("listening"); if (!controller) setState("idle"); },
    });
    if (ok) { listening = true; micBtn.classList.add("listening"); setState("listening"); }
  });

  // No welcome pop-up: the page opens straight away and he stays quiet until the visitor does something.
  // Browsers only allow sound after a tap or key press, so the first one quietly unlocks audio.
  const firstGesture = () => {
    Voice.unlock(); introDone = true;
    window.removeEventListener("pointerdown", firstGesture, true);
    window.removeEventListener("keydown", firstGesture, true);
  };
  window.addEventListener("pointerdown", firstGesture, true);
  window.addEventListener("keydown", firstGesture, true);

  // ---------- language buttons ----------
  const langBtns = document.querySelectorAll(".chip.lang");
  function applyLang(btn, speakIt) {
    langBtns.forEach((b) => { b.classList.toggle("active", b === btn); b.setAttribute("aria-checked", String(b === btn)); });
    replyLang = { code: btn.dataset.lang, speech: btn.dataset.speech, name: btn.dataset.name };
    store.set("sanatan.lang", replyLang);
    Voice.settings.lang = replyLang.speech;
    langSel.value = replyLang.speech;
    store.set("sanatan.voice", Voice.settings);
    if (!history.length || !chatEnabled) {
      renderAll();
      if (speakIt && introDone && Voice.settings.enabled) { Voice.stop(); Voice.speak(greeting()); }
    }
  }
  langBtns.forEach((b) => {
    b.setAttribute("role", "radio");
    b.addEventListener("click", () => applyLang(b, true));
  });
  const savedBtn = [...langBtns].find((b) => b.dataset.lang === replyLang.code) || langBtns[0];
  applyLang(savedBtn, false);
  // horizontal wheel scrolling for the language row too
  const langsEl = $("langs");
  langsEl.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { langsEl.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  function showEngineInfo(info) {
    const el = $("engineInfo");
    if (!el) return;
    el.textContent = info && info.available
      ? `Natural voice: ${info.engine === "azure" ? "Azure neural" : info.engine === "edge" ? "Microsoft neural (Madhur, Manohar, Prabhat…)" : "Piper neural (free, on this server)"} for ${info.languages.join(", ")}. Other languages use your browser's voice.`
      : "Natural voice isn't set up on the server yet, so your browser's voice is used.";
  }

  // ---------- chat on/off (server decides) ----------
  // tell the visitor when their device has no voice for the chosen language
  const LANG_NAMES = { bn: "Bengali", ta: "Tamil", kn: "Kannada", gu: "Gujarati", pa: "Punjabi", ur: "Urdu", or: "Odia", te: "Telugu", ml: "Malayalam", mr: "Marathi", hi: "Hindi" };
  let novoiceShown = 0;
  window.addEventListener("sanatan-novoice", (e) => {
    if (Date.now() - novoiceShown < 8000) return;
    novoiceShown = Date.now();
    const name = LANG_NAMES[e.detail.lang.slice(0, 2)] || e.detail.lang;
    window.__statusHold = Date.now() + 6000;
    statusLine.textContent = `No ${name} voice on this device, so Krishna Sakha shows the text only.`;
    setTimeout(() => { statusLine.textContent = STATUS[Avatar.getState()] || STATUS.idle; }, 6000);
  });

  function showAnswerMode(c) {
    const el = $("answerMode");
    if (!el) return;
    if (!el.dataset.books) el.dataset.books = el.textContent;
    if (c.brain === "local") {
      el.textContent = `🧠 Krishna Sakha is thinking with his free local brain (${c.localModel}) on this computer, from the books he has read. Answers may be simpler and a little slower.`;
      el.hidden = false;
    } else {
      el.textContent = el.dataset.books;
      el.hidden = c.brain ? c.brain === "claude" : !!c.aiEnabled;
    }
  }
  // the brain can change while the page is open (credits added, Ollama started or stopped)
  setInterval(() => fetch("/api/config").then((r) => r.json()).then(showAnswerMode).catch(() => {}), 60_000);

  function setChatEnabled(on) {
    chatEnabled = on;
    form.hidden = !on;
    document.querySelector(".modes").hidden = !on;
    $("newChatBtn").hidden = !on;
    $("chatOff").hidden = on;
    renderAll();
  }
  fetch("/api/config").then((r) => r.json()).then((c) => { Voice.setServerVoices(c.tts); showEngineInfo(c.tts); setChatEnabled(true); showAnswerMode(c); }).catch(() => setChatEnabled(true));

  // ---------- side panel (drawer): hidden by default ----------
  const panel = $("panel"), openBtn = $("panelOpen");
  function setPanel(open) {
    panel.classList.toggle("open", open);
    panel.inert = !open;
    openBtn.classList.toggle("hide", open);
    openBtn.setAttribute("aria-expanded", String(open));
    if (open) engage();
    if (open) setTimeout(() => (chatEnabled ? input : $("panelClose")).focus(), 250);
    else openBtn.focus();
  }
  openBtn.addEventListener("click", () => setPanel(true));
  $("panelClose").addEventListener("click", () => setPanel(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open") && $("libraryModal").hidden) setPanel(false);
  });

  // ---------- learning status under the avatar ----------
  const learnLine = $("learnLine");
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pageOpenedAt = Date.now();
  let lastCelebrated = 0, celebrateMsgUntil = 0;
  // "Resume reading": after a talk anyone may send him back to his book; the owner's Pause needs the owner password
  const resumeBtn = $("resumeRead");
  resumeBtn.addEventListener("click", async () => {
    const btn = resumeBtn;
    btn.disabled = true;
    try {
      const st = await (await fetch("/api/status", { cache: "no-store" })).json();
      if (st.manualPause) {
        let key = "";
        try { key = sessionStorage.getItem("sanatan.admin") || ""; } catch {}
        if (!key) key = window.prompt("Owner password (ADMIN_PASSWORD in .env):") || "";
        if (!key) { btn.disabled = false; return; }
        const r = await fetch("/api/learner/resume", { method: "POST", headers: { "x-admin-key": key } });
        if (!r.ok) { try { sessionStorage.removeItem("sanatan.admin"); } catch {} alert((await r.json()).error || "Could not resume."); btn.disabled = false; return; }
        try { sessionStorage.setItem("sanatan.admin", key); } catch {}
      } else {
        await fetch("/api/learner/continue", { method: "POST" });
      }
      lastEngagePing = Date.now(); // don't immediately pause him again
      Avatar.setReading(true);
    } catch { btn.disabled = false; }
    btn.disabled = false;
    setTimeout(() => pollLearning(true), 300);
  });
  async function pollLearning(once = false) {
    try {
      const s = await (await fetch("/api/status", { cache: "no-store" })).json();
      const u = s.understanding;
      resumeBtn.hidden = !((s.paused && s.state === "reading") || s.manualPause);
      Avatar.setReading((s.state === "reading" || /^(reflecting|resting)$/.test(u?.state || "")) && !s.manualPause);
      Avatar.setProgress(s.pages > 0 ? s.page / s.pages : 0);

      // a book was just finished: full glowing ring + smile, then he moves on to the next one
      const done = s.lastCompleted;
      if (done && done.at > lastCelebrated) {
        const fresh = lastCelebrated > 0 || done.at > pageOpenedAt;
        lastCelebrated = done.at;
        if (fresh) {
          Avatar.celebrate();
          celebrateMsgUntil = Date.now() + 6500;
          learnLine.className = "learn-line done";
          learnLine.innerHTML = `<span class="dot"></span><span>✨ Finished reading</span> <span class="nm" title="${escHtml(done.title || done.file)}">“${escHtml(done.title || done.file)}”</span>`;
          learnLine.hidden = false;
        }
      }
      if (Date.now() < celebrateMsgUntil) {
        /* keep showing the "finished" message for a moment */
      } else if (s.manualPause) {
        learnLine.className = "learn-line idle";
        learnLine.innerHTML = `<span class="dot"></span><span>⏸ Reading is paused</span>${s.file ? ` <span class="nm" title="${escHtml(s.title || s.file)}">“${escHtml(s.title || s.file)}”</span><span>${s.pages > 1 ? ` · page ${s.page} of ${s.pages}` : ""}</span>` : ""}`;
        learnLine.hidden = false;
      } else if (s.state === "reading" && s.file) {
        const clk = (x) => { x = Math.round(x || 0); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), z = x % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(z).padStart(2, "0"); };
        const listening = s.mode === "listen";
        const where = s.pages > 1 ? (listening ? ` · ${clk(s.page)} of ${clk(s.pages)}` : ` · page ${s.page} of ${s.pages}`) : "";
        learnLine.className = "learn-line";
        learnLine.innerHTML = s.paused
          ? `<span class="dot"></span><span>Paused ${listening ? "listening to" : "reading"}</span> <span class="nm" title="${escHtml(s.title || s.file)}">“${escHtml(s.title || s.file)}”</span><span>to talk with you</span>`
          : `<span class="dot"></span><span>Krishna Sakha is now ${listening ? "listening to" : "reading"}</span> <span class="nm" title="${escHtml(s.title || s.file)}">“${escHtml(s.title || s.file)}”</span><span>${where}</span>`;
        learnLine.hidden = false;
      } else if (u && /^(reflecting|resting)$/.test(u.state) && u.title) {
        // not reading now, but studying the meaning of a text he has read
        learnLine.className = "learn-line";
        learnLine.innerHTML = `<span class="dot"></span><span>🪷 Reflecting on</span> <span class="nm" title="${escHtml(u.title)}">“${escHtml(u.title)}”</span><span>to understand it${u.engine === "local" ? " (local brain)" : ""}${u.parts > 1 ? ` · ${Math.min(u.part + 1, u.parts)} of ${u.parts}` : ""}</span>`;
        learnLine.hidden = false;
      } else if (s.total > 0) {
        const c = s.counts;
        const waiting = c.needsOcr + c.legacyFont + c.media + c.other;
        learnLine.className = "learn-line idle";
        const books = c.booksLearned ?? c.learned, talks = c.mediaLearned || 0;
        learnLine.innerHTML = `<span class="dot"></span><span>Studied ${books} books${talks ? ` · listened to ${talks} talk${talks > 1 ? "s" : ""}` : ""}${u && u.understood ? ` · understood ${u.understood}` : ""}${waiting ? ` · ${waiting} waiting` : ""}</span>`;
        learnLine.hidden = false;
      } else {
        learnLine.hidden = true;
      }
    } catch { /* server offline: keep last status */ }
    if (!once) setTimeout(pollLearning, document.hidden ? 15000 : 2500);
  }
  pollLearning();

  // ---------- what he is reading, shown behind him ----------
  // The drifting background text becomes the OCR of the page he is on (or the talk he is hearing),
  // and the page itself floats beside him, its white paper blended away (styles.css .glimpse).
  const glimpseImgs = [...document.querySelectorAll("#glimpse img")];
  let liveImageAt = 0, liveFront = 0, picShownAt = 0;
  async function pollLive() {
    try {
      const l = await (await fetch("/api/reading/live", { cache: "no-store" })).json();
      const fresh = l.at && Date.now() - l.at < 10 * 60 * 1000;   // nothing read for 10 minutes: back to mantras
      Avatar.setLiveText(fresh ? l.text : "");
      if (fresh && l.imageAt && l.imageAt !== liveImageAt) {
        liveImageAt = l.imageAt;
        const next = glimpseImgs[1 - liveFront];
        next.onload = () => { next.classList.add("on"); glimpseImgs[liveFront].classList.remove("on"); liveFront = 1 - liveFront; picShownAt = Date.now(); };
        next.src = `/api/reading/page.jpg?t=${l.imageAt}`;
      } else if ((!fresh || !l.imageAt) && Date.now() - picShownAt > 25000) {
        // only pictures are shown (text pages never are); a picture stays at least 25 s, then fades away
        glimpseImgs.forEach((i) => i.classList.remove("on"));
        if (!l.imageAt) liveImageAt = 0;
      }
    } catch { /* server offline: keep what is shown */ }
    setTimeout(pollLive, document.hidden ? 20000 : 4000);
  }
  if (glimpseImgs.length === 2) pollLive();

  // ---------- wake up when someone talks to him ----------
  let lastEngagePing = 0;
  function engage() {
    Avatar.engage();                                   // open eyes, stop meditating
    if (Date.now() - lastEngagePing > 20000) {         // and ask the server to pause reading
      lastEngagePing = Date.now();
      fetch("/api/engage", { method: "POST" }).catch(() => {});
    }
  }
  input.addEventListener("focus", engage);
  input.addEventListener("keydown", engage);
  $("knowBtn").addEventListener("click", engage);
  document.querySelectorAll("[data-open-know]").forEach((b) => b.addEventListener("click", engage));

  // ---------- subtitles under his face ----------
  const caption = $("caption");
  let captionTimer = 0;
  function showCaption(text, who = "sanatan") {
    clearTimeout(captionTimer);
    const t = String(text).replace(/\s+/g, " ").trim();
    caption.textContent = t.length > 220 ? t.slice(0, 217) + "…" : t;
    caption.classList.toggle("you", who === "you");
    caption.classList.toggle("show", !!t);
  }
  function hideCaption(delay = 1800) { clearTimeout(captionTimer); captionTimer = setTimeout(() => caption.classList.remove("show"), delay); }
  window.addEventListener("sanatan-say", (e) => showCaption(e.detail.text));

  // ---------- voice chat: tap the mic, talk, he answers aloud, then listens again ----------
  const fab = $("voiceFab"), fabLabel = $("voiceFabLabel");
  let convo = false, listeningNow = false, silentTries = 0;

  function syncFab() {
    const speaking = Voice.isSpeaking() || !!controller;
    fab.classList.toggle("convo", convo);
    fab.classList.toggle("listening", listeningNow);
    fab.classList.toggle("speaking", convo && !listeningNow && speaking);
    fab.setAttribute("aria-pressed", String(convo));
    fabLabel.textContent = listeningNow ? "Listening" : convo ? (speaking ? "Tap to cut in" : "Stop") : "Talk";
    fab.setAttribute("aria-label", convo ? "Stop voice chat" : "Start voice chat");
  }

  function listenOnce() {
    if (!Voice.supported.stt) return false;
    let heard = false;
    const ok = Voice.listen({
      lang: Voice.settings.lang,
      onInterim: (t) => { heard = heard || !!t.trim(); showCaption(t, "you"); },
      onError: (msg) => { stopConvo(); showCaption(msg); hideCaption(7000); },
      onFinal: (t) => { heard = true; silentTries = 0; showCaption(t, "you"); send(t, { voice: true }); },
      onEnd: () => {
        listeningNow = false;
        if (!controller) setState("idle");
        if (!heard && convo) {
          silentTries++;
          if (silentTries >= 2) { stopConvo(); showCaption("Voice chat paused. Tap the mic when you want to talk."); hideCaption(3500); }
          else setTimeout(() => convo && !controller && !Voice.isSpeaking() && listenOnce(), 300);
        }
        syncFab();
      },
    });
    if (ok) { listeningNow = true; setState("listening"); engage(); showCaption(silentTries ? "🎙 I didn't catch that. Please speak again…" : "🎙 …", "you"); }
    syncFab();
    return ok;
  }

  function startConvo() {
    if (!Voice.supported.stt) {
      // no speech recognition in this browser (e.g. Firefox): open the chat box instead
      setPanel(true);
      showCaption("Voice input works in Chrome or Edge. You can type your question instead."); hideCaption(4000);
      return;
    }
    convo = true; silentTries = 0;
    if (!Voice.settings.enabled) { Voice.settings.enabled = true; syncMute(); }
    Voice.unlock();                                    // tap = permission to play sound
    introDone = true;
    engage();
    listenOnce();
  }
  function stopConvo() {
    convo = false;
    if (listeningNow) Voice.stopListening();
    listeningNow = false;
    syncFab();
  }

  fab.addEventListener("click", () => {
    if (!convo) return startConvo();
    if (listeningNow) return stopConvo();
    // he is answering: cut in and listen
    if (controller) controller.abort();
    Voice.stop();
    listenOnce();
  });

  // when he finishes answering, listen again
  window.addEventListener("sanatan-idle", () => {
    hideCaption();
    if (convo && !controller && !listeningNow && !Voice.isSpeaking()) setTimeout(() => {
      if (convo && !controller && !listeningNow && !Voice.isSpeaking()) listenOnce();
    }, 450);
    syncFab();
  });
  setInterval(syncFab, 500);
  syncFab();

  // ---------- camera: someone stepped in front of him ----------
  // Greeting is respectful and gender-neutral ("आप"), in the selected language.
  const WELCOME = {
    en: "Namaste! Welcome. I am Krishna Sakha. How can I help you today?",
    hi: "नमस्ते! आपका स्वागत है। मैं कृष्ण सखा हूँ। आज मैं आपकी क्या सहायता करूँ?",
    mr: "नमस्कार! आपले स्वागत आहे. मी कृष्ण सखा. आज मी तुमची काय मदत करू?",
    sa: "नमो नमः! स्वागतम्। अहं कृष्णसखः। अद्य कथं साहाय्यं करवाणि?",
    hinglish: "Namaste! Aapka swagat hai. Main Krishna Sakha hoon. Aaj main aapki kya madad karun?",
    bn: "নমস্কার! স্বাগতম। আমি কৃষ্ণ সখা। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
    ta: "வணக்கம்! வரவேற்கிறேன். நான் கிருஷ்ண சகா. இன்று நான் உங்களுக்கு எப்படி உதவலாம்?",
    te: "నమస్కారం! స్వాగతం. నేను కృష్ణ సఖా. ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?",
    kn: "ನಮಸ್ಕಾರ! ಸ್ವಾಗತ. ನಾನು ಕೃಷ್ಣ ಸಖಾ. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
    ml: "നമസ്കാരം! സ്വാഗതം. ഞാൻ കൃഷ്ണ സഖാ. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കട്ടെ?",
    gu: "નમસ્તે! આપનું સ્વાગત છે. હું કૃષ્ણ સખા છું. આજે હું આપની શું મદદ કરું?",
    pa: "ਨਮਸਕਾਰ! ਜੀ ਆਇਆਂ ਨੂੰ। ਮੈਂ ਕ੍ਰਿਸ਼ਨ ਸਖਾ ਹਾਂ। ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕੀ ਮਦਦ ਕਰਾਂ?",
    ur: "نمستے! خوش آمدید۔ میں کرشن سکھا ہوں۔ آج میں آپ کی کیا مدد کروں؟",
  };
  const AGAIN = {
    en: "Welcome back! Please, go ahead.", hi: "फिर से स्वागत है! कहिए।", mr: "पुन्हा स्वागत! बोला.",
    sa: "पुनः स्वागतम्! वदतु।", hinglish: "Phir se swagat hai! Kahiye.",
  };
  window.addEventListener("sanatan-visitor", (e) => {
    const ev = e.detail.event;
    if (ev === "error") { showCaption(e.detail.message); hideCaption(7000); return; }
    if (ev === "camera-on") { introDone = true; Voice.unlock(); return; }
    if (ev === "arrive" || ev === "return") {
      engage();
      Avatar.smile(ev === "arrive" ? 4500 : 2500);   // a warm smile when someone comes
      if (controller || Voice.isSpeaking() || listeningNow) return; // already talking: don't interrupt
      // one-to-one conversation: greet, then listen (the idle handler starts listening after he speaks)
      convo = true; silentTries = 0;
      if (!Voice.settings.enabled) { Voice.settings.enabled = true; syncMute(); }
      const text = ev === "arrive" ? (WELCOME[replyLang.code] || WELCOME.en) : (AGAIN[replyLang.code] || AGAIN.en);
      Voice.speak(text);
      if (!Voice.supported.tts || !Voice.isSpeaking()) setTimeout(() => convo && !Voice.isSpeaking() && listenOnce(), 600);
      syncFab();
    } else if (ev === "leave" || ev === "camera-off") {
      // the person walked away: end the conversation quietly
      if (convo) stopConvo();
      hideCaption(800);
    }
  });

  syncMute();
  renderAll();
})();
