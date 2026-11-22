// KRISHNA SAKHA — local brain (free, on this computer) through Ollama.
//
// When the Claude API is unavailable (no key, no credits, outage), he still THINKS with a free open model
// running locally in Ollama (https://ollama.com): he answers questions from his books in his own words, and
// he keeps studying what he has read (understand.js) so his understanding grows by itself.
//
// Default model: gemma3:4b (Google Gemma 3, 4B; good at Hindi/Marathi and other Indian languages, fits a 4 GB GPU).
// Settings in .env:  LOCAL_BRAIN=false (turn off), OLLAMA_URL, OLLAMA_MODEL, OLLAMA_CTX.

const URL_ = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";
const CTX = Number(process.env.OLLAMA_CTX) || 8192;
// The whole model on the GPU is ~4x faster than Ollama's cautious automatic split (measured on a 4 GB GTX 1650:
// 34 vs 8 tokens/s). If the GPU runs out of memory, it falls back to the automatic split by itself.
let gpuLayers = process.env.OLLAMA_GPU_LAYERS === "auto" ? null : Number(process.env.OLLAMA_GPU_LAYERS) || 99;

export function createLocalBrain() {
  const enabled = process.env.LOCAL_BRAIN !== "false";
  let ok = false, checkedAt = 0, checking = null, warned = false, busy = 0;

  // Is Ollama running and is the model downloaded? (checked at most every 30 s)
  async function check() {
    if (!enabled) return false;
    if (Date.now() - checkedAt < 30_000) return ok;
    if (checking) return checking;
    checking = (async () => {
      try {
        const r = await fetch(`${URL_}/api/tags`, { signal: AbortSignal.timeout(3000) });
        const { models = [] } = await r.json();
        const has = models.some((m) => m.name === MODEL || m.name === `${MODEL}:latest` || m.model === MODEL);
        if (!has && !warned) { console.warn(`⚠  Local brain: Ollama is running but "${MODEL}" is not downloaded. Run: ollama pull ${MODEL}`); warned = true; }
        if (has && !ok) console.log(`🧠 Local brain ready: ${MODEL} (Ollama)`);
        ok = has;
      } catch { ok = false; }
      checkedAt = Date.now(); checking = null;
      return ok;
    })();
    return checking;
  }
  const available = () => { check().catch(() => {}); return ok; };

  async function call(body, signal) {
    const send = () => fetch(`${URL_}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keep the model in GPU memory while the server runs (loading it takes ~8 s)
      body: JSON.stringify({ model: MODEL, keep_alive: "2h", ...body,
        options: { num_ctx: CTX, ...(gpuLayers != null ? { num_gpu: gpuLayers } : {}), ...(body.options || {}) } }),
      signal,
    });
    let r = await send();
    if (!r.ok) {
      const err = (await r.text()).slice(0, 300);
      if (gpuLayers != null && /memory|cuda|alloc|out of/i.test(err)) {
        console.warn("⚠  Local brain: not enough GPU memory for the whole model; using Ollama's automatic GPU/CPU split (slower).");
        gpuLayers = null;
        r = await send();
        if (r.ok) return r;
      }
      checkedAt = 0;
      throw new Error(`ollama ${r.status}: ${err}`);
    }
    return r;
  }

  /**
   * Chat, streamed. onText(piece) receives the answer as it is written. Returns the whole answer.
   * messages: [{role: "user"|"assistant", content}], system: string
   */
  async function chat({ system, messages, onText = () => {}, signal, temperature = 0.6, maxTokens = 1500, ctx, format }) {
    busy++;
    try {
      const r = await call({
        stream: true,
        ...(format ? { format } : {}),
        messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
        options: { temperature, num_predict: maxTokens, ...(ctx ? { num_ctx: ctx } : {}) },
      }, signal);
      let all = "", buf = "";
      const dec = new TextDecoder();
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.error) throw new Error(`ollama: ${ev.error}`);
          const t = ev.message?.content || "";
          if (t) { all += t; onText(t); }
        }
      }
      return all;
    } finally { busy--; }
  }

  /**
   * Structured output: the reply must follow the JSON schema. Returns the parsed object (or null).
   * Streamed internally: a long study note on a hot laptop GPU can take over 5 minutes, and a non-streamed
   * request would hit Node's 5-minute "no response headers" limit and fail every time.
   */
  async function json({ system, prompt, schema, signal, maxTokens = 3000, ctx, temperature = 0.2 }) {
    const text = await chat({ system, messages: [{ role: "user", content: prompt }], signal, temperature, maxTokens, ctx, format: schema });
    try { return JSON.parse(text); } catch { return null; }
  }

  /**
   * Search words for a question, in Hindi (Devanagari) and English: most books are in Hindi, so an English,
   * Tamil or Marathi question shares no words with them. Gemma knows the right spellings of Sanskrit terms
   * and names (Gheranda -> घेरण्ड, neti -> नेति), which the offline translator often gets wrong.
   */
  async function keywords(question, { signal } = {}) {
    const text = await chat({
      messages: [{ role: "user", content:
        "List the key search words of this question for finding passages in Hindi and English books on yoga, dharma and scriptures. " +
        "Give the main terms, names of texts, people and practices, each in Hindi (Devanagari) AND in English, separated by commas. " +
        "No sentences, no question words, at most 12 words.\n\nQuestion: " + question }],
      signal, temperature: 0, maxTokens: 60,
    });
    return text.replace(/[\n*•\-]+/g, ",").replace(/\s*,\s*/g, ", ").replace(/^[,\s]+|[,\s]+$/g, "").slice(0, 300);
  }

  check().catch(() => {});
  return { enabled, model: MODEL, name: `ollama:${MODEL}`, check, available, chat, json, keywords, busy: () => busy > 0 };
}
