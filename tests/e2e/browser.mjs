import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "frontend/package.json"));
let playwright;
try {
  playwright = require("playwright");
} catch {
  const runtime =
    process.env.PLAYWRIGHT_MODULE ||
    path.join(
      process.env.USERPROFILE || "",
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    );
  try {
    playwright = require(runtime);
  } catch {
    throw new Error(
      "Browser review needs Playwright. Install it in frontend or set PLAYWRIGHT_MODULE to your existing installation.",
    );
  }
}
const php =
  process.env.PHP_BINARY ||
  (process.platform === "win32"
    ? path.join(root, ".tools/php/php.exe")
    : "php");
const temporaryRoot = path.resolve(root, "tests/.tmp");
const testDir = path.join(temporaryRoot, `browser-${Date.now()}`);
const screenshots = path.join(root, "docs/screenshots");
await fs.mkdir(testDir, { recursive: true });
await fs.mkdir(screenshots, { recursive: true });
const statePath = path.join(testDir, "state.json");
const env = {
  ...process.env,
  SHIFTSYNC_STORE: statePath,
  SHIFTSYNC_SESSION_PATH: path.join(testDir, "sessions"),
  SHIFTSYNC_ENV: "test",
  SHIFTSYNC_TEST_NOW: "2030-01-01T06:00:00Z",
};
await promisify(execFile)(
  php,
  ["scripts/seed-demo.php", "--week-start", "2030-01-07"],
  { cwd: root, env },
);
const initial = JSON.parse(await fs.readFile(statePath, "utf8"));
const credentials = Object.fromEntries(
  (await fs.readFile(path.join(testDir, "demo-credentials.txt"), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.includes("\t"))
    .map((line) => line.split("\t")),
);
const listener = net.createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(php, ["-S", `127.0.0.1:${port}`, "-t", "public"], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ["ignore", "ignore", "pipe"],
});
let serverErrors = "";
server.stderr.on("data", (data) => {
  serverErrors += data.toString();
});
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    await fetch(`${origin}/login.php`);
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const chrome =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : undefined);
let browser;
try {
  browser = await playwright.chromium.launch({
    headless: true,
    ...(chrome ? { executablePath: chrome } : {}),
  });
} catch (error) {
  server.kill();
  throw error;
}
const results = [];
const errors = [];
const contexts = [];
let latestScreenshot = "";
async function check(name, action) {
  try {
    await action();
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "failed", message: error.message });
    throw error;
  }
}
async function context(options = {}) {
  const value = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Kolkata",
    ...options,
  });
  value.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  contexts.push(value);
  return value;
}
async function login(value, staffId) {
  const page = await value.newPage();
  await page.goto(`${origin}/login.php`);
  await page.getByLabel("Email address").fill(initial.users[staffId].email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials[initial.users[staffId].email]);
  await Promise.all([
    page.waitForURL("**/app.php#/overview"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.locator(".page-title").waitFor();
  return page;
}
async function route(page, hash, title) {
  await page.goto(`${origin}/app.php#${hash}`);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
}
async function shot(page, name) {
  latestScreenshot = path.join(screenshots, `${name}.png`);
  await page.screenshot({
    path: latestScreenshot,
    fullPage: true,
    animations: "disabled",
  });
}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    size.html <= size.width + 1 && size.body <= size.width + 1,
    `No page overflow at ${size.width}px: html=${size.html}, body=${size.body}`,
  );
}
async function api(page, action, body, params = {}) {
  return page.evaluate(
    async ({ action, body, params }) => {
      const response = await fetch(
        `${window.SHIFTSYNC.basePath}/api/index.php?${new URLSearchParams({ action, ...params })}`,
        body === undefined
          ? {}
          : {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": window.SHIFTSYNC.csrf,
              },
              body: JSON.stringify(body),
            },
      );
      const payload = await response.json();
      if (!payload.ok) throw new Error(`${action}: ${payload.error.message}`);
      return payload.data;
    },
    { action, body, params },
  );
}
try {
  const staffContext = await context();
  const publicPage = await staffContext.newPage();
  await check(
    "Public introduction and PHP sign-in render without broken local assets",
    async () => {
      await publicPage.goto(origin);
      await publicPage.locator("h1").waitFor();
      await noOverflow(publicPage);
      await shot(publicPage, "01-introduction-desktop");
      await publicPage.goto(`${origin}/login.php`);
      await publicPage.getByLabel("Email address").waitFor();
      await shot(publicPage, "02-login-desktop");
      assert.equal(
        await publicPage
          .locator("img")
          .evaluateAll((images) =>
            images.every((image) => image.complete && image.naturalWidth > 0),
          ),
        true,
      );
      for (const width of [320, 375, 414, 768, 1440]) {
        await publicPage.setViewportSize({ width, height: 1000 });
        await publicPage.goto(origin);
        await noOverflow(publicPage);
        await publicPage.goto(`${origin}/login.php`);
        await noOverflow(publicPage);
      }
      await publicPage
        .getByLabel("Email address")
        .fill("missing@shiftsync.test");
      await publicPage
        .getByLabel("Password", { exact: true })
        .fill("deliberately-invalid-for-browser-check");
      await publicPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await publicPage.getByRole("alert").waitFor();
      assert.equal(
        await publicPage.getByLabel("Email address").inputValue(),
        "missing@shiftsync.test",
      );
      for (const width of [320, 390]) {
        await publicPage.setViewportSize({ width, height: 844 });
        await noOverflow(publicPage);
      }
      await shot(publicPage, "14-login-error-mobile");
    },
  );
  const unassigned = await login(staffContext, "staff-12");
  await check(
    "Availability DOM controls save through PHP and persist after reload",
    async () => {
      await unassigned.goto(`${origin}/availability.php?week=2030-01-07`);
      await unassigned.setViewportSize({ width: 390, height: 844 });
      await unassigned
        .locator("#availability-2030-01-07-morning")
        .selectOption("unavailable");
      assert.match(
        await unassigned.locator("#save-status").textContent(),
        /unsaved/i,
      );
      await Promise.all([
        unassigned.waitForURL("**/availability.php?week=2030-01-07&saved=1"),
        unassigned.getByRole("button", { name: "Save availability" }).click(),
      ]);
      assert.equal(
        await unassigned
          .locator("#availability-2030-01-07-morning")
          .inputValue(),
        "unavailable",
      );
      for (const width of [320, 375, 414, 768, 1440]) {
        await unassigned.setViewportSize({ width, height: 844 });
        await noOverflow(unassigned);
      }
      await unassigned.setViewportSize({ width: 390, height: 844 });
      await shot(unassigned, "03-availability-mobile");
    },
  );
  const workingContext = await context();
  const staffPage = await login(workingContext, "staff-1");
  await check(
    "Published desktop roster opens a keyboard-trapped duty drawer and restores focus",
    async () => {
      await route(staffPage, "/roster", "Weekly roster");
      assert.equal(
        await staffPage.locator("#week-select").inputValue(),
        "2030-01-07",
        "Default week uses the authoritative server clock",
      );
      await staffPage.locator(".roster-grid .duty-block").first().waitFor();
      await shot(staffPage, "04-roster-desktop");
      const trigger = staffPage.locator(".roster-grid .duty-block").first();
      const label = await trigger.getAttribute("aria-label");
      await trigger.click();
      await staffPage.getByRole("dialog", { name: "Duty details" }).waitFor();
      for (let index = 0; index < 12; index++)
        await staffPage.keyboard.press("Tab");
      assert.equal(
        await staffPage.evaluate(() =>
          Boolean(document.activeElement.closest('[role="dialog"]')),
        ),
        true,
      );
      await staffPage.keyboard.press("Escape");
      assert.equal(await staffPage.getByRole("dialog").count(), 0);
      assert.equal(
        await staffPage.evaluate(() =>
          document.activeElement.getAttribute("aria-label"),
        ),
        label,
      );
      await noOverflow(staffPage);
    },
  );
  await check(
    "Mobile agenda, navigation focus, reduced motion and 200% equivalent layout are usable",
    async () => {
      for (const width of [768, 414, 390, 375, 360, 320]) {
        await staffPage.setViewportSize({ width, height: 844 });
        await noOverflow(staffPage);
        assert.equal(
          await staffPage.locator(".mobile-agenda").isVisible(),
          true,
        );
        assert.equal(
          await staffPage.locator(".roster-scroll").isVisible(),
          false,
        );
        await staffPage
          .getByRole("button", { name: "Open navigation" })
          .click();
        assert.equal(
          await staffPage.evaluate(
            () => document.activeElement.closest(".sidebar") !== null,
          ),
          true,
        );
        await staffPage.keyboard.press("Escape");
        assert.equal(
          await staffPage
            .getByRole("button", { name: "Open navigation" })
            .getAttribute("aria-expanded"),
          "false",
        );
      }
      await staffPage.setViewportSize({ width: 390, height: 844 });
      await shot(staffPage, "05-roster-mobile");
      await staffPage.emulateMedia({ reducedMotion: "reduce" });
      await staffPage.locator(".agenda-person").first().click();
      assert.equal(
        await staffPage
          .getByRole("dialog")
          .evaluate((element) => getComputedStyle(element).animationName),
        "none",
      );
      await staffPage.keyboard.press("Escape");
      await staffPage.setViewportSize({ width: 720, height: 500 });
      await noOverflow(staffPage);
      await staffPage.emulateMedia({ reducedMotion: "no-preference" });
    },
  );
  const supervisorContext = await context();
  const supervisor = await login(supervisorContext, "supervisor-1");
  await check(
    "Supervisor coverage shows separate staffing and technician gaps; incomplete publish is rejected",
    async () => {
      await route(supervisor, "/manage/roster", "Roster builder");
      await supervisor.locator("#week-select").selectOption("2030-01-14");
      await supervisor
        .getByRole("button", { name: "Publish roster", exact: true })
        .click();
      await supervisor
        .getByRole("button", { name: "Publish & notify team" })
        .click();
      await supervisor.locator(".notice-error").waitFor();
      assert.match(
        await supervisor.locator(".notice-error").textContent(),
        /coverage|people|technician|requirement/i,
      );
      await shot(supervisor, "06-draft-coverage-desktop");
    },
  );
  const fresh = await api(supervisor, "bootstrap");
  let source = null;
  let target = null;
  for (const assignment of fresh.assignments.filter(
    (value) =>
      value.staffId === "staff-1" &&
      fresh.slots.find((slot) => slot.id === value.slotId)?.rosterId ===
        fresh.rosters.find((roster) => roster.week === "2030-01-07").id,
  )) {
    const list = await api(staffPage, "candidates", undefined, {
      assignmentId: assignment.id,
    });
    const choice = list.find((value) => value.eligible);
    if (choice && list.some((value) => !value.eligible)) {
      source = assignment;
      target = choice;
      break;
    }
  }
  assert.ok(
    source && target,
    "Seed includes an eligible and blocked candidate for staff-1",
  );
  const beforeOwners = fresh.assignments
    .filter((value) => [source.id, target.assignmentId].includes(value.id))
    .map((value) => [value.id, value.staffId]);
  let requestId;
  await check(
    "Candidate explanations and two-direction preview submit a real exchange without changing owners",
    async () => {
      await staffPage.setViewportSize({ width: 1440, height: 1000 });
      await route(
        staffPage,
        `/swaps/new?assignment=${source.id}`,
        "Request an exchange",
      );
      await staffPage
        .getByRole("button", { name: "All options", exact: true })
        .click();
      await staffPage.locator(".blocked-reasons").first().waitFor();
      await staffPage
        .locator(".blocked-reasons")
        .first()
        .scrollIntoViewIfNeeded();
      await shot(staffPage, "07-blocked-candidates-desktop");
      const card = staffPage
        .locator(".swap-candidate")
        .filter({ has: staffPage.getByText(`${target.name}`, { exact: true }) })
        .filter({
          has: staffPage.getByRole("button", { name: "Review this exchange" }),
        })
        .first();
      await card.getByRole("button", { name: "Review this exchange" }).click();
      await staffPage
        .getByLabel("Note to your colleague")
        .fill("Browser verification: a deliberate two-way exchange.");
      await staffPage
        .getByRole("button", { name: "Send exchange request" })
        .click();
      await staffPage.waitForURL(/#\/swaps\/swap-/);
      requestId = staffPage.url().split("/").at(-1);
      await staffPage
        .getByRole("heading", { name: "Request timeline" })
        .waitFor();
      const after = await api(staffPage, "bootstrap");
      for (const [id, owner] of beforeOwners)
        assert.equal(
          after.assignments.find((value) => value.id === id).staffId,
          owner,
        );
      await noOverflow(staffPage);
    },
  );
  const recipientContext = await context();
  const recipient = await login(recipientContext, target.staffId);
  await check(
    "Colleague acceptance leaves the roster unchanged, then supervisor approval exchanges both owners",
    async () => {
      await route(recipient, `/swaps/${requestId}`, "Exchange details");
      await recipient
        .getByRole("button", { name: "Accept exchange", exact: true })
        .click();
      await recipient
        .getByRole("status")
        .filter({ hasText: "Awaiting supervisor" })
        .waitFor();
      let saved = await api(recipient, "bootstrap");
      for (const [id, owner] of beforeOwners)
        assert.equal(
          saved.assignments.find((value) => value.id === id).staffId,
          owner,
        );
      await route(supervisor, `/swaps/${requestId}`, "Exchange details");
      assert.match(
        await supervisor.locator(".request-week-label").textContent(),
        /7 Jan/,
      );
      await supervisor
        .getByRole("button", { name: "Approve exchange", exact: true })
        .waitFor();
      await shot(supervisor, "08-approval-comparison-desktop");
      await supervisor.setViewportSize({ width: 390, height: 844 });
      await noOverflow(supervisor);
      await shot(supervisor, "09-approval-comparison-mobile");
      await supervisor
        .getByRole("button", { name: "Approve exchange", exact: true })
        .click();
      await supervisor
        .getByRole("status")
        .filter({ hasText: "Approved" })
        .waitFor();
      await supervisor.reload();
      await supervisor
        .getByRole("heading", { name: "Request timeline" })
        .waitFor();
      saved = await api(supervisor, "bootstrap");
      assert.equal(
        saved.assignments.find((value) => value.id === source.id).staffId,
        target.staffId,
      );
      assert.equal(
        saved.assignments.find((value) => value.id === target.assignmentId)
          .staffId,
        "staff-1",
      );
    },
  );
  await check(
    "Workload Canvas, table and exported CSV use the same selected report scope",
    async () => {
      await supervisor.setViewportSize({ width: 1440, height: 1000 });
      await route(supervisor, "/manage/reports", "Reports");
      await supervisor.locator("#week-select").selectOption("2030-01-07");
      await supervisor.locator("#report-lab").selectOption("lab-a");
      await supervisor.locator(".workload-chart canvas").waitFor();
      await supervisor.waitForFunction(
        () => document.querySelector(".workload-chart canvas")?.width > 0,
      );
      const report = await api(supervisor, "report", undefined, {
        week: "2030-01-07",
        lab: "lab-a",
      });
      assert.equal(
        await supervisor.locator(".data-table tbody tr").count(),
        report.workload.length,
      );
      const rows = await supervisor
        .locator(".data-table tbody tr")
        .allTextContents();
      report.workload.forEach((person) =>
        assert.ok(
          rows.some(
            (row) =>
              row.includes(person.name) && row.includes(`${person.hours} h`),
          ),
        ),
      );
      const downloadEvent = supervisor.waitForEvent("download");
      await supervisor
        .getByRole("link", { name: "Export CSV", exact: true })
        .click();
      const download = await downloadEvent;
      const csv = await fs.readFile(await download.path(), "utf8");
      report.workload.forEach((person) =>
        assert.ok(
          csv.includes(person.name) && csv.includes(String(person.hours)),
        ),
      );
      await shot(supervisor, "10-reports-desktop");
      await supervisor.setViewportSize({ width: 390, height: 844 });
      await noOverflow(supervisor);
      await shot(supervisor, "11-reports-mobile");
      await supervisor.emulateMedia({ media: "print" });
      assert.equal(await supervisor.locator(".sidebar").isVisible(), false);
      assert.equal(await supervisor.locator(".data-table").isVisible(), true);
      assert.equal(
        await supervisor.locator(".workload-chart").isVisible(),
        false,
      );
      assert.deepEqual(
        await supervisor.locator(".data-table tbody tr").allTextContents(),
        rows,
      );
      await supervisor.emulateMedia({ media: "screen" });
    },
  );
  await check(
    "Asia/Kolkata, UTC and New York browser settings display identical institution duty times",
    async () => {
      const values = [];
      for (const timezoneId of ["Asia/Kolkata", "UTC", "America/New_York"]) {
        const zoneContext = await context({ timezoneId });
        const zonePage = await login(zoneContext, "staff-1");
        await route(zonePage, "/roster", "Weekly roster");
        values.push(
          await zonePage
            .locator(".roster-grid .duty-block")
            .first()
            .getAttribute("aria-label"),
        );
      }
      assert.equal(new Set(values).size, 1);
      assert.match(values[0], /09:00|13:00/);
    },
  );
  await check(
    "A specifically rejected CSRF token refreshes once and saves notification read status",
    async () => {
      await route(recipient, "/notifications", "Notifications");
      const statuses = [];
      const capture = (response) => {
        if (response.url().includes("action=notification.read"))
          statuses.push(response.status());
      };
      recipient.on("response", capture);
      await recipient.evaluate(() => {
        window.SHIFTSYNC.csrf = "browser-deliberately-invalid-csrf";
      });
      await recipient.getByRole("button", { name: "Mark all read" }).click();
      await recipient
        .getByRole("status")
        .filter({ hasText: "All saved notifications marked as read." })
        .waitFor();
      recipient.off("response", capture);
      assert.deepEqual(
        statuses,
        [403, 200],
        "Only the explicit nonmutation rejection is retried once",
      );
      const data = await api(recipient, "bootstrap");
      assert.equal(
        data.notifications.filter((notification) => !notification.readAt)
          .length,
        0,
      );
    },
  );
  await check(
    "Empty states, session expiry and direct hash refresh render clear destinations",
    async () => {
      await route(unassigned, "/my-shifts", "My shifts");
      await unassigned
        .getByRole("heading", { name: "No duties match this view" })
        .waitFor();
      await shot(unassigned, "12-empty-state-mobile");
      await staffPage.reload();
      await staffPage
        .getByRole("heading", { name: "Exchange details", exact: true })
        .waitFor();
      await staffPage.evaluate(() =>
        window.dispatchEvent(new CustomEvent("shiftsync:session-expired")),
      );
      await staffPage
        .getByRole("heading", { name: "Your session has ended." })
        .waitFor();
      assert.ok(
        await staffPage
          .getByRole("link", { name: "Return to sign in" })
          .getAttribute("href"),
      );
      assert.deepEqual(errors, []);
      assert.ok(!/PHP (?:Fatal error|Parse error|Warning)/.test(serverErrors));
    },
  );
  await check(
    "Structured temporary server errors render an actionable recovery state",
    async () => {
      const errorPage = await supervisorContext.newPage();
      await errorPage.route("**/api/index.php?action=bootstrap", (request) =>
        request.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "storage_unavailable",
              message: "Storage is temporarily unavailable. Please try again.",
            },
            meta: { serverTime: "2030-01-01T06:00:00Z" },
          }),
        }),
      );
      await errorPage.goto(`${origin}/app.php#/overview`);
      await errorPage.getByRole("alert").waitFor();
      assert.equal(
        await errorPage.getByRole("button", { name: "Try again" }).count(),
        1,
      );
      await shot(errorPage, "13-error-state-desktop");
      await errorPage.unroute("**/api/index.php?action=bootstrap");
      await errorPage.getByRole("button", { name: "Try again" }).click();
      await errorPage
        .getByRole("heading", { name: "Overview", exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
    },
  );
} catch (error) {
  console.error(`FAIL ${error.stack || error.message}`);
  if (latestScreenshot) console.error(`Last screenshot: ${latestScreenshot}`);
  process.exitCode = 1;
} finally {
  const output = {
    results,
    errors,
    browser: browser.version(),
    screenshots: await fs.readdir(screenshots),
    executedAt: new Date().toISOString(),
    storeIsolation:
      "Unique temporary business snapshot and PHP sessions; live storage was untouched.",
    zoomScope:
      "720 CSS-pixel viewport verifies reflow equivalent to a 1440px display at 200%; the browser chrome zoom setting was not manually changed.",
  };
  await fs.writeFile(
    path.join(root, "tests/.tmp/browser-results.json"),
    JSON.stringify(output, null, 2),
  );
  await fs.writeFile(
    path.join(root, "docs/BROWSER_RESULTS.json"),
    JSON.stringify(output, null, 2),
  );
  await browser.close();
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  // Never remove any path other than this unique, isolated test directory.
  if (path.dirname(path.resolve(testDir)) !== temporaryRoot)
    throw new Error("Refusing cleanup outside the test temporary directory.");
  await fs.rm(testDir, { recursive: true, force: true });
  console.log(
    `Browser checks: ${results.filter((result) => result.status === "passed").length} passed, ${results.filter((result) => result.status === "failed").length} failed.`,
  );
}
