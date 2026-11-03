import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

// Only generated accounts, a unique business snapshot and private test sessions are used.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "frontend/package.json"));
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(
    process.env.PLAYWRIGHT_MODULE ||
      path.join(
        process.env.USERPROFILE || "",
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
      ),
  );
}
const php =
  process.env.PHP_BINARY ||
  (process.platform === "win32"
    ? path.join(root, ".tools/php/php.exe")
    : "php");
const temporaryRoot = path.resolve(root, "tests/.tmp");
const testDir = path.join(temporaryRoot, `regressions-${Date.now()}`);
await fs.mkdir(testDir, { recursive: true });
const statePath = path.join(testDir, "state.json");
const sessionPath = path.join(testDir, "sessions");
const env = {
  ...process.env,
  SHIFTSYNC_STORE: statePath,
  SHIFTSYNC_SESSION_PATH: sessionPath,
  SHIFTSYNC_ENV: "test",
  SHIFTSYNC_TEST_NOW: "2030-01-01T06:00:00Z",
};
await promisify(execFile)(
  php,
  ["scripts/seed-demo.php", "--week-start", "2030-01-07"],
  { cwd: root, env },
);
const snapshot = async () => JSON.parse(await fs.readFile(statePath, "utf8"));
const initial = await snapshot();
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
let browser;
try {
  browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH || process.platform === "win32"
      ? {
          executablePath:
            process.env.CHROME_PATH ||
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
        }
      : {}),
  });
} catch (error) {
  server.kill();
  throw error;
}
const results = [];
const pageErrors = [];
const automaticRequests = [];
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
async function user(id, existingContext) {
  const context =
    existingContext ||
    (await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Kolkata",
    }));
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // Advance actual application poll timers deterministically, without waiting 15 seconds per check.
  await page.clock.install({ time: new Date() });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto(`${origin}/login.php`);
  if (new URL(page.url()).pathname === "/login.php") {
    await page.getByLabel("Email address").fill(initial.users[id].email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials[initial.users[id].email]);
    await Promise.all([
      page.waitForURL("**/app.php#/overview"),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
  }
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  return { page, context };
}
async function go(page, hash, title) {
  await page.goto(`${origin}/app.php#${hash}`);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
}
async function data(client, action, body, params = {}) {
  const csrf =
    body === undefined
      ? undefined
      : await client.page.evaluate(() => window.SHIFTSYNC.csrf);
  const response = await client.context.request.fetch(
    `${origin}/api/index.php?${new URLSearchParams({ action, ...params })}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          data: body,
        },
  );
  const payload = await response.json();
  assert.equal(
    response.status(),
    200,
    `${action}: ${payload.error?.message || "HTTP failure"}`,
  );
  assert.equal(payload.ok, true);
  return payload.data;
}
function responseFor(page, action, background) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).searchParams.get("action") === action &&
      (background === undefined ||
        (response.request().headers()["x-background-refresh"] === "1") ===
          background),
  );
}
async function poll(page, dependent) {
  await page.bringToFront();
  const response = responseFor(page, dependent, true);
  await page.clock.fastForward(15000);
  const value = await response;
  assert.equal(value.status(), 200);
  await value.finished();
}
async function openEditor(client, slotId) {
  await go(client.page, "/manage/roster", "Roster builder");
  await client.page.locator("#week-select").selectOption("2030-01-14");
  const value = await data(client, "bootstrap");
  const slots = value.slots
    .filter(
      (slot) =>
        slot.rosterId ===
        value.rosters.find((roster) => roster.week === "2030-01-14").id,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startsAt.localeCompare(b.startsAt) ||
        a.lab.localeCompare(b.lab),
    );
  const index = slots.findIndex((slot) => slot.id === slotId);
  await client.page
    .locator(".data-table tbody tr")
    .nth(index)
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await client.page.getByRole("dialog", { name: "Plan duty block" }).waitFor();
}
async function saveRequirements(page) {
  const response = responseFor(page, "roster.requirements");
  await page
    .getByRole("button", { name: "Save requirements", exact: true })
    .click();
  return response;
}
async function draftWrite(client, values = {}) {
  const current = await data(client, "bootstrap");
  const roster = current.rosters.find((value) => value.week === "2030-01-14");
  const slot = current.slots
    .filter((value) => value.rosterId === roster.id)
    .at(-1);
  return data(client, "roster.requirements", {
    rosterId: roster.id,
    slotId: slot.id,
    version: roster.version,
    headcount: slot.headcount,
    technicianMinimum: slot.technicianMinimum ? 0 : 1,
    ...values,
  });
}
async function workload(page) {
  return page.locator(".data-table tbody tr").evaluateAll((rows) =>
    rows.map((row) => {
      const cells = row.querySelectorAll("td");
      return [
        cells[0].querySelector("strong").textContent,
        Number.parseInt(cells[2].textContent, 10),
        Number.parseFloat(cells[3].textContent),
      ];
    }),
  );
}
function csvRows(raw) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < raw.length; index++) {
    const character = raw[index];
    if (character === '"') {
      if (quoted && raw[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(value);
      value = "";
    } else if (!quoted && character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}
async function compareExport(client, expectedLab) {
  const before = await workload(client.page);
  const downloaded = client.page.waitForEvent("download");
  await client.page
    .getByRole("link", { name: "Export CSV", exact: true })
    .click();
  const download = await downloaded;
  const rows = csvRows(await fs.readFile(await download.path(), "utf8"));
  assert.deepEqual(rows[0], [
    "week",
    "laboratory_filter",
    "staff_id",
    "staff_name",
    "qualification",
    "scheduled_duties",
    "scheduled_hours",
  ]);
  assert.ok(
    rows
      .slice(1)
      .every((row) => row[0] === "2030-01-07" && row[1] === expectedLab),
  );
  assert.deepEqual(
    before,
    rows.slice(1).map((row) => [row[3], Number(row[5]), Number(row[6])]),
  );
}
async function sessionFile(client) {
  const cookie = (await client.context.cookies()).find(
    (value) => value.name === "shiftsync_session",
  );
  assert.ok(cookie, "An isolated authenticated session exists");
  return path.join(sessionPath, `sess_${cookie.value}`);
}
async function activity(client, replacement) {
  const file = await sessionFile(client);
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    throw new Error("The synthetic session file is unavailable.");
  }
  if (replacement !== undefined) {
    await fs.writeFile(
      file,
      raw.replace(/lastActivity\|i:\d+;/, `lastActivity|i:${replacement};`),
    );
    return replacement;
  }
  return Number(raw.match(/lastActivity\|i:(\d+);/)[1]);
}
try {
  const editorA = await user("supervisor-1");
  const editorB = await user("supervisor-1");
  const slot = Object.values(initial.slots).find(
    (value) => initial.rosters[value.rosterId].week === "2030-01-14",
  );
  await check(
    "Dirty roster values retain their original version after another session saves and automatic polling rejects the stale write",
    async () => {
      await openEditor(editorA, slot.id);
      await openEditor(editorB, slot.id);
      const baseVersion = initial.rosters[slot.rosterId].version;
      await editorB.page.getByLabel("People required").fill("4");
      await editorA.page.getByLabel("People required").fill("3");
      assert.equal((await saveRequirements(editorA.page)).status(), 200);
      await editorA.page
        .getByRole("status")
        .filter({ hasText: "Draft saved." })
        .waitFor();
      await poll(editorB.page, "bootstrap");
      await editorB.page
        .getByRole("alert")
        .filter({ hasText: "A newer draft is available." })
        .waitFor();
      assert.equal(
        await editorB.page.getByLabel("People required").inputValue(),
        "4",
      );
      const response = await saveRequirements(editorB.page);
      assert.equal(response.request().postDataJSON().version, baseVersion);
      assert.equal(response.status(), 409);
      assert.equal((await response.json()).error.code, "stale_version");
      assert.equal(
        await editorB.page.getByLabel("People required").inputValue(),
        "4",
      );
      assert.equal((await snapshot()).slots[slot.id].headcount, 3);
      await editorB.page
        .getByRole("button", { name: "Reload saved requirements", exact: true })
        .click();
      await editorB.page
        .getByRole("status")
        .filter({ hasText: "Latest saved requirements loaded." })
        .waitFor();
      assert.equal(
        await editorB.page.getByLabel("People required").inputValue(),
        "3",
      );
      await editorB.page.getByLabel("People required").fill("4");
      const saved = await saveRequirements(editorB.page);
      assert.equal(saved.status(), 200);
      assert.equal(saved.request().postDataJSON().version, baseVersion + 1);
      await editorB.page
        .getByRole("status")
        .filter({ hasText: "Draft saved." })
        .waitFor();
      assert.equal((await snapshot()).slots[slot.id].headcount, 4);
    },
  );
  await check(
    "A saved roster baseline uses the mutation version when bootstrap fails, and input is locked during the in-flight save",
    async () => {
      let allow;
      const held = new Promise((resolve) => {
        allow = resolve;
      });
      let ready;
      const committed = new Promise((resolve) => {
        ready = resolve;
      });
      await editorB.page.route("**/api/index.php?action=bootstrap", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "storage_unavailable",
              message:
                "Controlled regression: bootstrap unavailable after save.",
            },
            meta: { serverTime: env.SHIFTSYNC_TEST_NOW },
          }),
        }),
      );
      await editorB.page.route(
        "**/api/index.php?action=roster.requirements",
        async (route) => {
          const response = await route.fetch();
          ready();
          await held;
          await route.fulfill({ response });
        },
      );
      await editorB.page.getByLabel("People required").fill("5");
      const response = saveRequirements(editorB.page);
      await committed;
      assert.equal(
        await editorB.page.getByLabel("People required").isDisabled(),
        true,
      );
      assert.equal(
        await editorB.page.getByLabel("Technicians required").isDisabled(),
        true,
      );
      allow();
      const first = await response;
      const firstVersion = (await first.json()).data.version;
      await editorB.page
        .getByRole("status")
        .filter({ hasText: "Draft saved." })
        .waitFor();
      assert.equal(
        await editorB.page.getByLabel("People required").inputValue(),
        "5",
      );
      await editorB.page.unroute("**/api/index.php?action=roster.requirements");
      await editorB.page.getByLabel("People required").fill("6");
      const second = await saveRequirements(editorB.page);
      assert.equal(second.status(), 200);
      assert.equal(second.request().postDataJSON().version, firstVersion);
      await editorB.page
        .getByRole("status")
        .filter({ hasText: "Draft saved." })
        .waitFor();
      await editorB.page.unroute("**/api/index.php?action=bootstrap");
      await editorB.page.getByRole("button", { name: "Close details" }).click();
      await editorA.page.getByRole("button", { name: "Close details" }).click();
    },
  );
  const report = await user("supervisor-1");
  const writer = await user("supervisor-1");
  const requester = await user("staff-1");
  await check(
    "Manual refresh updates an open filtered report after another session approves a cross-lab swap and agrees exactly with CSV",
    async () => {
      await go(report.page, "/manage/reports", "Reports");
      const loaded = responseFor(report.page, "report");
      await report.page.locator("#report-lab").selectOption("lab-a");
      await loaded;
      await report.page.locator(".data-table tbody tr").first().waitFor();
      const before = await workload(report.page);
      const current = await data(requester, "bootstrap");
      let source;
      let target;
      for (const assignment of current.assignments.filter(
        (value) =>
          value.staffId === "staff-1" &&
          current.rosters.find(
            (roster) =>
              roster.id ===
              current.slots.find((slot) => slot.id === value.slotId).rosterId,
          )?.week === "2030-01-07",
      )) {
        const ownSlot = current.slots.find(
          (slot) => slot.id === assignment.slotId,
        );
        const candidates = await data(requester, "candidates", undefined, {
          assignmentId: assignment.id,
        });
        const match = candidates.find(
          (value) => value.eligible && value.slot.lab !== ownSlot.lab,
        );
        if (match) {
          source = assignment;
          target = match;
          break;
        }
      }
      assert.ok(
        source && target,
        "A real, unreserved cross-lab exchange exists",
      );
      const request = await data(requester, "swap.create", {
        assignmentId: source.id,
        targetAssignmentId: target.assignmentId,
        note: "Isolated report refresh regression.",
        operationId: crypto.randomUUID(),
      });
      const recipient = await user(target.staffId);
      const accepted = await data(recipient, "swap.accept", {
        id: request.id,
        version: request.version,
      });
      await data(writer, "swap.approve", {
        id: accepted.id,
        version: accepted.version,
      });
      assert.deepEqual(
        await workload(report.page),
        before,
        "Without a poll or user refresh the existing snapshot is unchanged",
      );
      const refreshed = responseFor(report.page, "report", false);
      await report.page
        .getByRole("button", { name: "Refresh saved records" })
        .click();
      await refreshed;
      await report.page.locator(".data-table tbody tr").first().waitFor();
      assert.equal(
        await report.page.locator("#report-lab").inputValue(),
        "lab-a",
      );
      assert.notDeepEqual(
        await workload(report.page),
        before,
        "Cross-lab owner exchange changes the filtered hours",
      );
      await compareExport(report, "lab-a");
    },
  );
  await check(
    "Old report responses cannot overwrite newer laboratory filters and report errors preserve filters while disabling exports until retry",
    async () => {
      let allowed;
      const held = new Promise((resolve) => {
        allowed = resolve;
      });
      let oldReady;
      const oldLoaded = new Promise((resolve) => {
        oldReady = resolve;
      });
      let oldDone;
      const completed = new Promise((resolve) => {
        oldDone = resolve;
      });
      const all = responseFor(report.page, "report");
      await report.page.locator("#report-lab").selectOption("all");
      await all;
      await report.page.route(
        "**/api/index.php?action=report*",
        async (route) => {
          if (
            new URL(route.request().url()).searchParams.get("lab") !== "lab-a"
          )
            return route.continue();
          const response = await route.fetch();
          oldReady();
          await held;
          try {
            await route.fulfill({ response });
          } catch {
            /* The obsolete read may already have been aborted. */
          }
          oldDone();
        },
      );
      await report.page.locator("#report-lab").selectOption("lab-a");
      await oldLoaded;
      const latest = responseFor(report.page, "report");
      await report.page.locator("#report-lab").selectOption("lab-b");
      await latest;
      await report.page.locator(".data-table tbody tr").first().waitFor();
      allowed();
      await completed;
      const expected = await data(writer, "report", undefined, {
        week: "2030-01-07",
        lab: "lab-b",
      });
      assert.deepEqual(
        await workload(report.page),
        expected.workload.map((value) => [
          value.name,
          value.duties,
          value.hours,
        ]),
      );
      await report.page.unroute("**/api/index.php?action=report*");
      await report.page.route("**/api/index.php?action=report*", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "storage_unavailable",
              message: "Controlled regression report failure.",
            },
            meta: { serverTime: env.SHIFTSYNC_TEST_NOW },
          }),
        }),
      );
      await report.page
        .getByRole("button", { name: "Refresh saved records" })
        .click();
      await report.page
        .getByRole("alert")
        .filter({ hasText: "Controlled regression report failure." })
        .waitFor();
      assert.equal(
        await report.page.locator("#report-lab").inputValue(),
        "lab-b",
      );
      assert.equal(
        await report.page
          .getByText("Scheduled workload", { exact: true })
          .first()
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await report.page
          .getByRole("link", { name: "Export CSV", exact: true })
          .count(),
        0,
        "A failed refresh has no active export href",
      );
      assert.equal(
        await report.page
          .getByRole("button", { name: "Print", exact: true })
          .isDisabled(),
        true,
      );
      await report.page.unroute("**/api/index.php?action=report*");
      await report.page
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await report.page.locator(".data-table tbody tr").first().waitFor();
      await compareExport(report, "lab-b");
    },
  );
  await check(
    "Automatic revision-driven preview and report reads use background headers, retain focus and do not keep idle sessions alive",
    async () => {
      const pending = Object.values((await snapshot()).swaps).find(
        (value) => value.status === "awaiting_colleague",
      );
      const preview = await user(pending.requesterId);
      const idleReport = await user("supervisor-1");
      await go(preview.page, `/swaps/${pending.id}`, "Exchange details");
      await preview.page
        .getByRole("heading", { name: "Eligibility checks", exact: true })
        .waitFor();
      await go(idleReport.page, "/manage/reports", "Reports");
      await idleReport.page.locator(".data-table tbody tr").first().waitFor();
      const idleBaseline = Math.floor(Date.now() / 1000) - 300;
      await activity(preview, idleBaseline);
      await activity(idleReport, idleBaseline);
      let trigger = "automatic";
      for (const client of [preview, idleReport])
        client.page.on("request", (request) => {
          const action = new URL(request.url()).searchParams.get("action");
          if (["bootstrap", "preview", "report"].includes(action))
            automaticRequests.push({
              action,
              background: request.headers()["x-background-refresh"] === "1",
              trigger,
            });
        });
      for (let attempt = 0; attempt < 3; attempt++) {
        await draftWrite(writer);
        await preview.page
          .getByRole("button", { name: "Refresh saved records" })
          .focus();
        await poll(preview.page, "preview");
        assert.equal(
          await preview.page.evaluate(() =>
            document.activeElement.getAttribute("aria-label"),
          ),
          "Refresh saved records",
        );
        await poll(idleReport.page, "report");
        assert.equal(await activity(preview), idleBaseline);
        assert.equal(await activity(idleReport), idleBaseline);
      }
      assert.ok(automaticRequests.some((value) => value.action === "preview"));
      assert.ok(automaticRequests.some((value) => value.action === "report"));
      assert.ok(
        automaticRequests.every((value) => value.background),
        "No dependent read was misclassified as user activity",
      );
      const userRead = responseFor(idleReport.page, "report", false);
      trigger = "user";
      await idleReport.page
        .getByRole("button", { name: "Refresh saved records" })
        .click();
      await userRead;
      assert.ok(
        (await activity(idleReport)) > idleBaseline,
        "A real user refresh still advances idle activity",
      );
      trigger = "automatic";
      await activity(preview, 1);
      await activity(idleReport, 1);
      await draftWrite(writer);
      for (const client of [preview, idleReport]) {
        await client.page.bringToFront();
        const expired = responseFor(client.page, "bootstrap", true);
        await client.page.clock.fastForward(15000);
        assert.equal((await expired).status(), 401);
        await client.page
          .getByRole("heading", {
            name: "Your session has ended.",
            exact: true,
          })
          .waitFor();
      }
    },
  );
  await check(
    "Two real availability tabs reject different-cell and same-cell stale saves without undoing the first tab",
    async () => {
      const first = await user("staff-12");
      const second = await user("staff-12", first.context);
      const open = (page) =>
        page.goto(`${origin}/availability.php?week=2030-01-07`);
      await open(first.page);
      await open(second.page);
      await first.page
        .locator("#availability-2030-01-07-morning")
        .selectOption("unavailable");
      await Promise.all([
        first.page.waitForURL("**&saved=1"),
        first.page.getByRole("button", { name: "Save availability" }).click(),
      ]);
      await second.page
        .locator("#availability-2030-01-08-morning")
        .selectOption("unavailable");
      const stale = second.page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/handlers/availability.php",
      );
      await second.page
        .getByRole("button", { name: "Save availability" })
        .click();
      assert.equal((await stale).status(), 409);
      assert.equal(
        await second.page
          .locator("#availability-2030-01-08-morning")
          .inputValue(),
        "unavailable",
      );
      let saved = await snapshot();
      assert.equal(
        saved.availability["staff-12"]["2030-01-07"].morning,
        "unavailable",
      );
      assert.equal(
        saved.availability["staff-12"]["2030-01-08"].morning,
        "available",
      );
      await open(first.page);
      await open(second.page);
      await first.page
        .locator("#availability-2030-01-07-morning")
        .selectOption("not_submitted");
      await Promise.all([
        first.page.waitForURL("**&saved=1"),
        first.page.getByRole("button", { name: "Save availability" }).click(),
      ]);
      await second.page
        .locator("#availability-2030-01-07-morning")
        .selectOption("available");
      const conflict = second.page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/handlers/availability.php",
      );
      await second.page
        .getByRole("button", { name: "Save availability" })
        .click();
      assert.equal((await conflict).status(), 409);
      saved = await snapshot();
      assert.equal(
        saved.availability["staff-12"]["2030-01-07"].morning,
        "not_submitted",
      );
      assert.equal(
        await second.page
          .locator("#availability-2030-01-07-morning")
          .inputValue(),
        "available",
      );
    },
  );
  await check(
    "Report refresh and route cleanup produce no unhandled page errors or PHP warnings",
    async () => {
      assert.deepEqual(pageErrors, []);
      assert.ok(!/PHP (?:Fatal error|Parse error|Warning)/.test(serverErrors));
    },
  );
} catch (error) {
  process.exitCode = 1;
  console.error(`FAIL ${error.stack || error.message}`);
} finally {
  await fs.writeFile(
    path.join(temporaryRoot, "frontend-regression-results.json"),
    JSON.stringify(
      {
        results,
        pageErrors,
        automaticRequests,
        browser: browser.version(),
        isolatedStore: true,
        executedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await browser.close();
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  if (path.dirname(path.resolve(testDir)) !== temporaryRoot)
    throw new Error("Refusing cleanup outside the isolated test directory.");
  await fs.rm(testDir, { recursive: true, force: true });
  console.log(
    `Frontend regressions: ${results.filter((value) => value.status === "passed").length} passed, ${results.filter((value) => value.status === "failed").length} failed.`,
  );
}
