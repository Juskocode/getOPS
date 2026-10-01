import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GETOPS_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.GETOPS_QA_URL ?? "http://127.0.0.1:5173";
const profile = `notes-qa-${Date.now()}`;
const directory = resolve(".runtime/qa");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
let context;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/api/v1/profiles/local/state", async (route) => {
    const response = await route.fetch({ url: `${base}/api/v1/profiles/${profile}/state` });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = (tab) => tab.waitForFunction(() => document.querySelector(".incident-notebook > summary")?.textContent.includes("Saved /"));
  const openNotebook = async (tab) => { await tab.locator(".incident-notebook > summary").click(); await tab.getByRole("textbox", { name: "Verified observations" }).waitFor(); };
  await page.goto(`${base}/simulate/infrastructure`);
  await page.getByRole("heading", { name: "Incident workbench", exact: true }).waitFor();
  assert.equal(await page.locator(".investigation-case").count(), 6);
  await page.getByRole("combobox", { name: "Filter investigation boundary" }).selectOption("Unix");
  await page.waitForFunction(() => document.querySelectorAll(".investigation-case").length === 2);
  await page.getByRole("textbox", { name: "Search investigations" }).fill("descriptor");
  await page.waitForFunction(() => document.querySelectorAll(".investigation-case").length === 1);
  await page.reload();
  await page.getByRole("heading", { name: "Incident workbench", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Search investigations" }).inputValue(), "descriptor");
  await page.locator(".investigation-case").click();
  await page.getByRole("heading", { name: "The reconnect that never completes", exact: true }).waitFor();
  await openNotebook(page);
  const text = "EMFILE occurs locally at socket creation. Existing feed still receives; target soft limit is 1024.";
  await page.getByRole("textbox", { name: "Verified observations" }).fill(text);
  await page.getByRole("link", { name: "All investigations", exact: true }).click();
  await page.getByRole("dialog", { name: "Keep your incident notes?" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("textbox", { name: "Verified observations" }).inputValue(), text);
  let failNext = true;
  await page.route(`**/api/v1/profiles/${profile}/state`, async (route) => {
    if (route.request().method() === "PUT" && failNext) {
      failNext = false; return route.fulfill({ status: 503, json: { error: "qa_unavailable" } });
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await page.locator(".incident-notebook [role=alert]").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Verified observations" }).inputValue(), text);
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await saved(page);
  await page.reload();
  await openNotebook(page);
  assert.equal(await page.getByRole("textbox", { name: "Verified observations" }).inputValue(), text);

  // A second tab must not silently overwrite an independently edited notebook.
  const other = await context.newPage();
  other.on("pageerror", (error) => errors.push(error.message));
  await other.goto(`${base}/simulate/infrastructure/fd-exhaustion?focus=1`);
  await openNotebook(other);
  await page.getByRole("textbox", { name: "Verified observations" }).fill("Tab A has an unsaved independent hypothesis.");
  await other.getByRole("textbox", { name: "Verified observations" }).fill("Tab B saved a newer observation.");
  await other.getByRole("button", { name: "Save notes", exact: true }).click();
  await saved(other);
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await page.locator(".incident-notebook [role=alert]").filter({ hasText: "another tab" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Verified observations" }).inputValue(), "Tab A has an unsaved independent hypothesis.");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download notebook", exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "getops-fd-exhaustion-notes.txt");
  assert.match(await readFile(await download.path(), "utf8"), /Tab A has an unsaved/);
  await page.getByRole("button", { name: "Discard unsaved notes" }).click();
  await page.getByRole("button", { name: "Reload saved notes" }).click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Verified observations"]')?.value === "Tab B saved a newer observation.");
  await page.getByRole("textbox", { name: "Bounded next action" }).fill("Escalate consumer risk and follow the approved standby recovery path.");
  await page.getByRole("link", { name: "All investigations", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Save and leave", exact: true }).click();
  await page.getByRole("heading", { name: "Incident workbench", exact: true }).waitFor();
  const response = await context.request.get(`${base}/api/v1/profiles/${profile}/state`);
  assert.equal(response.status(), 200);
  const record = await response.json();
  assert.equal(record.state.infraLabNotes["fd-exhaustion"].observations, "Tab B saved a newer observation.");
  assert.match(record.state.infraLabNotes["fd-exhaustion"].action, /Escalate/);
  assert.equal(record.state.xp ?? 0, 0, "Notes cannot grant XP or fabricate decision evidence");
  assert.equal(record.state.infraLabs, undefined);

  await page.getByRole("textbox", { name: "Search investigations" }).fill("no-such-case");
  await page.getByRole("heading", { name: "No matching investigations" }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".investigation-case").length === 6);
  await page.screenshot({ path: resolve(directory, "investigation-library-desktop.png"), fullPage: true, animations: "disabled" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Library fits at ${width}px`);
  }
  await page.goto(`${base}/simulate/infrastructure/fd-exhaustion?focus=1`);
  await openNotebook(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(directory, "investigation-notebook-desktop.png"), fullPage: true, animations: "disabled" });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Notebook fits at ${width}px`);
    if (width === 390) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: resolve(directory, "investigation-notebook-mobile.png"), fullPage: true, animations: "disabled" }); }
  }
  // Dirty drafts may be discarded explicitly; the server must retain the saved note.
  await page.getByRole("textbox", { name: "Recovery criteria" }).fill("Local draft to discard.");
  await page.getByRole("link", { name: "All investigations", exact: true }).click();
  await page.getByRole("button", { name: "Discard and leave", exact: true }).click();
  await page.getByRole("heading", { name: "Incident workbench", exact: true }).waitFor();
  const unchanged = await (await context.request.get(`${base}/api/v1/profiles/${profile}/state`)).json();
  assert.equal(unchanged.state.infraLabNotes["fd-exhaustion"].recovery, "");
  await page.goto(`${base}/simulate/infrastructure/fd-exhaustion?focus=1`);
  await openNotebook(page);
  await page.getByRole("textbox", { name: "Hypothesis and uncertainty" }).fill("\u00e1".repeat(1200));
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await saved(page);
  const unicode = await (await context.request.get(`${base}/api/v1/profiles/${profile}/state`)).json();
  assert.equal(unicode.state.infraLabNotes["fd-exhaustion"].hypothesis.length, 1200);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ profile, library: "search/filter/refresh", notebook: "persisted", saveRetry: "passed", concurrentEdit: "protected", navigationGuard: "keep/save/discard", download: "passed", unicode: "1200 characters persisted", xp: 0, responsive: "320/390/768/1440", pageErrors: errors }, null, 2));
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await context?.unrouteAll({ behavior: "ignoreErrors" }); await browser.close(); }
