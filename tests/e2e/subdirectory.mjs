import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// A local router simulates an Apache Alias with public/ as its only exposed tree.
// This checks real PHP requests and built assets; it does not replace Apache QA.
const root = fileURLToPath(new URL('../../', import.meta.url));
const temporaryRoot = path.resolve(root, 'tests/.tmp');
const testDir = path.join(temporaryRoot, `subdirectory-${Date.now()}`);
const prefix = '/shiftsync';
const php = process.env.PHP_BINARY || (process.platform === 'win32' ? path.join(root, '.tools/php/php.exe') : 'php');
const statePath = path.join(testDir, 'state.json');
const routerPath = path.join(testDir, 'router.php');
const env = { ...process.env, SHIFTSYNC_BASE_PATH: prefix, SHIFTSYNC_STORE: statePath,
  SHIFTSYNC_SESSION_PATH: path.join(testDir, 'sessions'), SHIFTSYNC_TEST_PUBLIC: path.join(root, 'public'),
  SHIFTSYNC_ENV: 'test', SHIFTSYNC_TEST_NOW: '2030-01-01T06:00:00Z' };
await fs.mkdir(testDir, { recursive: true });
await fs.writeFile(routerPath, `<?php
$prefix = '/shiftsync';
$request = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($request !== $prefix && !str_starts_with($request, $prefix . '/')) {
    http_response_code(404); echo 'Outside the test alias'; return true;
}
$relative = substr($request, strlen($prefix));
if ($relative === '' || $relative === '/') $relative = '/index.php';
$public = realpath(getenv('SHIFTSYNC_TEST_PUBLIC'));
$file = realpath($public . DIRECTORY_SEPARATOR . ltrim(rawurldecode($relative), '/'));
if (!$file || !str_starts_with($file, $public . DIRECTORY_SEPARATOR) || !is_file($file)) {
    http_response_code(404); echo 'Not found'; return true;
}
if (pathinfo($file, PATHINFO_EXTENSION) === 'php') {
    $_SERVER['SCRIPT_NAME'] = $prefix . $relative;
    $_SERVER['PHP_SELF'] = $_SERVER['SCRIPT_NAME'];
    $_SERVER['SCRIPT_FILENAME'] = $file;
    require $file; return true;
}
$types = ['css' => 'text/css', 'js' => 'text/javascript', 'svg' => 'image/svg+xml', 'json' => 'application/json', 'ico' => 'image/x-icon'];
header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
readfile($file); return true;
`);

const results = [];
let server;
let serverErrors = '';
let origin = '';
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const snapshot = () => fs.readFile(statePath, 'utf8').then(JSON.parse);
let credentials;
class Client {
  cookies = new Map(); csrf = '';
  async request(route, options = {}) {
    const response = await fetch(origin + prefix + route, { ...options, redirect: 'manual', headers: {
      Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...options.headers,
    } });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(';')[0].split('='); this.cookies.set(key, value.join('='));
    }
    const raw = await response.text();
    return { status: response.status, headers: response.headers, raw,
      json: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw) : null };
  }
  async login(user) {
    const page = await this.request('/login.php');
    const csrf = page.raw.match(/name="csrf" value="([^"]+)"/)[1];
    const response = await this.request('/handlers/login.php', { method: 'POST',
      body: new URLSearchParams({ csrf, email: user.email, password: credentials[user.email] }) });
    assert.equal(response.status, 303);
    assert.ok(response.headers.get('location').startsWith(`${prefix}/app.php`));
    assert.ok(response.headers.getSetCookie().some(cookie => /path=\/shiftsync(?:;|$)/i.test(cookie)));
    const session = await this.api('session'); assert.equal(session.status, 200); this.csrf = session.json.data.csrf;
    return this;
  }
  api(action, params = {}) { return this.request(`/api/index.php?${new URLSearchParams({ action, ...params })}`); }
}
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
function pageRoutes(html) {
  return [...html.matchAll(/<(?:link|script|a|form)\b[^>]*?\b(?:href|src|action)="([^"]+)"/g)]
    .map(match => match[1].replaceAll('&amp;', '&'));
}
function assertPrefixed(html) {
  const routes = pageRoutes(html).filter(route => !route.startsWith('#'));
  assert.ok(routes.length > 0);
  for (const route of routes) assert.ok(route.startsWith(`${prefix}/`), `URL is missing configured prefix: ${route}`);
}
async function assertAssets(client, html) {
  const assets = pageRoutes(html).filter(route => /\.(?:css|js)(?:\?|$)/.test(route));
  assert.ok(assets.length > 0);
  for (const asset of assets) {
    const response = await client.request(asset.slice(prefix.length));
    assert.equal(response.status, 200, `Asset is served: ${asset}`);
    assert.ok(response.raw.length > 100, `Asset is nonempty: ${asset}`);
    assert.match(response.headers.get('content-type'), asset.includes('.css') ? /text\/css/ : /javascript/);
  }
}

