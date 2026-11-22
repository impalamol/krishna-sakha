// KRISHNA SAKHA — the catalogue of his library: every work, where it is filed, its source, translator and year.
// Filed by category (so different texts never mix): vedas/<veda>/<part>, upanishads/…, puranas/<purana>,
// itihasa/<epic>/…, darshana/<school>, smriti/…  Each work becomes ONE library file per language, with a
// [ref …] marker before every hymn / chapter / section, so answers can cite exactly (e.g. "Rigveda 1.1").
//
// source "sacred-texts": English translation from sacred-texts.com (public domain, published ≤ 1930)
// source "gretil":       Sanskrit original from GRETIL (Göttingen), converted to Devanagari (CC BY-NC-SA 4.0:
//                        free for non-commercial use with credit, which this project is)

export const WORKS = [
  // ---------- VEDAS: four Samhitas, then Brahmanas, Aranyakas, Vedangas ----------
  { source: "sacred-texts", slug: "the-rig-veda", dir: "vedas/rigveda/samhita", title: "Rigveda Samhita", translator: "Ralph T. H. Griffith", lang: "en", study: 2 },
  { source: "sacred-texts", slug: "vedic-hymns-part-i-sbe32-hymns-to-the-maruts-rudra-vayu-and-vata", dir: "vedas/rigveda/vedic-hymns", title: "Vedic Hymns, Part I (Maruts, Rudra, Vayu, Vata)", translator: "F. Max Müller", lang: "en", study: 4 },
  { source: "sacred-texts", slug: "vedic-hymns-part-ii-sbe46-hymns-to-agni", dir: "vedas/rigveda/vedic-hymns", title: "Vedic Hymns, Part II (Hymns to Agni)", translator: "Hermann Oldenberg", lang: "en", study: 4 },
  { source: "sacred-texts", slug: "hymns-of-the-samaveda", dir: "vedas/samaveda/samhita", title: "Samaveda Samhita", translator: "Ralph T. H. Griffith", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "the-texts-of-the-white-yajurveda", dir: "vedas/yajurveda/shukla-vajasaneyi-samhita", title: "Shukla Yajurveda (Vajasaneyi Samhita)", translator: "Ralph T. H. Griffith", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "the-yajur-veda-taittiriya-sanhita", dir: "vedas/yajurveda/krishna-taittiriya-samhita", title: "Krishna Yajurveda (Taittiriya Samhita)", translator: "Arthur Berriedale Keith", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "the-hymns-of-the-atharvaveda", dir: "vedas/atharvaveda/samhita", title: "Atharvaveda Samhita", translator: "Ralph T. H. Griffith", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "hymns-of-the-atharva-veda", dir: "vedas/atharvaveda/samhita", title: "Hymns of the Atharvaveda (with commentary)", translator: "Maurice Bloomfield", lang: "en", study: 4 },
  { source: "sacred-texts", slug: "the-satapatha-brahmana-part-i", dir: "vedas/brahmanas/shatapatha", title: "Shatapatha Brahmana, Part I", translator: "Julius Eggeling", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-satapatha-brahmana-part-ii", dir: "vedas/brahmanas/shatapatha", title: "Shatapatha Brahmana, Part II", translator: "Julius Eggeling", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-satapatha-brahmana-part-iii", dir: "vedas/brahmanas/shatapatha", title: "Shatapatha Brahmana, Part III", translator: "Julius Eggeling", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-satapatha-brahmana-part-iv", dir: "vedas/brahmanas/shatapatha", title: "Shatapatha Brahmana, Part IV", translator: "Julius Eggeling", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-satapatha-brahmana-part-v", dir: "vedas/brahmanas/shatapatha", title: "Shatapatha Brahmana, Part V", translator: "Julius Eggeling", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-grihya-sutras-part-1-sbe29", dir: "vedas/vedangas/kalpa/grihya-sutras", title: "Grihya Sutras, Part I", translator: "Hermann Oldenberg", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-grihya-sutras-part-2-sbe30", dir: "vedas/vedangas/kalpa/grihya-sutras", title: "Grihya Sutras, Part II", translator: "Hermann Oldenberg", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-sacred-laws-of-the-aryas", dir: "vedas/vedangas/kalpa/dharma-sutras", title: "Dharma Sutras of Apastamba and Gautama", translator: "Georg Bühler", lang: "en", study: 5 },
  { source: "sacred-texts", slug: "the-sacred-laws-of-the-aryas-part-ii-vasishtha-and-baudhayana", dir: "vedas/vedangas/kalpa/dharma-sutras", title: "Dharma Sutras of Vasishtha and Baudhayana", translator: "Georg Bühler", lang: "en", study: 5 },

  // ---------- UPANISHADS: the principal ones first, then the minor (Yoga / Sannyasa / Samanya Vedanta) ----------
  { source: "sacred-texts", slug: "the-upanishads-part-1-sbe01", dir: "upanishads/principal", title: "The Upanishads, Part I (Chandogya, Kena, Aitareya, Kaushitaki, Isha)", translator: "F. Max Müller", lang: "en", study: 1 },
  { source: "sacred-texts", slug: "the-upanishads-part-ii", dir: "upanishads/principal", title: "The Upanishads, Part II (Katha, Mundaka, Taittiriya, Brihadaranyaka, Svetasvatara, Prasna, Maitrayani)", translator: "F. Max Müller", lang: "en", study: 1 },
  { source: "sacred-texts", slug: "thirty-minor-upanishads", dir: "upanishads/minor", title: "Thirty Minor Upanishads", translator: "K. Narayanasvami Aiyar", lang: "en", study: 2 },

  // ---------- ITIHASA ----------
  { source: "sacred-texts", slug: "the-bhagavadgita", dir: "itihasa/bhagavad-gita", title: "The Bhagavadgita (with the Sanatsugatiya and the Anugita)", translator: "Kashinath Trimbak Telang", lang: "en", study: 1 },
  { source: "sacred-texts", slug: "the-bhagavad-gita-2", dir: "itihasa/bhagavad-gita", title: "The Song Celestial (Bhagavad Gita)", translator: "Edwin Arnold", lang: "en", study: 1 },
  { source: "sacred-texts", slug: "ramayan-of-valmiki", dir: "itihasa/ramayana/valmiki", title: "The Ramayana of Valmiki", translator: "Ralph T. H. Griffith", lang: "en", study: 2 },
  ...["1-adi", "2-sabha", "3-vana", "4-virata", "5-udyoga", "6-bhishma", "7-drona", "8-karna", "9-shalya", "10-sauptika", "11-stri",
    "12-santi", "13-anusasana", "14-aswamedha", "15-asramavasika", "16-mausala", "17-mahaprasthanika", "18-svargarohanika"].map((p) => {
    const [n, name] = [p.split("-")[0], p.split("-").slice(1).join("-")];
    const nice = name[0].toUpperCase() + name.slice(1);
    return { source: "sacred-texts", slug: `the-mahabharata-book-${n}-${name}-parva`, dir: `itihasa/mahabharata/${String(n).padStart(2, "0")}-${name}-parva`,
      title: `Mahabharata, Book ${n}: ${nice} Parva`, translator: "Kisari Mohan Ganguli", lang: "en", study: n === "6" || n === "12" ? 2 : 4 };
  }),

  // ---------- PURANAS ----------
  { source: "sacred-texts", slug: "the-vishnu-purana", dir: "puranas/vishnu", title: "Vishnu Purana", translator: "Horace Hayman Wilson", lang: "en", study: 2 },
  { source: "sacred-texts", slug: "the-garuda-purana", dir: "puranas/garuda", title: "Garuda Purana (Preta Kalpa)", translator: "Ernest Wood and S. V. Subrahmanyam", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "the-s-rimad-devi-bhagawatam", dir: "puranas/devi-bhagavata", title: "Srimad Devi Bhagavatam", translator: "Swami Vijnanananda", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "the-devi-gita", dir: "puranas/devi-bhagavata/devi-gita", title: "The Devi Gita", translator: "Swami Vijnanananda", lang: "en", study: 2 },

  // ---------- SMRITI ----------
  { source: "sacred-texts", slug: "the-laws-of-manu", dir: "smriti/manu", title: "The Laws of Manu (Manusmriti)", translator: "Georg Bühler", lang: "en", study: 4 },
  { source: "sacred-texts", slug: "the-institutes-of-vishnu", dir: "smriti/vishnu", title: "The Institutes of Vishnu (Vishnu Smriti)", translator: "Julius Jolly", lang: "en", study: 5 },

  // ---------- DARSHANAS (schools of philosophy) and yoga ----------
  { source: "sacred-texts", slug: "the-yoga-sutras-of-patanjali", dir: "darshana/yoga/yoga-sutras", title: "The Yoga Sutras of Patanjali", translator: "Charles Johnston", lang: "en", study: 1 },
  { source: "sacred-texts", slug: "hatha-yoga-pradipika", dir: "darshana/yoga/hatha-yoga-pradipika", title: "Hatha Yoga Pradipika", translator: "Pancham Sinh", lang: "en", study: 2 },
  { source: "sacred-texts", slug: "vedanta-sutras", dir: "darshana/vedanta/brahma-sutras", title: "Vedanta Sutras with Shankara's Commentary, Part I", translator: "George Thibaut", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "vedanta-sutras-with-the-commentary-by-sankarakarya-part-ii", dir: "darshana/vedanta/brahma-sutras", title: "Vedanta Sutras with Shankara's Commentary, Part II", translator: "George Thibaut", lang: "en", study: 3 },
  { source: "sacred-texts", slug: "the-vedanta-sutras", dir: "darshana/vedanta/brahma-sutras", title: "Vedanta Sutras with Ramanuja's Commentary (Sri Bhashya)", translator: "George Thibaut", lang: "en", study: 4 },
  { source: "sacred-texts", slug: "the-sankhya-aphorisms-of-kapila", dir: "darshana/samkhya", title: "The Sankhya Aphorisms of Kapila", translator: "James R. Ballantyne", lang: "en", study: 4 },
  { source: "sacred-texts", slug: "the-crest-jewel-of-wisdom", dir: "darshana/vedanta/shankara", title: "Vivekachudamani (The Crest-Jewel of Wisdom)", translator: "Charles Johnston", lang: "en", study: 2 },
  { source: "sacred-texts", slug: "select-works-of-sri-sankaracharya", dir: "darshana/vedanta/shankara", title: "Select Works of Sri Sankaracharya", translator: "S. Venkataramanan", lang: "en", study: 2 },

  // ======================= SANSKRIT ORIGINALS (GRETIL, in Devanagari) =======================
  // files: inside corpus-sources/gretil/1_sanskr/ ; label: how a passage is cited ("Rigveda 1.1")
  // depth: how many leading numbers name a chapter (the rest is the verse); default = all but the last
  { source: "gretil", dir: "vedas/rigveda/samhita", title: "Rigveda Samhita", label: "Rigveda", depth: 2, study: 3,
    files: Array.from({ length: 10 }, (_, i) => `1_veda/1_sam/1_rv/rv_${String(i + 1).padStart(2, "0")}_u.htm`) },
  { source: "gretil", dir: "vedas/samaveda/samhita", title: "Samaveda Samhita (Kauthuma)", label: "Samaveda", format: "samaveda", study: 4, files: ["1_veda/1_sam/samavedu.htm"] },
  { source: "gretil", dir: "vedas/yajurveda/krishna-maitrayani-samhita", title: "Krishna Yajurveda (Maitrayani Samhita)", label: "Maitrayani Samhita", format: "pages", study: 5, files: ["1_veda/1_sam/maitrs_pu.htm"] },
  { source: "gretil", dir: "vedas/atharvaveda/samhita", title: "Atharvaveda Samhita (Shaunaka)", label: "Atharvaveda", depth: 2, study: 4, files: ["1_veda/1_sam/avs___u.htm"] },
  { source: "gretil", dir: "vedas/brahmanas/shatapatha", title: "Shatapatha Brahmana", label: "Shatapatha Brahmana", format: "shatapatha", study: 5,
    files: Array.from({ length: 14 }, (_, i) => `1_veda/2_bra/satapath/sb_${String(i + 1).padStart(2, "0")}_u.htm`) },
  { source: "gretil", dir: "vedas/brahmanas/kaushitaki", title: "Kaushitaki Brahmana", label: "Kaushitaki Brahmana", study: 5, files: ["1_veda/2_bra/kausibru.htm"] },
  { source: "gretil", dir: "vedas/brahmanas/gopatha", title: "Gopatha Brahmana", label: "Gopatha Brahmana", study: 5, files: ["1_veda/2_bra/gopbra_u.htm"] },
  { source: "gretil", dir: "vedas/aranyakas/shankhayana", title: "Shankhayana Aranyaka", label: "Shankhayana Aranyaka", study: 5, files: ["1_veda/3_ara/sankharu.htm"] },
  { source: "gretil", dir: "vedas/vedangas/nirukta", title: "Nirukta of Yaska", label: "Nirukta", study: 5, files: ["1_veda/5_vedang/3_pratis/niruktau.htm"] },
  { source: "gretil", dir: "vedas/vedangas/kalpa/grihya-sutras", title: "Ashvalayana Grihya Sutra", label: "Ashvalayana Grihya Sutra", study: 5, files: ["1_veda/5_vedang/2_grhya/asvgs_u.htm"] },
  { source: "gretil", dir: "vedas/vedangas/kalpa/grihya-sutras", title: "Shankhayana Grihya Sutra", label: "Shankhayana Grihya Sutra", study: 5, files: ["1_veda/5_vedang/2_grhya/sankhgsu.htm"] },
  { source: "gretil", dir: "vedas/vedangas/kalpa/shrauta-sutras", title: "Ashvalayana Shrauta Sutra", label: "Ashvalayana Shrauta Sutra", study: 5, files: ["1_veda/5_vedang/1_srauta/asvss_u.htm"] },

  { source: "gretil", dir: "upanishads/principal/isha", title: "Isha Upanishad", label: "Isha Upanishad", study: 1, files: ["1_veda/4_upa/isup___u.htm"] },
  { source: "gretil", dir: "upanishads/principal/katha", title: "Katha Upanishad", label: "Katha Upanishad", study: 1, files: ["1_veda/4_upa/kathop_u.htm"] },
  { source: "gretil", dir: "upanishads/principal/prashna", title: "Prashna Upanishad", label: "Prashna Upanishad", study: 1, files: ["1_veda/4_upa/prasup_u.htm"] },
  { source: "gretil", dir: "upanishads/principal/mandukya", title: "Mandukya Upanishad", label: "Mandukya Upanishad", study: 1, files: ["1_veda/4_upa/mandup_u.htm"] },
  { source: "gretil", dir: "upanishads/principal/mandukya", title: "Gaudapada's Mandukya Karika", label: "Mandukya Karika", study: 2, files: ["1_veda/4_upa/gmandk_u.htm"] },
  { source: "gretil", dir: "upanishads/principal/aitareya", title: "Aitareya Upanishad", label: "Aitareya Upanishad", study: 1, files: ["1_veda/4_upa/aitup__u.htm"] },
  { source: "gretil", dir: "upanishads/principal/chandogya", title: "Chandogya Upanishad", label: "Chandogya Upanishad", study: 1, files: ["1_veda/4_upa/chup___u.htm"] },
  { source: "gretil", dir: "upanishads/principal/brihadaranyaka", title: "Brihadaranyaka Upanishad", label: "Brihadaranyaka Upanishad", study: 1, files: ["1_veda/4_upa/brup___u.htm"] },
  { source: "gretil", dir: "upanishads/principal/shvetashvatara", title: "Shvetashvatara Upanishad", label: "Shvetashvatara Upanishad", study: 1, files: ["1_veda/4_upa/svetu_pu.htm"] },
  { source: "gretil", dir: "upanishads/minor/kaivalya", title: "Kaivalya Upanishad", label: "Kaivalya Upanishad", study: 2, files: ["1_veda/4_upa/kaivup_u.htm"] },
  { source: "gretil", dir: "upanishads/minor/garbha", title: "Garbha Upanishad", label: "Garbha Upanishad", study: 3, files: ["1_veda/4_upa/garbhupu.htm"] },

  { source: "gretil", dir: "itihasa/bhagavad-gita", title: "Bhagavad Gita", label: "Bhagavad Gita", depth: 1, study: 1, files: ["2_epic/mbh/ext/bhagvg_u.htm"] },
  { source: "gretil", dir: "itihasa/ramayana/valmiki", title: "Valmiki Ramayana (Critical Edition)", label: "Valmiki Ramayana", depth: 2, study: 3,
    files: [1, 2, 3, 4, 5, 6, 7].map((k) => `2_epic/ramayana/ram_0${k}_u.htm`) },
  { source: "gretil", dir: "itihasa/mahabharata/sanskrit", title: "Mahabharata (Critical Edition)", label: "Mahabharata", depth: 2, study: 5,
    files: Array.from({ length: 18 }, (_, i) => `2_epic/mbh/mbh_${String(i + 1).padStart(2, "0")}_u.htm`) },

  { source: "gretil", dir: "puranas/bhagavata", title: "Bhagavata Purana", label: "Bhagavata Purana", depth: 2, study: 2,
    files: Array.from({ length: 12 }, (_, i) => `3_purana/bhagp/bhp_${String(i + 1).padStart(2, "0")}u.htm`) },
  { source: "gretil", dir: "puranas/vishnu", title: "Vishnu Purana", label: "Vishnu Purana", study: 3, files: ["3_purana/visnup_u.htm"] },
  { source: "gretil", dir: "puranas/shiva", title: "Shiva Purana (Books 1 and 7)", label: "Shiva Purana", study: 3, files: ["3_purana/sivap1_u.htm", "3_purana/sivap7_u.htm"] },
  { source: "gretil", dir: "puranas/linga", title: "Linga Purana", label: "Linga Purana", study: 4, files: ["3_purana/lip_1_pu.htm", "3_purana/lip_2__u.htm"] },
  { source: "gretil", dir: "puranas/garuda", title: "Garuda Purana", label: "Garuda Purana", study: 4, files: ["3_purana/garup1_u.htm", "3_purana/garup2_u.htm", "3_purana/garup3_u.htm"] },
  { source: "gretil", dir: "puranas/markandeya", title: "Markandeya Purana", label: "Markandeya Purana", study: 3, files: ["3_purana/mkp1-93u.htm"] },
  { source: "gretil", dir: "puranas/kurma", title: "Kurma Purana", label: "Kurma Purana", study: 4, files: ["3_purana/kurmp1_u.htm", "3_purana/kurmp2_u.htm"] },
  { source: "gretil", dir: "puranas/brahmanda", title: "Brahmanda Purana", label: "Brahmanda Purana", study: 4, files: ["3_purana/brndp1_u.htm", "3_purana/brndp2_u.htm", "3_purana/brndp3_u.htm"] },
  { source: "gretil", dir: "puranas/narada", title: "Narada Purana", label: "Narada Purana", study: 4, files: ["3_purana/nardp1_u.htm", "3_purana/nardp2_u.htm"] },
  { source: "gretil", dir: "puranas/matsya", title: "Matsya Purana (Chapters 1-176)", label: "Matsya Purana", study: 4, files: ["3_purana/mtp176pu.htm"] },
  { source: "gretil", dir: "puranas/vamana", title: "Vamana Purana", label: "Vamana Purana", study: 4, files: ["3_purana/vamp__u.htm"] },
  { source: "gretil", dir: "puranas/brahma", title: "Brahma Purana", label: "Brahma Purana", study: 4, files: ["3_purana/brahmap/brahmppu.htm"] },
  { source: "gretil", dir: "puranas/agni", title: "Agni Purana", label: "Agni Purana", study: 4, files: ["3_purana/agp_bi_u.htm"] },
  { source: "gretil", dir: "puranas/skanda", title: "Skanda Purana (Chapters 1-31)", label: "Skanda Purana", study: 4, files: ["3_purana/skp031pu.htm"] },
  { source: "gretil", dir: "puranas/narasimha", title: "Narasimha Purana", label: "Narasimha Purana", study: 4, files: ["3_purana/narsippu.htm"] },
  { source: "gretil", dir: "puranas/devi-bhagavata/devi-gita", title: "Devi Gita", label: "Devi Gita", study: 2, files: ["3_purana/dbhp_dgu.htm"] },

  { source: "gretil", dir: "darshana/yoga/yoga-sutras", title: "Yoga Sutras of Patanjali", label: "Yoga Sutra", study: 1, files: ["6_sastra/3_phil/yoga/yogasutu.htm"] },
  { source: "gretil", dir: "darshana/yoga/hatha-yoga-pradipika", title: "Hatha Yoga Pradipika", label: "Hatha Yoga Pradipika", study: 2, files: ["6_sastra/3_phil/yoga/hathyopu.htm"] },
  { source: "gretil", dir: "darshana/yoga/gheranda-samhita", title: "Gheranda Samhita", label: "Gheranda Samhita", study: 2, files: ["6_sastra/3_phil/yoga/ghers_pu.htm"] },
  { source: "gretil", dir: "darshana/vedanta/brahma-sutras", title: "Brahma Sutras", label: "Brahma Sutra", study: 2, files: ["6_sastra/3_phil/vedanta/brahmsuu.htm"] },
  { source: "gretil", dir: "darshana/vedanta/shankara", title: "Vivekachudamani", label: "Vivekachudamani", study: 2, files: ["6_sastra/3_phil/vedanta/vivcud_u.htm"] },
  { source: "gretil", dir: "darshana/samkhya", title: "Samkhya Karika of Ishvarakrishna", label: "Samkhya Karika", study: 3, files: ["6_sastra/3_phil/samkhya/iskar_u.htm"] },
  { source: "gretil", dir: "darshana/nyaya", title: "Nyaya Sutras of Gautama", label: "Nyaya Sutra", study: 4, files: ["6_sastra/3_phil/nyaya/gaunys_u.htm"] },
  { source: "gretil", dir: "darshana/vaisheshika", title: "Vaisheshika Sutras of Kanada", label: "Vaisheshika Sutra", study: 4, files: ["6_sastra/3_phil/vaisesik/vaisessu.htm"] },
  { source: "gretil", dir: "darshana/mimamsa", title: "Mimamsa Sutras of Jaimini", label: "Mimamsa Sutra", study: 5, files: ["6_sastra/3_phil/mimamsa/jaimsutu.htm"] },
];
