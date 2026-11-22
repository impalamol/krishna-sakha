# Digital Twin Blueprint

How the existing talking, learning AI avatar was built, and how to reuse the same engine to create a digital version of yourself, with your face, your voice and your knowledge.

This document leaves out the current persona (the monk's personality, the scripture focus, the mantras). It covers only the reusable engine: **learning, understanding, speaking, listening, and interacting.**

---

## 0. Instructions for the AI agent reading this file

> **If you are an AI coding agent (Claude Code or similar) and a user has given you this file, follow this section first. It is a build procedure, not just documentation.**

### Step 1: Ask for `personality.md`

1. Look for a `personality.md` file: first where the user pointed you, then the working directory, then `prompt/personality.md`.
2. **If it is missing**, do not start building. Tell the user:
   > "To create your digital version I need a `personality.md` file that describes you. I can (a) create a blank template for you to fill in, or (b) interview you now and write it for you. Which do you prefer?"
   - **(a) Template:** copy [Appendix A](#appendix-a-personalitymd-template) into `personality.md` (or copy `PERSONALITY-TEMPLATE.md` if it sits next to this file). Ask the user to fill it in and tell you when it is done. Then stop and wait.
   - **(b) Interview:** ask the Appendix A questions a few at a time, in plain language. Write the answers into `personality.md` in the template's format. Show it to the user and ask them to confirm or correct it before continuing.
3. **If it exists**, read it fully and validate it (Step 2).

### Step 2: Validate `personality.md`

- **Required:** `name`, `display_name`, `languages`, `voice.gender`, `about`, `how_i_speak`, `boundaries`, `consent.is_self` = `yes`.
- If `consent.is_self` is not `yes`, the person described must have given written consent (`consent.written_consent_from_person` = `yes`). If neither is true, **stop and refuse to build**: a digital version of a real person needs that person's permission.
- If any required field is empty, list the missing fields and ask the user only for those.
- Optional fields that are empty get sensible defaults. Tell the user which defaults you chose.

### Step 3: Collect assets (ask, don't block)

Ask the user for the paths to the following. Any of them can be skipped, and the build continues with the fallback:

| Asset | Used for | If skipped |
|---|---|---|
| Front photo, plus optional mouth-open and eyes-closed photos (`face.photos`) | Level 1 face (section 14.1) | Keep a generic stylised face, recoloured with `face.style` |
| Voice samples or a trained voice model (`voice.samples` / `voice.model`) | Cloned voice (section 14.2) | Microsoft neural voice of `voice.gender` per language |
| Knowledge files and links (`knowledge.*`) | The library (section 14.4) | Start with only the "About me" Q&A generated from `personality.md` |

### Step 4: Build

Follow the [migration checklist](#15-step-by-step-migration-checklist), applying each `personality.md` field to its place in the code:

| `personality.md` field | Apply to |
|---|---|
| `name`, `display_name`, `tagline` | `public/index.html` (title, headings, labels), `public/app.js` (status texts), `package.json` name, server start-up log |
| `about`, `how_i_speak`, `expertise`, `opinions`, `boundaries`, `catchphrases` | Generate `prompt/me.md` (structure in section 14.3); point `SYSTEM_PROMPT` in `server.js` at it |
| `greeting`, `thinking_lines`, `small_talk` | Greeting and hold lines in `public/app.js`; `TALK` replies in `library-answer.js`; prewarmed lines in `server.js` |
| `languages`, `default_language` | Language list in `/api/config`, recognition default in `public/voice.js`, `WHISPER_LANGUAGE` in `.env` |
| `voice.*` | `tts.js` engine order and voice names; delete `tts-cache/` |
| `face.*` | Build `public/avatar-me.js` implementing the avatar API (section 10.1); colours and look from `face.style` |
| `faq` | Write `library/notes/about-me-qa.md` (the learner reads it automatically) |
| `knowledge.*` | Copy files into `library/books`, `library/media`, `library/notes`; links into `library/links.txt` |
| `study_focus` | The study prompts and schema in `understand.js` (section 14.4) |
| `ai_disclosure_label` | A visible label on the page, and the first rule in `prompt/me.md` |

Rules while building:
- Work in a **copy** of the project (Phase 0). Never modify the original project, and never copy its `library/` or `tts-cache/`.
- Remove every trace of the original persona: names, mantras, scripture-specific prompts and wording (Phase 1).
- Never put the user's photos, voice model or `.env` in a public place.

### Step 5: Verify and report

1. Start the server and open the page.
2. Ask five questions answered in `personality.md` and check that the answers match it.
3. Check: the voice speaks, the lips move, the eyes blink, offline answers work without the API key, and the AI disclosure label is visible.
4. Report to the user what was built, which defaults or fallbacks were used, and what is still missing (for example "voice not cloned yet: add samples to upgrade").

### Updating later

When the user edits `personality.md` and gives it to you again, re-run Steps 2 and 4 **only for the changed fields**. Keep the library and everything already learned.

---

## Contents

0. [Instructions for the AI agent](#0-instructions-for-the-ai-agent-reading-this-file)
1. [What the engine does](#1-what-the-engine-does)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Technology stack](#3-technology-stack)
4. [Project layout](#4-project-layout)
5. [Learning: how it reads, listens and remembers](#5-learning-how-it-reads-listens-and-remembers)
6. [Understanding: turning reading into knowledge](#6-understanding-turning-reading-into-knowledge)
7. [Answering: how it uses what it learned](#7-answering-how-it-uses-what-it-learned)
8. [Speaking: the voice](#8-speaking-the-voice)
9. [Listening: voice chat](#9-listening-voice-chat)
10. [The avatar: face, lip-sync and expressions](#10-the-avatar-face-lip-sync-and-expressions)
11. [Interaction: camera presence, live reading display, controls](#11-interaction-camera-presence-live-reading-display-controls)
12. [Server API](#12-server-api)
13. [Lessons learned (problems already solved)](#13-lessons-learned-problems-already-solved)
14. [Building your digital twin](#14-building-your-digital-twin)
15. [Step-by-step migration checklist](#15-step-by-step-migration-checklist)
16. [Costs and hardware](#16-costs-and-hardware)
17. [Safety, consent and honesty](#17-safety-consent-and-honesty)
18. [Appendix A: personality.md template](#appendix-a-personalitymd-template)

---

## 1. What the engine does

| Ability | What happens |
|---|---|
| **Learns by itself** | Reads every book, document, recording, video and web link you give it, one at a time, around the clock. Scanned books are read page by page with OCR. Audio and video are transcribed with Whisper. |
| **Understands** | After reading a work, it studies it: it takes close-reading notes on every part, then writes a structured "understanding" (essence, key ideas, how they connect, common misunderstandings, self-test questions). |
| **Answers from what it learned** | Questions are grounded in its library: understanding first, then exact passages with book and page. It can answer page-specific questions ("what is on page 65 of X?"). |
| **Works without the AI** | If the Claude API is unavailable (no credits, outage, bad key), it still answers from its own library offline, translated into the visitor's language. |
| **Speaks naturally** | Neural male voices in 13 languages, with a free offline fallback. Audio is cached. |
| **Listens** | Voice chat in the browser: you speak, it replies aloud. While it prepares the answer it says a short holding line, so it never feels frozen. |
| **Has a living face** | Animated face: breathing, blinking, gaze, smiling, a "reading" pose, and lip-sync driven by the actual audio. |
| **Notices people** | Optional camera: detects that someone is in front of the screen (in the browser only), follows them with its eyes, and greets them. |
| **Shows what it is reading** | The words it is reading drift behind it. When the page has a real picture, the picture fades in, blended with no white paper. |

---

## 2. Architecture at a glance

```
                         ┌──────────────────────── BROWSER (public/) ────────────────────────┐
                         │  index.html + styles.css                                          │
   Visitor ── speaks ──► │  voice.js   speech recognition (mic) → text                       │
                         │             audio playback + analyser → lip-sync                  │
                         │  app.js     chat UI, streaming answers, status pill, Resume,      │
                         │             live reading display                                   │
                         │  avatar.js  animated face (canvas + SVG): blink, gaze, visemes     │
                         │  camera.js  MediaPipe face detection (on-device, opt-in)           │
                         │  knowledge.js  Ask / Books / Audio / Video panel                   │
                         │  library.js    owner-only upload panel                             │
                         └───────────────▲───────────────────────────┬───────────────────────┘
                                         │  HTTP (JSON, SSE stream, audio)                     │
                         ┌───────────────┴───────────────────────────▼───────────────────────┐
                         │                    NODE SERVER (server.js)                         │
                         │  /api/chat ──► library context ──► Claude (streamed)               │
                         │             └► offline fallback: library-answer.js                 │
                         │  /api/tts  ──► tts.js (Edge neural → Piper → browser)              │
                         │  /api/status, /api/knowledge/*, /api/reading/*, /api/learner/*     │
                         └───┬──────────────┬──────────────┬──────────────┬──────────────────┘
                             │              │              │              │
                 learner.js  │   knowledge.js│ understand.js │  translate.js│
          (reads, OCR, ASR)  │  (search,     │ (study notes, │  (NLLB,       │
           asr-worker.mjs    │   page lookup)│  reflection)  │   offline)    │
           picture.js        │               │               │               │
                             ▼              ▼              ▼              ▼
                    library/  books/ media/ notes/ links.txt
                    library/.knowledge/  ← everything it has learned (plain text + JSON)
```

**Key design principle:** everything it learns is saved as plain files in `library/.knowledge/`. The AI model is used for *thinking*, not for *remembering*. You can swap models, go offline, or move the whole brain to another computer by copying one folder.

---

## 3. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 22**, plain `http` server, ES modules | No framework. One `node server.js` starts everything. |
| AI brain | **Claude Opus 5.5** (`claude-opus-5-5`) via `@anthropic-ai/sdk`, streamed | Best reasoning for answers and reflection. |
| Fast AI | **Claude Haiku 5.5** (`claude-haiku-5-5`) | Cheap close-reading notes, title checks. |
| Local brain (free) | **Ollama + Gemma 3 4B** (`local-brain.js`, persona `prompt/local-brain.md`) | When Claude is unavailable it still answers in its own words from the library and keeps studying by itself. Whole model on the GPU (`OLLAMA_GPU_LAYERS=99`) is ~4× faster on a 4 GB card. |
| PDF text | `pdfjs-dist` | Text layer and page rendering. |
| Page images | `@napi-rs/canvas` | Renders PDF pages for OCR and picture detection. |
| OCR | `tesseract.js` (Hindi + English traineddata) | Free, offline, page by page. |
| EPUB / DOCX | `jszip`, `mammoth` | Extract text. |
| Speech-to-text | **Whisper medium** (`Xenova/whisper-medium`, q8) via `@huggingface/transformers` | Offline. Runs in a separate worker process. |
| Audio decode | `ffmpeg-static` | Any audio/video → 16 kHz mono. |
| Translation | **NLLB-200 distilled 600M** (offline) | Answers in the visitor's language without the API. Non-commercial licence. |
| Text-to-speech | `msedge-tts` (Microsoft neural voices), **Piper** (offline fallback), browser voice (last resort) | Accurate pronunciation, free. |
| Speech recognition | Browser Web Speech API | Zero cost, works in Chrome/Edge. |
| Face detection | MediaPipe Tasks Vision (vendored in `public/vendor/mediapipe`) | Runs on-device. No video leaves the browser. |
| Avatar | Canvas 2D + inline SVG | Light, no GPU needed, fully controllable. |
| Testing | `puppeteer-core` with system Chrome, fake `SpeechRecognition` | End-to-end voice-chat tests without a microphone. |

---

## 4. Project layout

```
server.js            web server, chat proxy, all API routes, wiring of every module
learner.js           background reader: text, PDF, EPUB, DOCX, HTML, OCR, audio/video transcription
asr-worker.mjs       Whisper in a child process (keeps the server's memory safe)
picture.js           finds real pictures on a scanned page (not text) and crops them
knowledge.js         offline search over everything learned; page lookup; book matching
understand.js        study pipeline: notes per part → reflection → understanding JSON
library-answer.js    offline answers: small talk, page questions, summaries, passages
pro-summary.js       AI-written whole-book summaries, cached per book + language
titles.js            reads the real title from inside each book
links.js             learns from links: YouTube subtitles, PDFs, web pages
translate.js         offline NLLB translation with disk cache
tts.js               voice engines with fallback chain and disk cache
library.js           owner-only upload API (password protected, streamed uploads, no size limit)
prompt/*.md          the persona / system prompt  ← you replace this for your twin
public/              the website (HTML, CSS, avatar, voice, camera, panels)
tools/piper/         offline TTS binary + voices
tools/models/        downloaded Whisper / NLLB models
library/             your source material (books/, media/, notes/, links.txt)
library/.knowledge/  everything learned (see below)
.env                 keys and switches (never commit)
```

**`library/.knowledge/` (the brain):**

```
index.json             manifest: every source, its status, pages, quality verdict, model used
<id>.txt               full extracted text, with [page N] markers (or [mm:ss] timestamps for talks)
learning-log.jsonl     history of what was read and when
state.json             what it is doing right now (for the status pill)
titles.json            real titles
links.json             progress on links
understanding/<id>.json  its understanding of each work
understanding/concepts.json  concepts across all works
pro-summaries/         cached AI summaries
```

---

## 5. Learning: how it reads, listens and remembers

`learner.js` runs forever in the background, **one source at a time** so the computer stays responsive.

### 5.1 The reading loop

1. Scan `library/books`, `library/media`, `library/notes` for files not yet in `index.json`.
2. Pick the next one (new books first; then OCR jobs; then recordings; then re-listens).
3. Extract text according to type:

| Type | Method |
|---|---|
| `.txt` `.md` | read directly |
| `.html` | strip scripts/menus, keep text |
| `.pdf` with text layer | `pdfjs` page by page → `[page N]` markers |
| `.pdf` scanned / old fonts / garbled | **OCR queue** (see 5.2) |
| `.epub` | unzip, read chapters in order |
| `.docx` | `mammoth` |
| `.srt` `.vtt` | subtitles → timed transcript |
| audio / video | **Whisper** (see 5.3) |

4. **Judge the quality** of the extracted text (`JUDGE_V`). Text that looks like gibberish (wrong font encoding, too many rare letters, broken words) is not trusted; it is sent to OCR instead. Bump `JUDGE_V` whenever the judge changes so old results are re-checked automatically.
5. Save `<id>.txt`, update `index.json`, append to `learning-log.jsonl`.

### 5.2 OCR (scanned books)

- Each page is rendered to a canvas and read by Tesseract (one persistent worker).
- **Progress is saved after every page**, so a restart continues where it stopped.
- Resume is crash-proof: if the partial file is missing but the final text exists, the book is marked done. If both are missing, it restarts at page 0. The manifest is saved *before* the partial file is deleted.
- `picture.js` checks each page for a real picture (dense filled regions, not text), crops it and offers it to the live display.

### 5.3 Listening (audio and video)

- Whisper runs in **`asr-worker.mjs`, a separate process** (`--max-old-space-size=4096`). The server only sends it `{file, start, len, language}` jobs.
- Audio is decoded by ffmpeg to 16 kHz float PCM in **60-second segments**. Whisper-medium uses about 0.6 GB per minute of audio, so long talks must never be processed in one go.
- The worker is **recycled every 5 segments** to release memory.
- Output is a timed transcript: `[12:34] text…`. Answers can then cite *when* something was said.
- Each recording remembers which model transcribed it (`asrModel`). Upgrade the model and old recordings are re-listened automatically.

### 5.4 Links

`library/links.txt` (or the upload panel) accepts:
- **YouTube with subtitles:** the subtitles become a timed transcript (no video download).
- **PDF links:** downloaded into `books/Web/` and read.
- **Web pages:** the text is saved and read.

### 5.5 Real titles

`titles.js` reads the biggest text on the first pages (font size from the PDF, or OCR line height), skips publisher and price lines, falls back to a cleaned file name, and optionally confirms the title with the fast model.

### 5.6 Pausing for conversation

When someone talks to it, learning **pauses** so the CPU serves the conversation (`hold()`). The visitor can press **Resume reading**, and it keeps reading for 15 minutes even while talking (`release()` / `keepReadingUntil`). The owner can also pause and resume manually.

---

## 6. Understanding: turning reading into knowledge

This is what makes it a thinker and not just a talker. `understand.js` runs after reading, in the background, once per work.

**Stage 1: Close reading (fast model).**
The text is split into parts of about 40,000 characters, keeping page markers. For each part the fast model writes structured study notes (JSON schema output): main ideas, arguments, definitions, examples, stories, practices, with page references. Notes are saved after each part, so the work is resumable.

**Stage 2: Reflection (main model).**
The main model reads all the notes and writes the **understanding** (validated with a JSON schema):

```
essence              what the work is really about, in a few sentences
structure            how it is organised
core_teachings       the central ideas, each explained
key_concepts         terms with clear definitions
how_ideas_connect    the reasoning that ties ideas together
practices            what it asks the reader to do
stories              illustrations / examples and what they show
misunderstandings    common wrong readings and the correct view
questions            10–15 self-test Q&A pairs
related_texts        links to other works
reading_quality      how reliable the source text was
```

**How it is used:**
- `relevant(question)` scores understandings with IDF keyword matching (Q&A pairs weighted higher, at most 3 per work) and returns the best matches.
- They go into the AI's context as `<my_understanding>`, **before** raw passages.
- Offline answers use them too.

**Safety valves:**
- It waits while a conversation is going on or the AI is down (`waitTurn`).
- Failed works are skipped until the pipeline version changes.
- It survives credit errors and resumes later.

**For your twin**, the same pipeline can study *your* writing, talks and notes and build an understanding of how *you* think. See section 14.4.

---

## 7. Answering: how it uses what it learned

### 7.1 With the AI on (`/api/chat`)

1. **Build library context** (`libraryContext` in `server.js`):
   - If the question names a page ("page 65", "pg 65", and the same in other languages), find the book and include that page's text.
   - Add the matching **understandings**.
   - Add the best **passages** from `knowledge.search()` with title and page.
2. **Call Claude**, streamed:
   - The `system` prompt is the persona file, with `cache_control` (prompt caching: the persona is paid once and reused cheaply).
   - The library context comes after the cache breakpoint, because it changes per question.
   - `output_config: { effort }` sets the depth (low / medium / high).
   - Server-side fallbacks keep answers coming during an outage.
3. Stream the text to the browser over Server-Sent Events. The browser renders markdown and speaks sentence by sentence.
4. Handle every failure kindly: rate limit, auth error, no credits, outage. On anything except a rate limit, **fall back to the offline answer**.

### 7.2 Offline (`library-answer.js`)

Order of checks:
1. **Small talk** ("thank you", "ok", "bye", praise; up to 6 words): instant friendly reply, never a random passage.
2. **Page questions:** the exact page text, translated if needed.
3. **"Summarise X" / "what is X about":** its understanding of that work, else the best passages.
4. **General questions:** understanding plus top passages, translated into the visitor's language with NLLB.

### 7.3 Search details (`knowledge.js`)

- Folding of spellings and scripts (`fold`, `canonText`) so different spellings of the same title match.
- `findBook` uses cross-script similarity, a title-closeness bonus, and a preference for searchable books.
- `pageText(id, n)` and `bookForPage(question)` answer page questions.

---

## 8. Speaking: the voice

`tts.js` turns text into audio with a **fallback chain**:

1. **Azure Speech** (if `AZURE_SPEECH_KEY` is set): official, free tier 0.5M characters/month.
2. **Microsoft neural voices through Edge "Read aloud"** (`msedge-tts`): the same studio voices, free, no key. It is unofficial, so after 2 failures it is skipped for 5 minutes.
3. **Piper** (offline, `tools/piper/piper.exe`): always available.
4. **Browser voice**: the page's last resort.

**Details that matter:**
- **Language by script:** the text's script picks the voice (Devanagari → Hindi or Marathi; Bengali, Tamil, Telugu… each have their own). The danda `।` is shared by several scripts, so it is excluded when detecting.
- **Cache:** every sentence is hashed (`text + voice + rate`) and stored in `tts-cache/`. Repeated lines are instant.
- **Prewarming:** common lines (greetings, "one moment…") are generated at startup.
- **Format sniffing:** Edge returns MP3, Piper returns WAV. The server sniffs the bytes to send the right `Content-Type`.
- The browser fetches audio **one sentence ahead** (prefetch) so speech flows without gaps.

---

## 9. Listening: voice chat

`public/voice.js`:
- Uses the browser's `SpeechRecognition` (Chrome / Edge). In "Auto" mode the language is `hi-IN`, which also understands Indian English well. The visitor can pick another language.
- **Audio unlock:** browsers block sound until the user interacts. The first click or key press unlocks audio silently; there is no pop-up.
- **Hold line:** if no answer text arrives within 1.5 s, it says a short "let me think" line, so silence never feels broken.
- The answer is split into sentences, and each is spoken as soon as it arrives (streaming).
- When it starts speaking, recognition pauses so it does not hear itself.

---

## 10. The avatar: face, lip-sync and expressions

`public/avatar.js` draws a **canvas background** (particles, halo, drifting text) plus an **SVG face** with separately controllable parts: head group, lids, pupils, brows, upper and lower lip, mouth cavity, teeth, beard.

### 10.1 The avatar API (keep this when you build your own face)

Everything else in the app talks to the face **only through this object**. Replace the drawing and keep the API, and the rest of the system works unchanged.

```js
window.SanatanAvatar = {
  setState(s),          // "idle" | "listening" | "thinking" | "speaking"
  getState(),
  setViseme(open, wide),// open 0..1 = jaw opening; wide 0 (round "oo") .. 1 (spread "ee")
  setReading(on),       // reading pose (eyes down / meditative)
  setLiveText(text),    // words currently being read (background)
  engage(ms),           // wake up and pay attention for ms
  celebrate(ms),        // joy animation (e.g. a book finished)
  smile(ms),
  lookAt(x, y),         // gaze target (mouse or camera face position)
};
```

### 10.2 Lip-sync

- The server's audio plays through an `<audio>` element connected to a Web Audio **`AnalyserNode`**.
- Every frame, the **RMS loudness** of the audio sets how far the jaw opens: `open = clamp((rms − 0.012) × 7)`.
- The **mouth shape** comes from the letter being spoken, estimated from the playback position (`currentTime / duration × text.length`) and mapped by `viseme(char)`:

| Sound | open | wide |
|---|---|---|
| a / आ | 0.95 | 0.55 |
| e, i / इ ए | 0.45 | 1.0 |
| o, u / उ ओ | 0.6 | 0.05 |
| m, b, p (lips closed) | 0 | 0.5 |
| f, v | 0.12 | 0.7 |
| pause / punctuation | 0.04 | 0.5 |

- With the browser voice (no audio stream), the lips follow the text at about 13.5 characters per second.
- Movement is smoothed (targets `tOpen` / `tWide` are eased every frame), which is what makes it look natural.

### 10.3 Life-like idle behaviour

- **Breathing:** slow scale and offset of the head.
- **Blinking:** random intervals, occasional double blinks.
- **Gaze:** follows the mouse, or the visitor's face when the camera is on; drifts when idle.
- **States:** listening (attentive brows), thinking (eyes up), speaking (lip-sync), reading (eyes lowered, meditative), celebrating (smile and glow).
- Respects `prefers-reduced-motion`.

---

## 11. Interaction: camera presence, live reading display, controls

**Camera (`camera.js`, opt-in):**
- MediaPipe face detector **in the browser**. No image ever leaves the device, and it does not identify people.
- Arrival is confirmed after 700 ms, leaving after 7 s, with no re-greeting within 20 s.
- Emits `sanatan-visitor` events. The page greets with a smile and starts a voice conversation; gaze follows the nearest face.

**Live reading display:**
- The server keeps `live = {id, page, text, image}`.
- `/api/reading/live` returns the text; `/api/reading/page.jpg` returns the cropped picture, or 204 when the page has none.
- The browser polls every 4 s. The text drifts in the background. A picture is blended with `invert + sepia + hue-rotate` and `mix-blend-mode: screen`, so white paper disappears. Each picture stays at least 25 s.

**Status pill and controls:** "Now reading X, page N", "Reflecting on X", counts of works read and understood, a **Resume reading** button, and an owner-only pause.

**Knowledge panel:** Ask / Books / Audio / Video tabs with counts and per-item status.

**Library panel (owner):** password-protected uploads of files and whole folders (streamed, no size limit) and links.

---

## 12. Server API

| Route | Purpose |
|---|---|
| `POST /api/chat` | streamed answer (SSE: `{t}` chunks, `{done}`, `{error}`) |
| `POST /api/tts` | `{text, lang, rate}` → audio |
| `GET /api/config` | languages, voices, chat on/off |
| `GET /api/status` | what it is reading, progress, paused state, counts |
| `POST /api/engage` | a visitor is active (pauses learning) |
| `POST /api/learner/continue` | visitor's Resume reading |
| `POST /api/learner/pause` / `resume` | owner controls (password) |
| `GET /api/reading/live` | the text being read right now |
| `GET /api/reading/page.jpg` | the picture on the current page (204 if none) |
| `GET /api/knowledge` | everything learned, with status |
| `GET /api/knowledge/search` | offline passage search |
| `POST /api/knowledge/ask` | offline answer |
| `GET /api/knowledge/summary` | summary of one work (streamed) |
| `/api/library/*` | owner uploads and links (from `library.js`) |

Rate limit: `RATE_LIMIT` requests per IP per 10 minutes. The API key stays on the server; it never reaches the browser.

---

## 13. Lessons learned (problems already solved)

Keep these fixes when you fork the project:

| Problem | Fix |
|---|---|
| Server crashed (out of memory) on long recordings | Whisper in a child process, 60 s segments, worker recycled every 5 segments |
| A model download was silently blocked | Set "local files only" per model, never globally |
| Port already used by another app | Separate `PORT` in `.env`, with a clear `EADDRINUSE` message |
| Voice chat seemed dead | Wrong recognition language; slow first answer, so a spoken hold line was added |
| Bengali was spoken by the Hindi voice | The danda `।` is shared by scripts; it was excluded from detection |
| Wrong book matched ("Gita" matched another title) | Canonical title folding plus a title-closeness bonus |
| Garbled PDF text counted as "read" | Quality judge with a rare-letter ratio; garbled text is sent to OCR |
| Hindi mistaken for Marathi and "translated" | Compare marker-word counts for both languages |
| Resume button "did nothing" | The next speech request re-paused it; Resume now overrides pauses for 15 minutes |
| Reading stopped forever after a restart | Crash-proof OCR resume, manifest saved before cleanup |
| "Thank you" returned a random passage | Small-talk detection before search |
| Pop-up to enable sound annoyed users | Unlock audio silently on the first natural click |
| Text pages shown as "images" | `picture.js` detects only real pictures and crops them |

---

## 14. Building your digital twin

You keep **sections 5–13 unchanged** (the engine) and replace four things: **face, voice, persona, knowledge**.

```
            KEEP (engine)                          REPLACE (you)
  learner · understand · knowledge          ┌─ Face    → your face, driven by setViseme etc.
  library-answer · translate · server  ───► ├─ Voice   → your cloned voice (Piper/other)
  voice.js (mic + lip-sync) · camera.js     ├─ Persona → prompt/you.md
                                            └─ Brain   → your writing, talks, notes, Q&A
```

### 14.1 Your face: three levels

Pick a level. All three plug into the same `window.Avatar` API (section 10.1), so you can start simple and upgrade later.

#### Level 1: Photo-driven 2D face (recommended start, free, runs on any computer)

Your own photo, animated in the browser with WebGL.

1. **Take the photo.** One front-facing photo: even light, neutral face, mouth closed, eyes open, at least 1024 px, plain background. Also take one with the mouth open ("aah") and one with eyes closed. These help with realism.
2. **Get face landmarks.** MediaPipe is already in `public/vendor/mediapipe`. Use **Face Landmarker** (478 points) on your photo once, and save the points to `public/me/landmarks.json`.
3. **Build a mesh.** Triangulate the landmarks (MediaPipe provides the canonical triangle list) and draw the photo as a texture on that mesh with WebGL (plain WebGL or three.js / PixiJS).
4. **Deform per frame:**
   - `setViseme(open, wide)`: move the lower-lip and jaw points down by `open`, the mouth corners in or out by `wide`. Draw a dark mouth-interior layer (with a teeth image) behind the lips, revealed when the mouth opens.
   - **Blink:** move the upper-lid points onto the lower-lid points, or cross-fade to your eyes-closed photo inside an eye mask.
   - **Gaze:** shift the iris region slightly inside the eye mask.
   - **Head motion and breathing:** small rotation and scale of the whole mesh.
   - **Smile:** raise the mouth corners and cheeks.
5. **Keep a "hologram" look if you like:** draw your face in duotone with glow and scan lines. A stylised look hides small warping artefacts much better than photoreal.

*Tip:* first copy `avatar.js` to `avatar-me.js` and implement the same API. Switch between them with one `<script>` tag.

#### Level 2: 3D head of you (more expressive, still real-time)

1. **Create a 3D head from photos:**
   - Free: Blender plus a photo-to-head add-on (e.g. KeenTools FaceBuilder).
   - Easier: a selfie-to-avatar service (for example Avaturn) that exports **GLB with ARKit blendshapes**.
   - Make sure the model has blendshapes such as `jawOpen`, `mouthFunnel`, `mouthPucker`, `mouthSmile_L/R`, `eyeBlink_L/R`.
2. **Render with three.js** in the page (`GLTFLoader`, soft lighting, optional hologram shader).
3. **Map the existing calls to blendshapes:**
   - `open` → `jawOpen`.
   - `wide` → `mouthStretch` / `mouthSmile` (high) or `mouthFunnel` / `mouthPucker` (low).
   - Blink → `eyeBlink_*`.
   - `lookAt` → head and eye bones.
4. **Better lip-sync (optional):** replace the letter-based `viseme()` with phoneme timing. For example, Azure Speech returns viseme events with timestamps. Otherwise keep the current amplitude + letter method; it already works well.
5. **Bonus, real expressions:** record yourself with MediaPipe Face Landmarker (it outputs 52 blendshape scores live). Save short clips of your real idle movements, nods and smiles, and replay them when idle. The twin then moves like *you*.

#### Level 3: Photoreal talking video (most realistic, needs a GPU)

- Open-source talking-head models (for example LivePortrait, MuseTalk, SadTalker-type models) take your photo or a short video of you and generate a video whose lips match the audio.
- **Real time needs a strong NVIDIA GPU.** A practical hybrid:
  - Pre-render frequent clips (greetings, idle loops, "let me think") as videos.
  - Use Level 1 or 2 live for new answers.
- Run the model as a separate Python service. The Node server sends it audio and receives a video stream. Keep the same states (idle / listening / thinking / speaking).

### 14.2 Your voice

The current voices are generic Microsoft voices. For a twin, clone **your** voice.

| Option | Cost | Quality | Fits this project |
|---|---|---|---|
| **Train a Piper voice on your recordings** | Free (needs a GPU for training, or a rented one for a few hours) | Good, very fast, **offline** | **Best fit:** `tts.js` already runs Piper; just add your `.onnx` voice file |
| Open-source voice cloning (XTTS-v2, F5-TTS, OpenVoice) | Free to run | Very natural from a short sample | Run as a small local service; check each model's licence (some are non-commercial) |
| Paid cloning APIs (ElevenLabs, Azure Custom Neural Voice) | Monthly fee | Excellent, many languages | Add as engine #1 in `tts.js`; keep Piper as offline fallback |

**Recording your voice (for any option):**
- A quiet room, a good USB microphone at a fixed distance, no music, the same mic every session.
- For cloning: 1–5 minutes of clean speech.
- For training Piper: 1–2 hours of read sentences (about 1,000–2,000 lines), one WAV per sentence, with a text file listing what each says.
- Record every language you want it to speak in your own voice. Otherwise keep the neural voices for the other languages.

**Plug it in:** in `tts.js`, add your engine at the top of the chain, keep the cache and fallbacks, and register your languages in `/api/config`.

### 14.3 Your persona (replace the system prompt)

Create `prompt/me.md` and point `server.js` at it (line 41: `const SYSTEM_PROMPT = readFileSync(path.join(__dirname, "prompt", "sanatan-system.md"), "utf8")` → `"me.md"`). Suggested sections:

```markdown
You are the digital version of <Your Name>, an AI built on Claude that speaks for and like <Name>.
You are an AI. Say so when asked. Never claim to be the real <Name>.

## Who I am           background, work, values, what I care about
## How I speak        tone, typical phrases, humour, sentence length, languages I mix
## What I know well   my fields; answer these from my library first
## What I don't do    topics I avoid, things I never promise on my behalf
## Opinions           my real positions on key topics (only what I have approved)
## Boundaries         no money/legal commitments, no private info about family/clients,
                      "I'll pass this to the real <Name>" for anything personal
## Using my library   prefer <my_understanding> and passages; cite the source; if my
                      library doesn't cover it, say "I haven't spoken about this yet"
```

Keep it **stable**. Prompt caching then makes every chat cheaper, because the persona is billed at the cached rate.

### 14.4 Your knowledge (what to put in `library/`)

The engine learns from anything you drop in. For a twin, feed it **you**:

| Folder | Put here |
|---|---|
| `library/books/` | your articles, blog posts, books, reports, presentations (PDF/DOCX), CV, portfolio write-ups |
| `library/media/` | recordings of your talks, interviews, podcasts, voice notes, videos (transcribed with Whisper) |
| `library/notes/` | an **"About me" Q&A** file you write yourself (100+ questions people ask you, with your real answers), your opinions, stories, FAQs |
| `library/links.txt` | your YouTube videos (with subtitles), your website pages, public posts |

Then adapt the **understanding pipeline** prompts in `understand.js` (the study prompt currently says it is a "student of …"):
- Stage 1 notes: *"Study this material by and about <Name>: note their ideas, opinions, stories, way of explaining and phrases, with page/time references."*
- Stage 2 reflection: replace the schema fields with, for example: `essence`, `my_views`, `how_i_reason`, `stories_i_tell`, `phrases_i_use`, `facts_about_me`, `things_i_would_not_say`, `questions` (Q&A in my voice).
- Optionally add a **self-profile** step: after all sources are understood, the main model merges them into `understanding/self.json`, a single portrait of how you think. Add it to every chat as `<who_i_am>`.

### 14.5 Memory of conversations (new, optional)

The current engine remembers *sources*, not *visitors*. For a twin you may want:
- **Session memory:** already present (the chat history is sent with each request).
- **Long-term memory per visitor** (only with consent): store a short summary per visitor ID in `library/.knowledge/visitors/`, and add it as context.
- **Learning from you:** an owner-only "Teach me" box. You correct an answer, the correction is saved into `library/notes/corrections.md`, and the learner picks it up automatically.

---

## 15. Step-by-step migration checklist

**Phase 0: Fork**
- [ ] Copy the whole project to a new folder (for example `my-twin/`), **without** `library/` and `tts-cache/`. Keep `tools/` (models and Piper) to avoid re-downloading.
- [ ] New `.env`: `ANTHROPIC_API_KEY`, `PORT`, `ADMIN_PASSWORD`, `MODEL`, `EFFORT`.
- [ ] `npm install`, `npm start`, open the page and confirm the old avatar works.

**Phase 1: Rename and de-persona**
- [ ] Replace names in the UI text: `public/index.html`, `public/app.js` (greetings, hold lines, status texts), page title, favicon.
- [ ] Rename `window.SanatanAvatar` → `window.Avatar` (search all `public/*.js`), and the `sanatan-*` events and storage keys.
- [ ] Remove the mantra background in `avatar.js` (`MANTRAS`); the live reading text can stay.
- [ ] Adapt the small-talk replies (`TALK` in `library-answer.js`) to your style.
- [ ] Replace `prompt/sanatan-system.md` with `prompt/me.md` (14.3).
- [ ] Generalise the study prompts and schema in `understand.js` (14.4).

**Phase 2: Your knowledge**
- [ ] Write the "About me" Q&A file → `library/notes/`.
- [ ] Add your documents, recordings and links.
- [ ] Set `WHISPER_LANGUAGE` to the language you mostly speak in your recordings.
- [ ] Let it read; check the Knowledge panel and fix unreadable items.
- [ ] Ask it 20 questions you know the answers to; correct the notes where it is wrong.

**Phase 3: Your voice**
- [ ] Record samples (14.2).
- [ ] Clone or train the voice; add the engine to `tts.js`; keep the fallbacks.
- [ ] Delete `tts-cache/` after switching voices, so old audio isn't reused.

**Phase 4: Your face**
- [ ] Take the photos (14.1).
- [ ] Build `avatar-me.js` implementing the same API (Level 1 first).
- [ ] Check: lip-sync on long Hindi and English answers, blinking, gaze following the mouse or camera, reading pose, smile.
- [ ] Test on a phone (layout and performance).

**Phase 5: Test and launch**
- [ ] Re-use the puppeteer tests (fake microphone → hold line → spoken answer).
- [ ] Test without the API key (offline answers must still work).
- [ ] Add a visible label: "AI digital twin of <Name>" (section 17).
- [ ] Deploy behind HTTPS (the microphone and camera need HTTPS on public sites).

---

## 16. Costs and hardware

| Item | Cost |
|---|---|
| Learning (reading, OCR, Whisper, NLLB, Piper) | **Free**, runs locally |
| Understanding a library once | roughly **$15–25 per ~100 books** (fast model notes + main-model reflection); each work is studied once |
| Chat answers | pay per use; the cached persona keeps it low; `EFFORT=low/medium` is cheaper |
| Edge neural voice | free (unofficial); Azure free tier 0.5M chars/month |
| Voice cloning | free (open source) to monthly (paid APIs) |
| Face Level 1 / 2 | free (browser) |
| Face Level 3 | GPU hardware or rented GPU |

**Computer for the current engine:** 16 GB RAM recommended (Whisper-medium + OCR), about 3 GB of disk for models, any modern CPU. A GPU is only needed for voice training and Level 3 faces.

**Hosting:** a small VPS can host the chat and TTS. Heavy learning (OCR and Whisper) can stay on your own PC: copy `library/.knowledge/` to the server when it is done.

---

## 17. Safety, consent and honesty

A digital twin speaks with your face and voice, so take extra care:

- **Always disclose** that it is an AI ("AI digital twin of <Name>"), both on screen and in the persona prompt.
- **Only clone yourself** (or someone who has given written consent). Never use another person's face or voice.
- **Limit what it can promise:** no contracts, prices, medical, legal or financial commitments on your behalf. Hand those to the real you.
- **Protect your voice model and photos.** Keep them on your server, not in a public repo, so nobody can reuse them to impersonate you.
- **Visitor privacy:** keep the camera opt-in and on-device, as now. Store visitor memory only with consent. Add a short privacy note.
- **Licences:** NLLB and some voice-cloning models are **non-commercial**. If the twin will earn money, use commercially licensed alternatives (for example the Claude API for translation, or a paid voice).
- **Keep the API key on the server.** It never reaches the browser.

---

*Built on: Node.js · Claude Opus 5.5 / Haiku 5.5 · Tesseract · Whisper · NLLB-200 · Microsoft neural voices · Piper · MediaPipe · Canvas/SVG.*

---

## Appendix A: `personality.md` template

The same template is saved as `PERSONALITY-TEMPLATE.md` next to this file. Agents: copy it to `personality.md` for the user, or use its sections as interview questions.

````markdown
# personality.md

<!-- Fill in every field marked (required). Leave optional fields empty if unsure; the AI agent will choose defaults.
     Write naturally: the agent turns this into the twin's persona, greetings, voice, face and starting knowledge. -->

## Identity
- **name** (required): <!-- your full name, e.g. "Asha Verma" -->
- **display_name** (required): <!-- name shown on the site, e.g. "Asha's AI Twin" -->
- **tagline**: <!-- one line under the name, e.g. "Ask me about design, startups and photography" -->
- **ai_disclosure_label**: <!-- default: "AI digital twin of <name>" -->

## Consent (required)
- **consent.is_self**: <!-- yes = this file describes me -->
- **consent.written_consent_from_person**: <!-- only if not yourself: yes / no -->

## About me (required)
<!-- 5–15 sentences: background, work, city, values, what you care about, what you are known for. -->

## How I speak (required)
- **tone**: <!-- e.g. warm, direct, playful, calm -->
- **sentence_style**: <!-- short and punchy / detailed / storytelling -->
- **humour**: <!-- none / light / a lot; examples -->
- **catchphrases**: <!-- phrases you often use -->
- **language_mixing**: <!-- e.g. "Hinglish with friends, pure English for work" -->
- **words_i_never_use**:

## Languages (required)
- **languages**: <!-- e.g. en, hi, mr -->
- **default_language**: <!-- e.g. en -->

## Expertise
<!-- Topics you know well; the twin answers these confidently from your library. -->
-

## Opinions
<!-- Only views you are happy for the twin to state publicly. -->
-

## Boundaries (required)
<!-- What it must never do or say on your behalf. Suggested defaults are pre-filled; edit freely. -->
- Never make promises, prices, contracts or commitments on my behalf.
- Never share private details about my family, clients or finances.
- No medical, legal or financial advice beyond general information.
- For anything personal or business-related: "I'll pass this to the real <name>."
-

## Conversation lines
- **greeting**: <!-- what it says when someone arrives -->
- **thinking_lines**: <!-- 2–4 short lines said while preparing an answer, e.g. "Hmm, let me think." -->
- **small_talk**: <!-- replies to thank you / bye / praise, in your style -->

## Frequently asked questions
<!-- 10–100 questions people ask you, with your real answers. This becomes the twin's "About me" knowledge. -->
- **Q:**
  **A:**

## Voice
- **voice.gender** (required): <!-- male / female -->
- **voice.samples**: <!-- path to clean recordings of your voice (1–5 min for cloning, 1–2 h for training) -->
- **voice.model**: <!-- path to an already trained voice (.onnx for Piper), if you have one -->
- **voice.speed**: <!-- slower / normal / faster -->

## Face
- **face.photos**: <!-- paths: front (required for your face), mouth-open, eyes-closed -->
- **face.level**: <!-- 1 = animated photo (default), 2 = 3D head, 3 = photoreal video (needs GPU) -->
- **face.style**: <!-- realistic / hologram / duotone / cartoon; colours, e.g. "teal hologram with soft glow" -->
- **face.background**: <!-- e.g. "dark starfield", "my studio", "plain gradient" -->

## Knowledge to learn from
- **knowledge.documents**: <!-- folders/files: articles, books, CV, presentations -->
- **knowledge.recordings**: <!-- talks, podcasts, interviews, voice notes, videos -->
- **knowledge.links**: <!-- YouTube (with subtitles), website pages, public posts -->
- **study_focus**: <!-- what the twin should learn from them, e.g. "my opinions, how I explain things, my stories" -->
````
