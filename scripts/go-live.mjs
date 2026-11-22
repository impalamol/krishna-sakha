// KRISHNA SAKHA — go live on the internet from this computer.
//
// Starts a free Cloudflare tunnel to the local server (http://localhost:PORT), reads the public address it
// gets (it changes every time), and publishes that address to the GitHub Pages site, so the permanent link
//   https://impalamol.github.io/krishna-sakha/
// always opens the running Krishna Sakha. Keep this window open while he should be online.
//
// Needs: cloudflared (winget install Cloudflare.cloudflared) and git with access to the GitHub repository.
// Usage: node scripts/go-live.mjs        (the server must already be running: npm start)

import { spawn, execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
const PORT = process.env.PORT || 3000;
const REPO = process.env.LIVE_REPO || "https://github.com/impalamol/krishna-sakha.git";
const PAGES = path.join(ROOT, ".pages");          // local copy of the gh-pages branch (ignored by git)

const CLOUDFLARED = ["C:/Program Files (x86)/cloudflared/cloudflared.exe", "C:/Program Files/cloudflared/cloudflared.exe"]
  .find((p) => existsSync(p)) || "cloudflared";

const git = (...args) => execFileSync("git", args, { cwd: PAGES, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

function publish(url) {
  if (!existsSync(path.join(PAGES, ".git"))) {
    mkdirSync(PAGES, { recursive: true });
    execFileSync("git", ["clone", "--quiet", "--depth", "1", "--branch", "gh-pages", REPO, PAGES], { stdio: "inherit" });
  }
  try { git("pull", "--quiet", "--rebase"); } catch {}
  writeFileSync(path.join(PAGES, "live.json"), JSON.stringify({ url, updated: new Date().toISOString() }, null, 1) + "\n");
  git("add", "live.json");
  try { git("commit", "--quiet", "-m", "Live address updated"); } catch { return; }   // unchanged
  git("push", "--quiet");
  console.log("🌐 GitHub link updated: https://impalamol.github.io/krishna-sakha/  ->  " + url);
}

console.log(`Starting the tunnel to http://127.0.0.1:${PORT} …`);
const cf = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
let published = false;
const onData = (buf) => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !published) {
    published = true;
    console.log("✅ Krishna Sakha is live at " + m[0]);
    // give the tunnel a moment to connect before visitors are sent to it
    setTimeout(() => { try { publish(m[0]); } catch (e) { console.error("Could not update the GitHub link:", e.message); } }, 5000);
  }
};
cf.stdout.on("data", onData);
cf.stderr.on("data", onData);
cf.on("exit", (code) => { console.log("Tunnel stopped (" + code + "). Krishna Sakha is offline; the GitHub link shows a 'resting' page."); process.exit(code || 0); });
process.on("SIGINT", () => cf.kill());
