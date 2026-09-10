import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPreviewGateway } from "./preview/gateway.mjs";

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), "..");
const directory = resolve(root, ".runtime/preview");
const accessPath = resolve(directory, "access.json");
const statePath = resolve(directory, "state.json");
const origin = process.env.GETOPS_PREVIEW_ORIGIN ?? "http://127.0.0.1:8766";
const port = Number(process.env.GETOPS_PREVIEW_PORT ?? 18766);
const command = process.argv[2] ?? "status";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const auth = (access) => `Basic ${Buffer.from(`${access.username}:${access.password}`).toString("base64")}`;

async function currentStatus() {
  try {
    const state = await readJson(statePath);
    const access = await readJson(accessPath);
    const response = await fetch(`http://127.0.0.1:${state.port}/__preview/status`, {
      headers: { authorization: auth(access) }, signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const current = await response.json();
    return current.instance === state.instance ? current : null;
  } catch { return null; }
}

async function serve() {
  const access = await readJson(accessPath);
  let child;
  let retry;
  let stopping = false;
  let attempt = 0;
  const state = { instance: randomBytes(16).toString("hex"), pid: process.pid, port, origin, url: null, connected: false };
  const gateway = createPreviewGateway({ origin, ...access, status: () => state });
  const save = () => writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(retry);
    child?.kill("SIGTERM");
    gateway.closeAllConnections();
    gateway.close();
    rm(statePath, { force: true }).finally(() => process.exit(process.exitCode ?? 0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  gateway.on("upgrade", (_req, socket) => socket.destroy());
  gateway.on("error", (error) => { console.error(error.message); process.exitCode = 1; shutdown(); });

  function connect() {
    if (stopping) return;
    let tail = "";
    child = spawn(process.env.CLOUDFLARED_BIN ?? "cloudflared", [
      "tunnel", "--config", resolve(directory, "cloudflared.yml"), "--no-autoupdate",
      "--url", `http://127.0.0.1:${port}`, "--metrics", "127.0.0.1:0",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const capture = (chunk) => {
      process.stdout.write(chunk);
      tail = (tail + chunk.toString()).slice(-4096);
      const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && state.url !== match[0]) {
        state.url = match[0];
        void save();
      }
      if (tail.includes("Registered tunnel connection") && !state.connected) {
        attempt = 0;
        state.connected = true;
        void save();
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", (error) => { console.error(error.message); shutdown(); });
    child.on("exit", () => {
      state.url = null;
      state.connected = false;
      if (!stopping) {
        void save();
        retry = setTimeout(connect, Math.min(30_000, 2000 * 2 ** attempt++));
      }
    });
  }
  gateway.listen(port, "127.0.0.1", async () => { await save(); connect(); });
}

async function main() {
  if (command === "serve") { await serve(); return; }
  if (!["start", "stop", "status"].includes(command)) throw new Error("Usage: node scripts/preview.mjs start|status|stop");
  const current = await currentStatus();
  if (command === "status") { console.log(JSON.stringify(current ?? { running: false }, null, 2)); return; }
  if (command === "stop") {
    if (current) process.kill(current.pid, "SIGTERM");
    console.log(current ? "getOPS preview stopped." : "getOPS preview is not running.");
    return;
  }
  if (current) { console.log(JSON.stringify(current, null, 2)); return; }
  const ready = await fetch(`${origin}/api/v1/health/ready`, { signal: AbortSignal.timeout(5000) });
  if (!ready.ok) throw new Error("Start the healthy getOPS Compose stack first.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(accessPath, JSON.stringify({ username: "operator", password: randomBytes(24).toString("base64url") }, null, 2), { mode: 0o600, flag: "wx" });
  } catch (error) { if (error.code !== "EEXIST") throw error; }
  await writeFile(resolve(directory, "cloudflared.yml"), "{}\n", { mode: 0o600 });
  const log = await open(resolve(directory, "preview.log"), "w", 0o600);
  const supervisor = spawn(process.execPath, [script, "serve"], {
    cwd: root, detached: true, stdio: ["ignore", log.fd, log.fd], env: process.env,
  });
  supervisor.unref();
  await log.close();
  for (let iteration = 0; iteration < 60; iteration++) {
    const status = await currentStatus();
    if (status?.url && status.connected) {
      console.log(JSON.stringify(status, null, 2));
      console.log(`Login credentials: ${accessPath}`);
      return;
    }
    await sleep(1000);
  }
  throw new Error(`Preview is still connecting. Inspect ${directory}/preview.log and run npm run preview:status.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
