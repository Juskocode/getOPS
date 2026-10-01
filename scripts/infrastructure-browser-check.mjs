import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GETOPS_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.GETOPS_QA_URL ?? "http://127.0.0.1:5173";
const profile = `infra-qa-${Date.now()}`;
const directory = resolve(".runtime/qa");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
let context;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // Use real API persistence in an isolated QA profile; never mutate the operator's state.
  await context.route("**/api/v1/profiles/local/state", async (route) => {
    const response = await route.fetch({ url: `${base}/api/v1/profiles/${profile}/state` });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/learn/infrastructure`);
  await page.getByRole("heading", { name: "Understand the whole path." }).waitFor();
  assert.ok((await page.getByRole("textbox", { name: "Find infrastructure module" }).boundingBox()).width > 300, "Search must not collapse beside the stage filter");
  await page.getByRole("combobox", { name: "Packet scenario" }).selectOption("throttled");
  await page.getByText("82.00 ms", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Pause packet animation" }).click();
  assert.equal(await page.locator(".packet-path").getAttribute("data-playing"), "false");
  await page.screenshot({ path: resolve(directory, "infrastructure-desktop.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Find infrastructure module" }).fill("no-such-module");
  await page.getByRole("heading", { name: "No matching modules" }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  assert.equal(await page.locator(".infra-module-row").count(), 8);
  await page.getByRole("link", { name: "Start with the NIC" }).click();
  await page.getByRole("heading", { name: "From wire to kernel", exact: true }).waitFor();
  await page.getByRole("button", { name: "Mark as read" }).click();
  await page.getByRole("button", { name: "Read complete" }).waitFor();
  await page.getByRole("navigation", { name: "Module views" }).getByRole("button", { name: "Command lab" }).click();
  await page.getByText("ethtool -S eth0", { exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Module views" }).getByRole("button", { name: "Checkpoints" }).click();
  await page.getByRole("button", { name: /Increase every application worker pool/ }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByText("Not this one. Try another.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Next checkpoint" }).count(), 0);
  await page.getByRole("button", { name: /Map the feed to RX queue/ }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByText("CORRECT / GUIDED / +5 XP").waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"), null, "Must not advance automatically");
  await page.reload();
  await page.getByText("CORRECT / GUIDED / +5 XP").waitFor();
  await page.getByRole("button", { name: "Next checkpoint" }).click();
  await page.getByRole("button", { name: /stable flow hash/ }).click();
  // Simulate a failed write and verify the selection survives for an explicit retry.
  let rejectNext = true;
  await page.route(`**/api/v1/profiles/${profile}/state`, async (route) => {
    if (route.request().method() === "PUT" && rejectNext) {
      rejectNext = false;
      return route.fulfill({ status: 503, json: { error: "qa_unavailable" } });
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByRole("button", { name: "Retry save" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /stable flow hash/ }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Retry save" }).click();
  await page.getByText("CORRECT / FIRST TRY / +15 XP").waitFor();
  await page.screenshot({ path: resolve(directory, "infrastructure-checkpoint.png"), fullPage: true });
  await page.getByRole("button", { name: "Rehearse again" }).click();
  await page.getByRole("button", { name: /stable flow hash/ }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByText("CORRECT / FIRST TRY", { exact: true }).waitFor();
  const evidence = await (await context.request.get(`${base}/api/v1/profiles/${profile}/state`)).json();
  assert.equal(evidence.state.xp, 20, "Rehearsal cannot farm XP");
  assert.deepEqual(evidence.state.infraRead, ["nic"]);
  assert.deepEqual(evidence.state.infraAnswers["nic-1"].choices, [0, 1]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/learn/infrastructure`);
  await page.getByRole("heading", { name: "Understand the whole path." }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No mobile path overflow");
  await page.screenshot({ path: resolve(directory, "infrastructure-mobile.png"), fullPage: true });
  await page.goto(`${base}/learn/infrastructure/unix?view=commands`);
  await page.getByText("cat /proc/4242/limits", { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No mobile command overflow");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page.getByRole("navigation", { name: "Infrastructure modules" }).getByRole("link", { name: /I\/O without illusions/ }).click();
  await page.getByRole("heading", { name: "I/O without illusions", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/learn/infrastructure/event-loop");
  await page.screenshot({ path: resolve(directory, "infrastructure-reader-mobile.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/learn/infrastructure`);
  await page.locator(".packet-pulse").first().waitFor();
  assert.equal(await page.locator(".packet-pulse").first().evaluate((element) => getComputedStyle(element).animationName), "none");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No path overflow at ${width}px`);
  }
  console.log("Core interaction checks passed; checking existing routes.");
  await page.goto(`${base}/learn/infrastructure/not-a-module`);
  await page.getByRole("heading", { name: "Module not found" }).waitFor();
  await page.goto(`${base}/learn`);
  await page.getByRole("heading", { name: "Operational knowledge path" }).waitFor();
  await page.goto(`${base}/learn/feed`);
  await page.getByRole("heading", { name: "Market Data Integrity", exact: true }).waitFor();
  await page.goto(base);
  await page.getByRole("heading", { name: "Operator command center" }).waitFor();
  await page.getByRole("region", { name: "Infrastructure progress" }).waitFor();
  await page.screenshot({ path: resolve(directory, "infrastructure-today.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/profile`);
  await page.getByRole("heading", { name: "Operator profile" }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No profile overflow");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ profile, reviewed: 2, xp: evidence.state.xp, persisted: true, saveRetry: "passed", rehearsal: "no extra XP", mobile: "passed", reducedMotion: "passed", pageErrors: errors, screenshots: directory }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
}
