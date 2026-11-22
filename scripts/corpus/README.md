# Krishna Sakha's library (clean texts, no OCR)

His knowledge is built only from clean, already-typed texts. OCR is kept for rare commentaries that exist
nowhere else (put such a book in `library/books/Rare/`).

| Step | Command | What it does |
|---|---|---|
| 1 | `node scripts/corpus/fetch-sacred-texts.mjs` | Downloads the public-domain English translations from sacred-texts.com (Griffith, Max Müller, Ganguli, Wilson, Telang, Thibaut, …), one page every 2.5 s, most important texts first. Resumes where it stopped. Each finished book is added to the library at once. |
| 2 | download `https://gretil.sub.uni-goettingen.de/gretil/1_sanskr.zip` into `../corpus-sources/gretil/` and unzip it there | The Sanskrit originals (GRETIL, CC BY-NC-SA 4.0). |
| 3 | `node scripts/corpus/build-corpus.mjs` | Writes one file per work into `library/books/<category>/…` and `library/CATALOGUE.md`. |

What each library file contains:
- a header: title, translator or editor, year, language, source address, licence, category, and `clean: yes`
  (so the reader never sends it to OCR)
- `[ref Rigveda 1.1]` before every hymn / chapter / section, so every passage he finds carries its exact place
- Sanskrit converted letter by letter from GRETIL's Roman spelling (IAST) into Devanagari, with sandhi joined as
  printed editions do, and each verse's number after it: `… ॥ 2.47 ॥` (so "Gita 2.47" is found exactly)

Filing (texts never mix): `vedas/<veda>/<samhita|brahmanas|aranyakas|vedangas>`, `upanishads/<principal|minor>/…`,
`itihasa/<bhagavad-gita|ramayana/valmiki|mahabharata/NN-parva>`, `puranas/<purana>`, `smriti/…`, `darshana/<school>`.
The catalogue of works, translators and study order is `works.mjs`; `iast.mjs` is the Sanskrit converter
(`node scripts/corpus/iast.mjs` tests it).

Not included on purpose: modern translations still under copyright (e.g. the Motilal Banarsidass Purana series,
recent "108 Upanishads" translations, Gita Press Hindi editions).
