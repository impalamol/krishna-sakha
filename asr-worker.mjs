// Speech-to-text worker. It runs Whisper in its own process, so the large model's memory use can never
// crash the main server. The learner sends one segment at a time and restarts this worker every few segments.
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const MODEL = process.env.WHISPER_MODEL || "Xenova/whisper-medium";
let asr = null;

async function getAsr() {
  if (asr) return asr;
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = path.join(ROOT, "tools", "models");
  env.allowRemoteModels = true; // first use downloads the model into tools/models
  asr = await pipeline("automatic-speech-recognition", MODEL, { dtype: "q8" });
  return asr;
}

async function decode(file, start, len) {
  const ff = (await import("ffmpeg-static")).default;
  const buf = await new Promise((res, rej) => {
    const p = spawn(ff, ["-loglevel", "error", "-ss", String(start), "-t", String(len), "-i", file, "-vn", "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"], { windowsHide: true });
    const parts = []; p.stdout.on("data", (d) => parts.push(d));
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(Buffer.concat(parts)) : rej(new Error("ffmpeg exit " + c))));
  });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4)));
}

process.on("message", async (job) => {
  let model;
  try { model = await getAsr(); } catch (e) {
    process.send({ id: job.id, loadError: String(e?.message || e).slice(0, 160) }); return;
  }
  try {
    const audio = await decode(job.file, job.start, job.len);
    if (audio.length <= 1600) { process.send({ id: job.id, chunks: [] }); return; }
    // tell Whisper the language, otherwise it may TRANSLATE Hindi speech into English
    const out = await model(audio, { task: "transcribe", language: job.language, chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
    const chunks = (out.chunks?.length ? out.chunks : [{ timestamp: [0], text: out.text }])
      .map((c) => ({ at: c.timestamp?.[0] || 0, text: (c.text || "").trim() })).filter((c) => c.text);
    process.send({ id: job.id, chunks });
  } catch (e) {
    process.send({ id: job.id, error: String(e?.message || e).slice(0, 160) });
  }
});
