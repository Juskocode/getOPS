import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GETOPS_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.GETOPS_QA_URL ?? "http://127.0.0.1:8766";
const directory = resolve(".runtime/qa");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const apiRequests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  // Optional staging of the local release while the container image builds.
  if (process.env.GETOPS_QA_LOCAL_BUILD === "1") {
    await page.route(`${base}/assets/**`, (route) => route.fulfill({ path: resolve("apps/web/dist" + new URL(route.request().url()).pathname) }));
    await page.route(`${base}/lab/galton`, (route) => route.fulfill({ path: resolve("apps/web/dist/index.html") }));
  }
  await page.goto(`${base}/lab/galton`);
  await page.getByRole("button", { name: "Fast", exact: true }).click();
  await page.getByText("Population settled", { exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(await page.getByRole("progressbar", { name: "Settled population" }).getAttribute("aria-valuenow"), "50000");
  const pixels = () => page.locator("canvas").evaluate((canvas) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let gold = 0;
    let signature = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 150 && data[i + 1] > 90 && data[i + 2] < 170) gold++;
      signature = (signature + data[i] * (i % 97 + 1)) % 2147483647;
    }
    return { gold, signature };
  });
  const desktop = await pixels();
  assert.ok(desktop.gold > 1000, "Desktop board must contain visible pegs and histogram");
  await page.screenshot({ path: resolve(directory, "galton-desktop.png"), fullPage: true });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const csv = await readFile(await (await downloaded).path(), "utf8");
  assert.equal(csv.trim().split("\n").length, 18);
  assert.equal(csv.trim().split("\n").slice(1).reduce((sum, line) => sum + Number(line.split(",")[1]), 0), 50000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobile = await pixels();
  assert.ok(mobile.gold > 500, "Completed canvas must redraw after mobile resize");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No page-level horizontal overflow");
  await page.screenshot({ path: resolve(directory, "galton-mobile.png"), fullPage: true });
  await page.getByRole("slider", { name: "Rows", exact: true }).fill("18");
  await page.getByRole("button", { name: "Apply field", exact: true }).click();
  await page.reload();
  await page.getByRole("slider", { name: "Rows", exact: true }).waitFor();
  assert.equal(await page.getByRole("slider", { name: "Rows", exact: true }).inputValue(), "18");
  await page.getByRole("button", { name: "Slow", exact: true }).click();
  await page.getByRole("button", { name: "Replay run", exact: true }).click();
  const movingA = await pixels();
  await page.waitForTimeout(1800);
  const movingB = await pixels();
  assert.notEqual(movingA.signature, movingB.signature, "Running canvas must animate");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(100);
  const pausedA = await pixels();
  await page.waitForTimeout(300);
  assert.deepEqual(await pixels(), pausedA, "Paused canvas must remain still");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Fast", exact: true }).click();
  await page.getByRole("button", { name: "Replay run", exact: true }).click();
  await page.getByText("Population settled", { exact: true }).waitFor({ timeout: 30_000 });
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, [], "Public Galton must not load a private profile or depend on API readiness");
  console.log(JSON.stringify({ desktop, mobile, complete: 50000, csv: "passed", settings: "restored", pause: "stable", reducedMotion: "passed", pageErrors: errors, apiRequests }, null, 2));
} finally { await browser.close(); }