try {
  await promisify(execFile)(php, ['scripts/seed-demo.php', '--week-start', '2030-01-07'], { cwd: root, env });
  credentials = Object.fromEntries((await fs.readFile(path.join(testDir, 'demo-credentials.txt'), 'utf8'))
    .split(/\r?\n/).filter(line => line.includes('\t')).map(line => line.split('\t')));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(php, ['-S', `127.0.0.1:${port}`, routerPath], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', data => { serverErrors += data.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await fetch(origin + prefix + '/login.php'); ready = true; break; } catch { await pause(100); }
  }
  assert.ok(ready, 'Temporary PHP server started');
  const state = await snapshot();
  const publicClient = new Client();
  await check('Public page, login action and local assets use /shiftsync/', async () => {
    for (const route of ['/index.php', '/login.php']) {
      const page = await publicClient.request(route); assert.equal(page.status, 200);
      assertPrefixed(page.raw); await assertAssets(publicClient, page.raw);
    }
    assert.equal((await fetch(origin + '/login.php')).status, 404, 'Alias does not expose a second root URL');
    assert.equal((await fetch(origin + prefix + '/storage/state.json')).status, 404);
  });
  let staff;
  let supervisor;
  await check('Staff and supervisor logins preserve prefix redirects and cookie paths', async () => {
    staff = await new Client().login(state.users['staff-12']);
    supervisor = await new Client().login(state.users['supervisor-1']);
  });
  await check('Manifest-driven app shell and compiled assets load under the prefix', async () => {
    const page = await staff.request('/app.php'); assert.equal(page.status, 200);
    assertPrefixed(page.raw); await assertAssets(staff, page.raw);
    const encodedContext = page.raw.match(/data-shiftsync="([^"]+)"/)[1];
    const context = JSON.parse(encodedContext.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
    assert.equal(context.basePath, prefix);
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/build/.vite/manifest.json'), 'utf8'));
    const entry = Object.values(manifest).find(chunk => chunk.isEntry); assert.ok(entry);
    assert.ok(page.raw.includes(`${prefix}/build/${entry.file}`));
    for (const css of entry.css || []) assert.ok(page.raw.includes(`${prefix}/build/${css}`));
  });
  await check('Prefixed API uses the same authenticated session and read-only state', async () => {
    const before = await fs.readFile(statePath, 'utf8');
    const response = await staff.api('bootstrap'); assert.equal(response.status, 200);
    assert.equal(response.json.data.user.id, 'staff-12');
    assert.equal((await publicClient.api('bootstrap')).status, 401);
    assert.equal(await fs.readFile(statePath, 'utf8'), before);
  });
  await check('Staff availability form saves and redirects within /shiftsync/', async () => {
    const page = await staff.request('/availability.php?week=2030-01-07');
    assert.equal(page.status, 200); assertPrefixed(page.raw); await assertAssets(staff, page.raw);
    const csrf = page.raw.match(/name="csrf" value="([^"]+)"/)[1];
    const version = page.raw.match(/name="version" value="(\d+)"/)[1];
    const response = await staff.request('/handlers/availability.php', { method: 'POST', body: new URLSearchParams({
      csrf, version, week: '2030-01-07', 'values[2030-01-07][morning]': 'unavailable',
    }) });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${prefix}/availability.php?week=2030-01-07&saved=1`);
    assert.equal((await snapshot()).availability['staff-12']['2030-01-07'].morning, 'unavailable');
  });
  await check('Prefixed CSV export agrees with authenticated report scope', async () => {
    const report = await supervisor.api('report', { week: '2030-01-07', lab: 'lab-a' }); assert.equal(report.status, 200);
    const csv = await supervisor.request('/reports/export.php?week=2030-01-07&lab=lab-a&type=workload');
    assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.equal(csv.raw.trim().split('\r\n').length - 1, report.json.data.workload.length);
    const own = await staff.request('/reports/export.php?week=2030-01-07&type=workload');
    assert.equal(own.raw.trim().split('\r\n').length, 2);
  });
  await check('Direct hash URL refresh serves the app shell with intact prefixed assets', async () => {
    const page = await staff.request('/app.php#/my-shifts'); assert.equal(page.status, 200);
    assert.match(page.raw, /id="root"/); assertPrefixed(page.raw); await assertAssets(staff, page.raw);
    assert.equal(new URL(origin + prefix + '/app.php#/my-shifts').pathname, `${prefix}/app.php`);
  });
} finally {
  if (server) { server.kill(); await new Promise(resolve => server.once('close', resolve)); }
  if (/PHP (Warning|Fatal error|Deprecated)/.test(serverErrors)) {
    results.push({ name: 'No PHP runtime warnings', passed: false }); console.error(serverErrors);
  } else { results.push({ name: 'No PHP runtime warnings', passed: true }); console.log('PASS No PHP runtime warnings'); }
  assert.ok(path.resolve(testDir).startsWith(temporaryRoot + path.sep));
  await fs.rm(testDir, { recursive: true, force: true });
}
console.log(`${results.filter(result => result.passed).length} passed; ${results.filter(result => !result.passed).length} failed`);
console.log('Scope: PHP router alias simulation; Apache configuration and browser JavaScript execution are separate checks.');
if (results.some(result => !result.passed)) process.exitCode = 1;
