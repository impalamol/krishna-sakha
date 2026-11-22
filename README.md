# Krishna Sakha — AI Guide to Hindu Dharma

**Live:** https://impalamol.github.io/krishna-sakha/ (online while the owner's computer is running it; otherwise it shows a "resting" page)

A browser-based AI agent with an animated avatar: a glowing blue-violet face in a neural halo. It talks, blinks, looks around, and moves its lips in time with its voice.

- **Brain:** Claude (`claude-opus-5-5`) through a small Node server. Your API key stays on the server and never reaches the browser.
- **Voice:** the browser's built-in speech engine (free). It prefers male Indian voices and switches language to match each reply (Hindi, Marathi, Tamil, Bengali and more).
- **Ears:** a mic button for speaking questions (works in Chrome and Edge).
- **Modes:** Ask, Teach Me, Shloka Breakdown, Katha, Debate, Daily Sadhana, Daily Help.
- **Persona:** defined in [prompt/sanatan-system.md](prompt/sanatan-system.md). Edit that file to change how Sanatan behaves.

## Run it locally

You need Node.js 20.12 or newer.

```bash
npm install
cp .env.example .env        # then put your Anthropic API key in .env
npm start
```

Open http://localhost:3000.

## Put it online

### From this computer (free, everything included)

Double-click **`start-live.bat`**. It starts the server and a free Cloudflare tunnel, then updates the GitHub Pages link
(`live.json` on the `gh-pages` branch) with the tunnel's new address, so https://impalamol.github.io/krishna-sakha/
always opens him. Keep both windows open while he should be online. Needs `cloudflared`
(`winget install Cloudflare.cloudflared`) and Ollama for the free local brain. By hand: `npm start`, then `node scripts/go-live.mjs`.

### On a cloud host

The app is a single Node server with no build step and no database. Any Node host can run it
(the free local brain, Whisper and OCR need a strong machine; on a small host use Claude credits):

| Host | Steps |
|---|---|
| **Render** / **Railway** / **Fly.io** | Connect the repo, use start command `npm start`, add the env var `ANTHROPIC_API_KEY` in the dashboard. |
| **VPS** (DigitalOcean, Hostinger, AWS) | `npm install`, create `.env`, run with `pm2 start server.js --name sanatan`, put Nginx + HTTPS (Let's Encrypt) in front. |

HTTPS is required in production, because browsers only allow the microphone on secure pages.

Health check endpoint: `GET /healthz`.

### Settings (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | Your key from console.anthropic.com |
| `MODEL` | `claude-opus-5-5` | Claude model |
| `EFFORT` | `medium` | `low` is faster and cheaper; `high` gives deeper answers |
| `RATE_LIMIT` | `30` | Questions allowed per visitor IP every 10 minutes |
| `PORT` | `3000` | Server port |

### Cost and safety for a public site

- Each question is billed to your Anthropic account. Set a **monthly spend limit** in the Anthropic Console before launch.
- Built-in protections: a per-IP rate limit, a cap on message length and history, prompt caching on the persona (cheaper repeat requests), and automatic fallback if a request is declined.
- If you run behind a proxy such as Nginx or Cloudflare, make sure it forwards `X-Forwarded-For` so the rate limit sees real visitor IPs.

## File map

```
server.js                  API proxy + static file server
prompt/sanatan-system.md   Sanatan's persona and rules
public/index.html          Page + the SVG face
public/avatar.js           Neural halo animation, blinking, gaze, lip-sync
public/voice.js            Text-to-speech queue, viseme mapping, speech recognition
public/app.js              Chat, streaming, modes, settings
public/markdown.js         Safe Markdown rendering
public/styles.css          Styling (desktop + mobile)
```

## About the voice

Speech uses voices installed on each visitor's device, so quality varies. Windows (Edge/Chrome) usually has good Indian male voices. Some phones only have female voices. For one consistent premium male voice everywhere, replace `Voice.speak` in `public/voice.js` with a cloud TTS service (for example Azure Neural "hi-IN-MadhurNeural", Google Cloud TTS or ElevenLabs) called through a new server endpoint. The lip-sync already works from the spoken text.

## Ideas for later

- Upload books/PDFs so Sanatan can cite them, using the Claude Files API with citations.
- Saved user accounts and the "daily learning log" from the original concept (needs a database).
- A 3D or video avatar instead of the SVG face.

## Image note

The avatar is drawn entirely in code (SVG + canvas), inspired by your reference image. The reference image itself, in `design/`, is **not** served and is git-ignored, because it looks like a stock illustration you may not have a licence to publish.
