import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const useRouter = process.argv.includes('--router');
const command = `node tests/e2e/http.mjs${useRouter ? ' --router' : ''}`;
const temporaryRoot = path.resolve(root, 'tests/.tmp');
const testDir = path.join(temporaryRoot, `http-${Date.now()}`);
const php = process.env.PHP_BINARY || (process.platform === 'win32' ? path.join(root, '.tools/php/php.exe') : 'php');
await fs.mkdir(testDir, { recursive: true });
const statePath = path.join(testDir, 'state.json');
const sessionPath = path.join(testDir, 'sessions');
const env = { ...process.env, SHIFTSYNC_STORE: statePath, SHIFTSYNC_SESSION_PATH: sessionPath,
  SHIFTSYNC_ENV: 'test', SHIFTSYNC_TEST_NOW: '2030-01-01T06:00:00Z' };
await promisify(execFile)(php, ['scripts/seed-demo.php', '--week-start', '2030-01-07'], { cwd: root, env });
const snapshot = () => fs.readFile(statePath, 'utf8').then(JSON.parse);
async function phpCommand(args, stdin = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(php, args, { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let errors = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', reject); child.on('close', code => resolve({ code, output, errors }));
    child.stdin.end(stdin);
  });
}
const sessionFileFor = client => path.join(sessionPath, `sess_${client.cookies.get('shiftsync_session')}`);
async function sessionActivity(client) {
  const session = await fs.readFile(sessionFileFor(client), 'utf8');
  return Number(session.match(/lastActivity\|i:(\d+);/)[1]);
}
const credentials = Object.fromEntries((await fs.readFile(path.join(testDir, 'demo-credentials.txt'), 'utf8')).split(/\r?\n/).filter(l => l.includes('\t')).map(l => l.split('\t')));
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const serverArguments = ['-S', `127.0.0.1:${port}`, '-t', 'public'];
if (useRouter) serverArguments.push('scripts/dev-router.php');
const server = spawn(php, serverArguments, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let serverErrors = '';
server.stderr.on('data', data => { serverErrors += data.toString(); });
for (let attempt = 0; attempt < 50; attempt++) {
  try { await fetch(`${origin}/login.php`); break; } catch { await new Promise(r => setTimeout(r, 100)); }
}
class Client {
  cookies = new Map(); csrf = '';
  async request(route, options = {}) {
    const response = await fetch(origin + route, { ...options, redirect: 'manual', headers: {
      Cookie: [...this.cookies].map(([k,v]) => `${k}=${v}`).join('; '), ...options.headers,
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
    const priorSession = this.cookies.get('shiftsync_session');
    const response = await this.request('/handlers/login.php', { method: 'POST', body: new URLSearchParams({ csrf, email: user.email, password: credentials[user.email] }) });
    assert.equal(response.status, 303, 'login redirects into workspace');
    assert.notEqual(this.cookies.get('shiftsync_session'), priorSession, 'session ID regenerated');
    const session = await this.api('session'); this.csrf = session.json.data.csrf;
    return this;
  }
  api(action, body, params = {}, headers = {}) {
    const query = new URLSearchParams({ action, ...params });
    return this.request(`/api/index.php?${query}`, body === undefined ? { headers } : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf, ...headers }, body: JSON.stringify(body),
    });
  }
  async data(action, body, params) {
    const result = await this.api(action, body, params);
    assert.equal(result.status, 200, `${action}: ${result.json?.error?.message}`);
    return result.json.data;
  }
}
const results = [];
async function check(name, action) { try { await action(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, status: 'failed', message: error.message }); console.error(`FAIL ${name}: ${error.message}`); } }
try {
  let state = await snapshot();
  const supervisor = await new Client().login(state.users['supervisor-1']);
  const staff = await new Client().login(state.users['staff-12']);
  await check('Unauthenticated API fails with JSON 401', async () => {
    const response = await new Client().api('bootstrap'); assert.equal(response.status, 401); assert.equal(response.json.ok, false);
  });
  await check('Success and error metadata use the configured server clock', async () => {
    const success = await supervisor.api('session'); assert.equal(success.status, 200);
    const error = await new Client().api('bootstrap'); assert.equal(error.status, 401);
    assert.equal(success.json.meta.serverTime, env.SHIFTSYNC_TEST_NOW);
    assert.equal(error.json.meta.serverTime, env.SHIFTSYNC_TEST_NOW);
  });
  await check('Login rejects missing CSRF before authenticating', async () => {
    const response = await new Client().request('/handlers/login.php', { method: 'POST', body: new URLSearchParams({ email: state.users['staff-12'].email, password: credentials[state.users['staff-12'].email] }) });
    assert.equal(response.status, 403); assert.match(response.raw, /nothing was saved/);
  });
  await check('Invalid credentials retain email and expose no password', async () => {
    const client = new Client(); const page = await client.request('/login.php');
    const csrf = page.raw.match(/name="csrf" value="([^"]+)"/)[1];
    const response = await client.request('/handlers/login.php', { method: 'POST', body: new URLSearchParams({ csrf, email: 'missing@shiftsync.test', password: 'invalid-secret-sentinel' }) });
    assert.equal(response.status, 422); assert.match(response.raw, /value="missing@shiftsync.test"/); assert.ok(!response.raw.includes('invalid-secret-sentinel'));
  });
  await check('Malformed array query parameters return clean JSON validation errors', async () => {
    for (const route of ['/api/index.php?action=report&week[]=2030-01-07', '/reports/export.php?week=2030-01-07&type[]=workload']) {
      const result = await supervisor.request(route);
      assert.equal(result.status, 422); assert.equal(result.json.error.code, 'invalid_query');
      assert.ok(!result.raw.includes('Warning'));
    }
  });
  await check('Invalid mutation CSRF preserves exact business snapshot', async () => {
    const before = await fs.readFile(statePath, 'utf8');
    const response = await supervisor.api('roster.create', { week: '2030-02-04' }, {}, { 'X-CSRF-Token': 'invalid' });
    assert.equal(response.status, 403); assert.equal(response.json.error.code, 'csrf_rejected'); assert.equal(await fs.readFile(statePath, 'utf8'), before);
  });
  await check('Staff cannot forge supervisor role or another availability owner', async () => {
    assert.equal((await staff.api('roster.create', { week: '2030-02-04', role: 'supervisor' })).status, 403);
    assert.equal((await staff.api('availability.save', { week: '2030-01-07', staffId: 'staff-1', values: {} })).status, 403);
  });
  await check('Normal PHP availability form saves without JavaScript', async () => {
    const page = await staff.request('/availability.php?week=2030-01-07'); assert.equal(page.status, 200);
    const version = page.raw.match(/name="version" value="(\d+)"/)[1];
    const body = new URLSearchParams({ csrf: staff.csrf, week: '2030-01-07', version, 'values[2030-01-07][morning]': 'available', 'values[2030-01-07][afternoon]': 'not_submitted' });
    const response = await staff.request('/handlers/availability.php', { method: 'POST', body }); assert.equal(response.status, 303);
    assert.equal((await snapshot()).availability['staff-12']['2030-01-07'].morning, 'available');
    assert.match((await staff.request('/availability.php?week=2030-01-07&saved=1')).raw, /Your availability is saved/);
  });
  await check('Availability API and PHP forms reject stale tabs and preserve unsaved choices', async () => {
    const tabA = await staff.data('availability', undefined, { week: '2030-01-07' });
    const tabB = structuredClone(tabA);
    const before = await fs.readFile(statePath, 'utf8');
    const missing = await staff.api('availability.save', { week: tabA.week, values: tabA.values });
    assert.equal(missing.status, 422); assert.equal(missing.json.error.code, 'version_required');
    assert.equal(await fs.readFile(statePath, 'utf8'), before);
    tabA.values['2030-01-07'].morning = 'unavailable';
    const saved = await staff.data('availability.save', tabA); assert.equal(saved.version, tabA.version + 1);
    const committed = await fs.readFile(statePath, 'utf8');
    tabB.values['2030-01-08'].morning = 'unavailable';
    const stale = await staff.api('availability.save', tabB);
    assert.equal(stale.status, 409); assert.equal(stale.json.error.code, 'stale_version');
    assert.equal(await fs.readFile(statePath, 'utf8'), committed);
    const body = new URLSearchParams({ csrf: staff.csrf, week: tabB.week, version: String(tabB.version) });
    for (const [date, blocks] of Object.entries(tabB.values)) {
      for (const [block, value] of Object.entries(blocks)) body.set(`values[${date}][${block}]`, value);
    }
    const formConflict = await staff.request('/handlers/availability.php', { method: 'POST', body });
    assert.equal(formConflict.status, 409); assert.match(formConflict.raw, /Your unsaved choices remain below/);
    assert.ok(formConflict.raw.includes(`name="version" value="${tabB.version}"`));
    assert.match(formConflict.raw, /id="availability-2030-01-08-morning"[\s\S]*?<option value="unavailable" selected>/);
    assert.equal(await fs.readFile(statePath, 'utf8'), committed);
    tabB.values['2030-01-07'].morning = 'not_submitted';
    assert.equal((await staff.api('availability.save', tabB)).status, 409);
    body.delete('version');
    assert.equal((await staff.request('/handlers/availability.php', { method: 'POST', body })).status, 422);
    assert.equal(await fs.readFile(statePath, 'utf8'), committed);
    const fresh = await staff.data('availability', undefined, { week: tabA.week });
    assert.equal(fresh.values['2030-01-07'].morning, 'unavailable');
    assert.equal(fresh.values['2030-01-08'].morning, 'available');
  });
  await check('Staff bootstrap excludes other private availability, emails and hashes', async () => {
    const result = await staff.data('bootstrap');
    assert.ok(!JSON.stringify(result).includes('passwordHash'));
    assert.ok(result.users.every(u => !('email' in u)));
    assert.ok(!('staff-1' in result.availability));
    assert.ok(result.rosters.every(r => r.status === 'published'));
  });
  await check('GET bootstrap, reports, candidates and session never rewrite business state', async () => {
    const before = await fs.readFile(statePath, 'utf8');
    await supervisor.data('bootstrap'); await supervisor.data('report', undefined, { week: '2030-01-07', lab: 'lab-a' }); await staff.data('session');
    assert.equal(await fs.readFile(statePath, 'utf8'), before);
  });
  await check('Automatic preview and report requests never advance idle activity during other users writes', async () => {
    const initial = await snapshot();
    const swap = Object.values(initial.swaps).find(request => request.status === 'awaiting_colleague');
    const idle = await new Client().login(initial.users[swap.requesterId]);
    const baseline = Math.floor(Date.now() / 1000) - 60;
    const originalSession = await fs.readFile(sessionFileFor(idle), 'utf8');
    await fs.writeFile(sessionFileFor(idle), originalSession.replace(/lastActivity\|i:\d+;/, `lastActivity|i:${baseline};`));
    const background = { 'X-Background-Refresh': '1' };
    let priorRevision = initial.revision;
    for (let attempt = 0; attempt < 3; attempt++) {
      const data = await supervisor.data('bootstrap');
      const draft = data.rosters.find(roster => roster.status === 'draft');
      const slot = data.slots.find(slot => slot.rosterId === draft.id);
      await supervisor.data('roster.requirements', { rosterId: draft.id, slotId: slot.id,
        version: draft.version, headcount: slot.headcount, technicianMinimum: attempt % 2 });
      const refreshed = await idle.api('bootstrap', undefined, {}, background);
      assert.equal(refreshed.status, 200); assert.ok(refreshed.json.meta.revision > priorRevision);
      priorRevision = refreshed.json.meta.revision;
      assert.equal((await idle.api('preview', undefined, { id: swap.id }, background)).status, 200);
      assert.equal((await idle.api('report', undefined, { week: '2030-01-07' }, background)).status, 200);
      assert.equal(await sessionActivity(idle), baseline);
    }
    const data = await supervisor.data('bootstrap'); const draft = data.rosters.find(roster => roster.status === 'draft');
    const slot = data.slots.find(slot => slot.rosterId === draft.id);
    await supervisor.data('roster.requirements', { rosterId: draft.id, slotId: slot.id,
      version: draft.version, headcount: slot.headcount, technicianMinimum: 1 });
    assert.equal((await idle.api('report', undefined, { week: '2030-01-07' })).status, 200);
    assert.ok(await sessionActivity(idle) > baseline, 'An explicit user request still counts as activity');
    const session = await fs.readFile(sessionFileFor(idle), 'utf8');
    await fs.writeFile(sessionFileFor(idle), session.replace(/lastActivity\|i:\d+;/, 'lastActivity|i:1;'));
    assert.equal((await idle.api('preview', undefined, { id: swap.id }, background)).status, 401);
    assert.equal((await idle.api('report', undefined, { week: '2030-01-07' }, background)).status, 401);
    const absolute = await new Client().login(initial.users[swap.requesterId]);
    const absoluteSession = await fs.readFile(sessionFileFor(absolute), 'utf8');
    await fs.writeFile(sessionFileFor(absolute), absoluteSession.replace(/signedInAt\|i:\d+;/, 'signedInAt|i:1;'));
    assert.equal((await absolute.api('report', undefined, { week: '2030-01-07' }, background)).status, 401);
  });
  await check('Draft gap repairs, optimistic versions and publication persist through HTTP', async () => {
    let data = await supervisor.data('bootstrap'); let draft = data.rosters.find(r => r.status === 'draft');
    const incomplete = await supervisor.api('roster.publish', { rosterId: draft.id, version: draft.version }); assert.equal(incomplete.status, 422);
    const draftSlots = data.slots.filter(s => s.rosterId === draft.id);
    for (const slot of draftSlots) {
      data = await supervisor.data('bootstrap'); draft = data.rosters.find(r => r.id === draft.id);
      let assigned = data.assignments.filter(a => a.slotId === slot.id);
      let technicians = assigned.filter(a => data.users.find(u => u.id === a.staffId).qualification === 'technician').length;
      if (assigned.length === slot.headcount && technicians < slot.technicianMinimum) {
        const remove = assigned.find(a => data.users.find(u => u.id === a.staffId).qualification !== 'technician');
        await supervisor.data('roster.remove', { rosterId: draft.id, assignmentId: remove.id, version: draft.version });
        assigned = assigned.filter(a => a.id !== remove.id);
      }
      while (assigned.length < slot.headcount) {
        data = await supervisor.data('bootstrap'); draft = data.rosters.find(r => r.id === draft.id);
        const candidates = await supervisor.data('assignment-candidates', undefined, { slotId: slot.id });
        const candidate = candidates.find(c => c.eligible && (technicians >= slot.technicianMinimum || c.qualification === 'technician'));
        assert.ok(candidate, 'manual eligible staff candidate exists');
        const priorVersion = draft.version;
        await supervisor.data('roster.assign', { rosterId: draft.id, slotId: slot.id, staffId: candidate.staffId, version: priorVersion });
        assert.equal((await supervisor.api('roster.assign', { rosterId: draft.id, slotId: slot.id, staffId: candidate.staffId, version: priorVersion })).status, 409);
        assigned.push({ staffId: candidate.staffId }); if (candidate.qualification === 'technician') technicians++;
      }
    }
    data = await supervisor.data('bootstrap'); draft = data.rosters.find(r => r.id === draft.id);
    await supervisor.data('roster.publish', { rosterId: draft.id, version: draft.version });
    assert.equal((await snapshot()).rosters[draft.id].status, 'published');
    assert.ok((await staff.data('bootstrap')).rosters.some(r => r.id === draft.id));
  });
  await check('Request and colleague acceptance preserve roster; approval exchanges exactly once', async () => {
    state = await snapshot(); const original = Object.values(state.swaps).find(s => s.status === 'awaiting_colleague');
    const requester = await new Client().login(state.users[original.requesterId]);
    const recipient = await new Client().login(state.users[original.recipientId]);
    const before = JSON.stringify((await snapshot()).assignments);
    const accepted = await recipient.data('swap.accept', { id: original.id, version: original.version });
    assert.equal(JSON.stringify((await snapshot()).assignments), before); assert.equal(accepted.status, 'awaiting_supervisor');
    const preview = await supervisor.data('preview', undefined, { id: original.id }); assert.equal(preview.eligible, true);
    const approved = await supervisor.data('swap.approve', { id: original.id, version: accepted.version }); assert.equal(approved.status, 'approved');
    let after = await snapshot();
    assert.equal(after.assignments[original.assignmentId].staffId, original.recipientId); assert.equal(after.assignments[original.targetAssignmentId].staffId, original.requesterId);
    const committed = await fs.readFile(statePath, 'utf8');
    await supervisor.data('swap.approve', { id: original.id, version: accepted.version }); assert.equal(await fs.readFile(statePath, 'utf8'), committed);
    assert.ok((await requester.data('bootstrap')).notifications.some(n => n.swapId === original.id && n.title.includes('approved')));
    assert.ok(after.audit.some(a => a.action === 'assignments.exchanged' && a.details.swapId === original.id));
  });
  await check('Report CSV matches filtered JSON and staff export excludes colleagues', async () => {
    const report = await supervisor.data('report', undefined, { week: '2030-01-07', lab: 'lab-a' });
    const csv = await supervisor.request('/reports/export.php?week=2030-01-07&lab=lab-a&type=workload'); assert.equal(csv.status, 200);
    const rows = csv.raw.trim().split('\r\n'); assert.equal(rows.length - 1, report.workload.length);
    assert.equal(report.totals.hours, report.workload.reduce((sum, r) => sum + r.hours, 0));
    const own = await staff.request('/reports/export.php?week=2030-01-07&type=workload'); assert.equal(own.raw.trim().split('\r\n').length, 2);
    assert.equal((await staff.request('/reports/export.php?week=2030-01-07&type=coverage')).status, 403);
    assert.ok(!csv.raw.includes('passwordHash') && !csv.raw.includes('csrf'));
  });
  await check('Notification ownership, logout and server-enforced idle expiry', async () => {
    const state = await snapshot(); const other = Object.values(state.notifications).find(n => n.userId !== 'staff-12');
    assert.equal((await staff.api('notification.read', { id: other.id })).status, 403);
    await staff.data('logout', {}); assert.equal((await staff.api('bootstrap')).status, 401);
    const expiring = await new Client().login(state.users['staff-12']);
    const sessionFile = path.join(sessionPath, `sess_${expiring.cookies.get('shiftsync_session')}`);
    const session = await fs.readFile(sessionFile, 'utf8');
    await fs.writeFile(sessionFile, session.replace(/lastActivity\|i:\d+;/, 'lastActivity|i:1;'));
    assert.equal((await expiring.api('bootstrap', undefined, {}, { 'X-Background-Refresh': '1' })).status, 401);
  });
  await check('Password resets invalidate old sessions and oversized suffix variants cannot authenticate', async () => {
    const current = await snapshot(); const user = current.users['staff-12'];
    const oldSession = await new Client().login(user);
    const replacement = 'p'.repeat(72);
    const reset = await phpCommand(['scripts/reset-password.php', '--email', user.email, '--password-stdin'], `${replacement}\n`);
    assert.equal(reset.code, 0); assert.ok(!reset.output.includes(replacement));
    assert.equal((await oldSession.api('bootstrap')).status, 401, 'Explicit reset invalidates previous credentials sessions');
    for (const suffix of ['first-suffix', 'second-suffix']) {
      const client = new Client(); const page = await client.request('/login.php');
      const csrf = page.raw.match(/name="csrf" value="([^"]+)"/)[1];
      const response = await client.request('/handlers/login.php', { method: 'POST', body: new URLSearchParams({
        csrf, email: user.email, password: replacement + suffix,
      }) });
      assert.equal(response.status, 422); assert.match(response.raw, /at most 72 bytes/);
      assert.equal((await client.api('bootstrap')).status, 401);
      assert.ok(!response.raw.includes(suffix));
    }
    credentials[user.email] = replacement;
    const renewed = await new Client().login(user);
    assert.equal((await renewed.api('bootstrap')).status, 200, 'The supported 72-byte password still signs in');
  });
} finally {
  server.kill(); await new Promise(resolve => server.once('close', resolve));
  if (/PHP (Warning|Fatal error|Deprecated)/.test(serverErrors)) results.push({ name: 'No PHP runtime warnings', status: 'failed', message: serverErrors.match(/PHP (Warning|Fatal error|Deprecated)[^\r\n]*/g)?.join('\n') });
  else results.push({ name: 'No PHP runtime warnings', status: 'passed' });
  await fs.writeFile(path.join(root, 'docs/HTTP_RESULTS.json'), JSON.stringify({ command, at: new Date().toISOString(), results }, null, 2));
  assert.ok(path.resolve(testDir).startsWith(temporaryRoot + path.sep));
  await fs.rm(testDir, { recursive: true, force: true });
}
console.log(`${results.filter(r => r.status === 'passed').length} passed; ${results.filter(r => r.status === 'failed').length} failed`);
if (results.some(r => r.status === 'failed')) process.exitCode = 1;
