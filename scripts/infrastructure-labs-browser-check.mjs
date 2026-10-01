import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GETOPS_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.GETOPS_QA_URL ?? "http://127.0.0.1:5173";
const profile = `labs-qa-${Date.now()}`;
const directory = resolve(".runtime/qa");
const cases = [
  { id: "rx-hotspot", answers: [1, 2, 0] },
  { id: "cpu-quota", answers: [2, 0, 3] },
  { id: "edge-trigger", answers: [0, 3, 1] },
  { id: "audit-io", answers: [1, 0, 2] },
];
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
let context;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  // All writes use an isolated profile against the real C++ API and PostgreSQL.
  await context.route("**/api/v1/profiles/local/state", async (route) => {
    const response = await route.fetch({ url: `${base}/api/v1/profiles/${profile}/state` });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const options = () => page.getByRole("group", { name: "Decision options" }).getByRole("button");
  const stages = () => page.getByRole("navigation", { name: "Investigation stages" }).getByRole("button");
  const evidenceButtons = () => page.getByRole("group", { name: "Inspect evidence" }).getByRole("button");
  const persisted = async () => {
    const response = await context.request.get(`${base}/api/v1/profiles/${profile}/state`);
    assert.equal(response.status(), 200);
    return response.json();
  };

  for (const [caseIndex, item] of cases.entries()) {
    await page.goto(`${base}/simulate/infrastructure/${item.id}?step=2&view=debrief`);
    await page.getByRole("region", { name: "Investigation decision" }).waitFor();
    assert.equal(await stages().nth(0).getAttribute("aria-current"), "step", "Deep links cannot skip unfinished decisions");
    assert.equal(await options().nth(0).isDisabled(), true, "Evidence must be inspected first");
    assert.equal(await stages().nth(3).isDisabled(), true);
    await page.waitForURL((url) => url.searchParams.get("step") === "0" && !url.searchParams.has("view"));
    for (let index = 0; index < 4; index++) {
      await evidenceButtons().nth(index).click();
      await page.getByText(`${index + 1} / 4 inspected`, { exact: true }).waitFor();
    }
    if (caseIndex === 0) {
      await page.getByRole("slider", { name: "Inspect timeline sample" }).fill("3");
      assert.match(await page.getByRole("slider").getAttribute("aria-valuetext"), /15 seconds/);
      assert.equal((await page.locator(".investigation-chart polyline").getAttribute("points")).split(" ").length, 12);
      await page.getByRole("button", { name: "Focus on investigation" }).click();
      await page.getByRole("navigation", { name: "Infrastructure investigations" }).waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("navigation", { name: "Infrastructure investigations" }).count(), 0);
      await page.reload();
      await page.getByRole("button", { name: "Show case library" }).waitFor();
      await page.getByRole("button", { name: "Show case library" }).click();
      await page.getByRole("navigation", { name: "Infrastructure investigations" }).waitFor();
      await options().nth(0).click();
      await page.getByRole("button", { name: "Commit decision" }).click();
      await page.getByText("Reconsider this decision.").waitFor();
      assert.equal(await page.locator(".infra-answer-guide").count(), 0, "Wrong attempts must not reveal the answer");
      assert.equal(await options().nth(0).isDisabled(), true);
      assert.equal((await persisted()).state.xp ?? 0, 0);
    }
    for (const [stepIndex, answer] of item.answers.entries()) {
      await options().nth(answer).click();
      if (caseIndex === 0 && stepIndex === 0) {
        let failNext = true;
        await page.route(`**/api/v1/profiles/${profile}/state`, async (route) => {
          if (route.request().method() === "PUT" && failNext) {
            failNext = false;
            return route.fulfill({ status: 503, json: { error: "qa_unavailable" } });
          }
          await route.continue();
        });
        await page.getByRole("button", { name: "Commit decision" }).click();
        await page.getByRole("button", { name: "Retry decision" }).waitFor();
        assert.equal(await options().nth(answer).getAttribute("aria-pressed"), "true");
        await page.getByRole("button", { name: "Retry decision" }).click();
      } else await page.getByRole("button", { name: "Commit decision" }).click();
      await page.getByText("Decision saved", { exact: true }).waitFor();
      assert.equal(await stages().nth(stepIndex).getAttribute("aria-current"), "step", "Completing an answer cannot automatically navigate");
      assert.equal(await page.getByRole("region", { name: "Investigation debrief" }).count(), 0);
      if (caseIndex === 0 && stepIndex === 0) {
        await page.reload();
        await page.getByText("CORRECT / GUIDED / +5 XP").waitFor();
        await page.screenshot({ path: resolve(directory, "investigation-desktop.png"), fullPage: true, animations: "disabled" });
      }
      await page.getByRole("button", { name: stepIndex === 2 ? "View debrief" : "Next decision" }).click();
    }
    await page.getByRole("region", { name: "Investigation debrief" }).waitFor();
    if (caseIndex === 0) {
      await page.screenshot({ path: resolve(directory, "investigation-debrief.png"), fullPage: true, animations: "disabled" });
      const original = await persisted();
      assert.equal(original.state.xp, 35);
      await page.getByRole("button", { name: "Rehearse without XP" }).click();
      await page.getByText("REHEARSAL / NOT SAVED").waitFor();
      for (let index = 0; index < 2; index++) await evidenceButtons().nth(index).click();
      await options().nth(1).click();
      await page.getByRole("button", { name: "Commit decision" }).click();
      await page.getByText("CORRECT / FIRST TRY", { exact: true }).waitFor();
      const after = await persisted();
      assert.deepEqual(after.state, original.state, "Rehearsal must not change saved evidence or XP");
      await page.getByRole("button", { name: "End rehearsal" }).click();
      await page.getByText("CORRECT / GUIDED / +5 XP").waitFor();
    }
  }
  const saved = await persisted();
  assert.equal(saved.state.xp, 170);
  assert.equal(Object.keys(saved.state.infraLabs).length, 4);
  for (const item of cases) {
    assert.equal(saved.state.infraLabs[item.id].inspected.length, 4);
    assert.equal(saved.state.infraLabs[item.id].decisions.length, 3);
  }
  assert.deepEqual(saved.state.infraLabs["rx-hotspot"].decisions[0].choices, [0, 1]);

  await page.goto(`${base}/simulate/infrastructure/edge-trigger?step=1&focus=1`);
  await page.getByRole("region", { name: "Investigation decision" }).waitFor();
  await evidenceButtons().nth(2).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    if (!fits) {
      await page.screenshot({ path: resolve(directory, "investigation-overflow.png"), fullPage: true });
      console.error(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((element) => {
        const box = element.getBoundingClientRect(); return box.width > 0 && box.right > innerWidth;
      }).slice(0, 20).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width, text: element.textContent?.slice(0, 60) }))));
    }
    assert.ok(fits, `No investigation overflow at ${width}px`);
    if (width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: resolve(directory, "investigation-mobile.png"), fullPage: true, animations: "disabled" });
    }
  }
  assert.equal(await page.locator(".investigation-evidence-content").evaluate((element) => getComputedStyle(element).animationName), "none");
  await page.goto(`${base}/simulate/infrastructure/not-a-case`);
  await page.getByRole("heading", { name: "Investigation not found" }).waitFor();
  await page.goto(base);
  await page.getByRole("heading", { name: "Operator command center" }).waitFor();
  assert.equal(await page.locator(".daily-evidence-kpi strong").textContent(), "12 / 5");
  await page.getByRole("link", { name: "4 / 4 investigations reviewed" }).waitFor();
  await page.goto(`${base}/profile`);
  await page.getByRole("heading", { name: "Operator profile" }).waitFor();
  await page.getByRole("link", { name: "4 / 4 investigations reviewed" }).waitFor();
  await page.goto(`${base}/learn/infrastructure?stage=Execution&status=unfinished&q=I%2FO`);
  await page.getByRole("heading", { name: "Understand the whole path." }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "Filter module stage" }).inputValue(), "Execution");
  assert.equal(await page.getByRole("combobox", { name: "Filter module progress" }).inputValue(), "unfinished");
  assert.equal(await page.getByRole("textbox", { name: "Find infrastructure module" }).inputValue(), "I/O");
  await page.reload();
  await page.getByRole("heading", { name: "Understand the whole path." }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Find infrastructure module" }).inputValue(), "I/O");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ profile, investigations: 4, decisions: 12, evidencePanels: 16, xp: saved.state.xp, persisted: true, failedSaveRetry: "passed", explicitNext: "passed", rehearsal: "unchanged", responsive: "320/390/768/1440", pageErrors: errors, screenshots: directory }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
}
