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
const testDir = path.join(temporaryRoot, `browser-safety-${Date.now()}`);
await fs.mkdir(testDir, { recursive: true });
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
const state = JSON.parse(await fs.readFile(statePath, "utf8"));
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
  stdio: "ignore",
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "Asia/Kolkata",
});
const page = await context.newPage();
let phase = "baseline";
const events = [];
const results = [];
const widths = [];
page.on("pageerror", (error) =>
  events.push({ kind: "pageerror", phase, message: error.message }),
);
page.on("console", (message) => {
  if (message.type() === "error")
    events.push({ kind: "console.error", phase, message: message.text() });
});
page.on("response", (response) => {
  if (response.status() >= 400)
    events.push({
      kind: "http",
      phase,
      status: response.status(),
      path: new URL(response.url()).pathname,
    });
});
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
async function login(id) {
  await context.clearCookies();
  await page.goto(`${origin}/login.php`);
  await page.getByLabel("Email address").fill(state.users[id].email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials[state.users[id].email]);
  await Promise.all([
    page.waitForURL("**/app.php#/overview"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
}
try {
  await check(
    "Representative public/PHP/React pages have no unexpected console errors or failed assets",
    async () => {
      for (const url of [origin, `${origin}/login.php`]) {
        await page.goto(url);
        await page.locator("h1").waitFor();
      }
      await login("staff-12");
      await page.goto(`${origin}/availability.php?week=2030-01-07`);
      await page
        .locator("#availability-2030-01-07-morning")
        .selectOption("unavailable");
      for (const width of [320, 375, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const measurement = await page
          .locator(".availability-select")
          .first()
          .evaluate((select) => {
            const style = getComputedStyle(select);
            const canvas = document.createElement("canvas");
            const drawing = canvas.getContext("2d");
            drawing.font = style.font;
            const text = Math.max(
              ...[...select.options].map(
                (option) => drawing.measureText(option.textContent).width,
              ),
            );
            const available =
              select.getBoundingClientRect().width -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight) -
              parseFloat(style.borderLeftWidth) -
              parseFloat(style.borderRightWidth) -
              20;
            return { text, available };
          });
        widths.push({ viewport: width, ...measurement });
        assert.ok(
          measurement.text <= measurement.available,
          `${width}px availability state needs ${measurement.text.toFixed(1)}px but only ${measurement.available.toFixed(1)}px is available`,
        );
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth > innerWidth ||
            document.body.scrollWidth > innerWidth,
        );
        assert.equal(overflow, false);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(root, "docs/screenshots/03-availability-mobile.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 320, height: 844 });
      await page
        .locator("#availability-2030-01-07-morning")
        .selectOption("not_submitted");
      await page.screenshot({
        path: path.join(root, "docs/screenshots/15-availability-narrow.png"),
        fullPage: true,
      });
      const unreadRecipient = Object.values(state.notifications).find(
        (notification) =>
          !notification.readAt &&
          state.users[notification.userId].role === "staff",
      )?.userId;
      assert.ok(
        unreadRecipient,
        "The seed provides an actual unread staff notification",
      );
      await login(unreadRecipient);
      await page.goto(`${origin}/app.php#/roster`);
      await page
        .getByRole("heading", { name: "Weekly roster", exact: true })
        .waitFor();
      await page.goto(`${origin}/app.php#/notifications`);
      await page
        .getByRole("heading", { name: "Notifications", exact: true })
        .waitFor();
      assert.deepEqual(
        events.filter((event) => event.phase === "baseline"),
        [],
      );
    },
  );
  await check(
    "An ambiguous network mutation failure is sent once without automatic replay or session refresh",
    async () => {
      phase = "expected_network_abort";
      let calls = 0;
      let sessions = 0;
      const requests = (request) => {
        if (request.url().includes("action=session")) sessions++;
      };
      page.on("request", requests);
      const before = await fs.readFile(statePath, "utf8");
      await page.route(
        "**/api/index.php?action=notification.read",
        (request) => {
          calls++;
          return request.abort("connectionfailed");
        },
      );
      await page.getByRole("button", { name: "Mark all read" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "The server could not be reached." })
        .waitFor();
      assert.equal(calls, 1);
      assert.equal(sessions, 0);
      assert.equal(await fs.readFile(statePath, "utf8"), before);
      await page.unroute("**/api/index.php?action=notification.read");
      page.off("request", requests);
    },
  );
  await check(
    "A storage 503 mutation response is sent once without automatic replay or session refresh",
    async () => {
      phase = "expected_503";
      let calls = 0;
      let sessions = 0;
      const requests = (request) => {
        if (request.url().includes("action=session")) sessions++;
      };
      page.on("request", requests);
      const before = await fs.readFile(statePath, "utf8");
      await page.route(
        "**/api/index.php?action=notification.read",
        (request) => {
          calls++;
          return request.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              error: {
                code: "storage_unavailable",
                message:
                  "Storage is temporarily unavailable. No automatic retry was attempted.",
              },
              meta: { serverTime: "2030-01-01T06:00:00Z" },
            }),
          });
        },
      );
      await page.getByRole("button", { name: "Mark all read" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "No automatic retry was attempted." })
        .waitFor();
      assert.equal(calls, 1);
      assert.equal(sessions, 0);
      assert.equal(await fs.readFile(statePath, "utf8"), before);
      assert.deepEqual(
        events.filter((event) => event.kind === "pageerror"),
        [],
      );
      assert.ok(
        events
          .filter((event) => event.kind === "http")
          .every(
            (event) => event.phase === "expected_503" && event.status === 503,
          ),
      );
      page.off("request", requests);
    },
  );
} catch (error) {
  process.exitCode = 1;
  console.error(`FAIL ${error.stack || error.message}`);
} finally {
  await fs.writeFile(
    path.join(root, "docs/BROWSER_SAFETY_RESULTS.json"),
    JSON.stringify(
      {
        results,
        widths,
        events,
        expectedFaults: [
          "One deliberately aborted notification mutation",
          "One deliberately fulfilled 503 notification mutation",
        ],
        liveStoreUntouched: true,
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
    `Browser safety checks: ${results.filter((result) => result.status === "passed").length} passed, ${results.filter((result) => result.status === "failed").length} failed.`,
  );
}
