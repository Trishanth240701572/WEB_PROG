<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';
require __DIR__ . '/fixtures/state.php';

$passed = 0;
$failed = 0;
$testRoot = sys_get_temp_dir() . '/shiftsync-tests-' . bin2hex(random_bytes(6));
mkdir($testRoot, 0700, true);
function expect(bool $condition, string $message = 'Assertion failed'): void { if (!$condition) throw new RuntimeException($message); }
function same(mixed $expected, mixed $actual, string $message = 'Values differ'): void { expect($expected === $actual, $message . ': ' . json_encode([$expected, $actual])); }
function failure(callable $task, string $code): DomainError { try { $task(); } catch (DomainError $error) { same($code, $error->errorCode, 'Unexpected failure'); return $error; } throw new RuntimeException('Expected failure: ' . $code); }
function test(string $label, callable $task): void { global $passed, $failed; try { $task(); $passed++; echo 'PASS ' . $label . "\n"; } catch (Throwable $error) { $failed++; echo 'FAIL ' . $label . ': ' . $error->getMessage() . "\n"; } }
function temp_store(array $state): Store { global $testRoot; $dir = $testRoot . '/' . bin2hex(random_bytes(4)); mkdir($dir, 0700); $store = new Store($dir . '/state.json'); $store->init($state); return $store; }
function command(array &$s, string $actor, string $action, array $params): array { return Domain::command($s, $s['users'][$actor], $action, $params); }
function roster_params(array $s): array { $r = array_values($s['rosters'])[0]; return ['rosterId' => $r['id'], 'version' => $r['version']]; }
function remove_tree(string $path): void { foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $item) { if ($item->isDir()) rmdir($item->getPathname()); else unlink($item->getPathname()); } rmdir($path); }
function workers(string $mode, string $path, array $payloads): array { global $testRoot; $gate = $testRoot . '/gate-' . bin2hex(random_bytes(4)); $jobs = []; foreach ($payloads as $payload) { $pipes = []; $process = proc_open([PHP_BINARY, __DIR__ . '/concurrency/worker.php', $mode, $path, $gate, json_encode($payload, JSON_THROW_ON_ERROR)], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes); if (!is_resource($process)) throw new RuntimeException('Cannot launch independent PHP worker.'); fclose($pipes[0]); $jobs[] = [$process, $pipes]; } file_put_contents($gate, 'go'); $results = []; foreach ($jobs as [$process, $pipes]) { $output = stream_get_contents($pipes[1]); $error = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]); $exit = proc_close($process); expect($exit === 0, 'Worker failed: ' . $error); $results[] = json_decode($output, true, 64, JSON_THROW_ON_ERROR); } return $results; }
function run_cli(string $script, array $args, string $storePath, string $stdin = ''): array { $pipes = []; $env = array_merge(getenv(), ['SHIFTSYNC_STORE' => $storePath, 'SHIFTSYNC_ENV' => 'test', 'SHIFTSYNC_TEST_NOW' => '2029-12-01T00:00:00Z']); $process = proc_open(array_merge([PHP_BINARY, dirname(__DIR__) . '/scripts/' . $script], $args), [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__), $env); expect(is_resource($process)); if ($stdin !== '') fwrite($pipes[0], $stdin); fclose($pipes[0]); $output = stream_get_contents($pipes[1]); $error = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]); return ['exit' => proc_close($process), 'output' => $output, 'error' => $error]; }

test('Canonical Monday dates and UTC blocks ignore server default timezone', function (): void {
    Time::configure('Asia/Kolkata', '2029-12-01T00:00:00Z');
    foreach (['Asia/Kolkata', 'UTC', 'America/New_York'] as $zone) { date_default_timezone_set($zone); same(['2030-01-07T03:30:00Z', '2030-01-07T06:30:00Z'], Time::slotTimes('2030-01-07', 'morning')); }
    failure(fn() => Time::week('2030-01-08'), 'invalid_week'); failure(fn() => Time::date('2030-02-30'), 'invalid_date');
    expect(!Time::overlap(['startsAt' => '2030-01-07T03:30:00Z', 'endsAt' => '2030-01-07T06:30:00Z'], ['startsAt' => '2030-01-07T06:30:00Z', 'endsAt' => '2030-01-07T09:30:00Z']), 'Adjacent intervals must not overlap');
});
test('Availability ownership, partial saves, unknown states and retroactive cutoff', function (): void {
    $s = fixture(false); $params = ['week' => '2030-01-07', 'version' => 0, 'values' => ['2030-01-07' => ['morning' => 'unavailable']]];
    failure(fn() => command($s, 't1', 'availability.save', $params + ['staffId' => 't2']), 'forbidden');
    command($s, 't1', 'availability.save', $params); same('unavailable', $s['availability']['t1']['2030-01-07']['morning']);
    $slot = array_values($s['slots'])[0]; failure(fn() => command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slot['id'], 'staffId' => 't1']), 'assignment_ineligible');
    unset($s['availability']['t2']['2030-01-07']['morning']); failure(fn() => command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slot['id'], 'staffId' => 't2']), 'assignment_ineligible');
    Time::configure('Asia/Kolkata', '2030-01-07T03:30:00Z'); failure(fn() => command($s, 't3', 'availability.save', $params), 'duty_started');
});
test('Current draft and published assignments protect availability', function (): void {
    foreach ([false, true] as $published) { $s = fixture(true, $published); $error = failure(fn() => command($s, 't1', 'availability.save', ['week' => '2030-01-07', 'version' => 0, 'values' => ['2030-01-07' => ['morning' => 'not_submitted']]]), 'assigned_availability'); same(fixture_assignment($s, 't1')['id'], $error->fields['assignmentId']); }
});
test('Availability versions protect old snapshots, separate tabs and conflicting cells atomically', function (): void {
    $s = fixture(false); unset($s['availabilityVersions']);
    $store = temp_store($s); $beforeRead = $store->read();
    $tabA = Domain::availability($beforeRead, $s['users']['t1'], '2030-01-07');
    $tabB = Domain::availability($beforeRead, $s['users']['t1'], '2030-01-07');
    same(0, $tabA['version']); same($beforeRead, $store->read(), 'Legacy version projection cannot rewrite a GET snapshot');
    $save = function (array $payload) use ($store): array {
        return $store->transaction(fn(array &$state): array => command($state, 't1', 'availability.save', $payload));
    };
    failure(fn() => $save(['week' => '2030-01-07', 'values' => []]), 'version_required');
    failure(fn() => $save(['week' => '2030-01-07', 'version' => '0', 'values' => []]), 'version_required');
    same($beforeRead, $store->read(), 'Missing concurrency metadata cannot consume a version');
    $tabA['values']['2030-01-07']['morning'] = 'unavailable';
    $accepted = $save($tabA); same(1, $accepted['version']);
    $committed = $store->read(); same(1, $committed['availabilityVersions']['t1']['2030-01-07']);
    $tabB['values']['2030-01-08']['morning'] = 'unavailable';
    failure(fn() => $save($tabB), 'stale_version');
    same($committed, $store->read(), 'An older Tuesday edit cannot restore Monday or partially save');
    $tabB['values']['2030-01-07']['morning'] = 'not_submitted';
    failure(fn() => $save($tabB), 'stale_version'); same($committed, $store->read(), 'Same-cell conflicts also preserve the complete prior snapshot');
    $fresh = Domain::availability($committed, $s['users']['t1'], '2030-01-07');
    $fresh['values']['2030-01-08']['morning'] = 'unavailable';
    same(2, $save($fresh)['version']);
    $after = $store->read(); same('unavailable', $after['availability']['t1']['2030-01-07']['morning']);
    same('unavailable', $after['availability']['t1']['2030-01-08']['morning']);
    same(0, Domain::availability($after, $s['users']['t2'], '2030-01-07')['version']);
    same(0, Domain::availability($after, $s['users']['t1'], '2030-01-14')['version']);
});
test('Supervisor checks active staff, duplicate, cross-lab overlap and capacity', function (): void {
    $s = fixture(false); $slots = array_values($s['slots']);
    failure(fn() => command($s, 't1', 'roster.assign', roster_params($s) + ['slotId' => $slots[0]['id'], 'staffId' => 't1']), 'forbidden');
    command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[0]['id'], 'staffId' => 't1']);
    failure(fn() => command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[0]['id'], 'staffId' => 't1']), 'assignment_ineligible');
    failure(fn() => command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[1]['id'], 'staffId' => 't1']), 'assignment_ineligible');
    command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[2]['id'], 'staffId' => 't1']);
    failure(fn() => command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[0]['id'], 'staffId' => 'supervisor']), 'assignment_ineligible');
    $s['users']['t2']['active'] = false; failure(fn() => command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[0]['id'], 'staffId' => 't2']), 'assignment_ineligible');
    command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[0]['id'], 'staffId' => 'a1']);
    failure(fn() => command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slots[0]['id'], 'staffId' => 'a2']), 'assignment_ineligible');
});
test('Headcount alone does not satisfy technician coverage or publication', function (): void {
    $s = fixture(false); $slot = array_values($s['slots'])[0];
    foreach (['a1', 'a2'] as $staff) command($s, 'supervisor', 'roster.assign', roster_params($s) + ['slotId' => $slot['id'], 'staffId' => $staff]);
    $c = Domain::coverage($s, $slot); same(0, $c['missingPeople']); same(1, $c['missingTechnicians']);
    failure(fn() => command($s, 'supervisor', 'roster.publish', roster_params($s)), 'coverage_incomplete');
    failure(fn() => command($s, 'supervisor', 'roster.requirements', roster_params($s) + ['slotId' => $slot['id'], 'headcount' => 1, 'technicianMinimum' => 2]), 'invalid_requirements');
});
test('Draft versions reject stale edits; valid publication is immutable and notifies once', function (): void {
    $s = fixture(true, false); $params = roster_params($s); $slot = array_values($s['slots'])[0];
    command($s, 'supervisor', 'roster.requirements', $params + ['slotId' => $slot['id'], 'headcount' => 2, 'technicianMinimum' => 1]);
    failure(fn() => command($s, 'supervisor', 'roster.requirements', $params + ['slotId' => $slot['id'], 'headcount' => 2, 'technicianMinimum' => 0]), 'stale_version');
    same(0, count(Domain::bootstrap($s, $s['users']['t1'])['rosters']));
    command($s, 'supervisor', 'roster.publish', roster_params($s)); same(8, count($s['notifications'])); same(1, count(Domain::bootstrap($s, $s['users']['t1'])['rosters']));
    failure(fn() => command($s, 'supervisor', 'roster.requirements', roster_params($s) + ['slotId' => $slot['id'], 'headcount' => 3, 'technicianMinimum' => 1]), 'roster_published');
});
test('Candidate search validates both staff, overlaps and technician requirements', function (): void {
    $s = fixture(); $a = fixture_assignment($s, 't1'); $b = fixture_assignment($s, 't3', '2030-01-07', 'afternoon');
    $items = Domain::candidates($s, $s['users']['t1'], $a['id']); $byId = array_column($items, null, 'assignmentId'); expect($byId[$b['id']]['eligible']);
    $s['availability']['t3']['2030-01-07']['morning'] = 'unavailable'; $items = Domain::candidates($s, $s['users']['t1'], $a['id']); $byId = array_column($items, null, 'assignmentId'); expect(!$byId[$b['id']]['eligible'], 'Recipient availability must be checked');
    expect(str_contains(implode(' ', $byId[$b['id']]['reasons']), 'Unavailable'));
    $s = fixture(); $items = Domain::candidates($s, $s['users']['t1'], $a['id']); $blocked = array_filter($items, fn($item) => !$item['eligible']); expect((bool)array_filter($blocked, fn($item) => str_contains(implode(' ', $item['reasons']), 'Overlaps'))); expect((bool)array_filter($blocked, fn($item) => str_contains(implode(' ', $item['reasons']), 'technician')));
    failure(fn() => Domain::candidates($s, $s['users']['a1'], $a['id']), 'forbidden');
});
test('Request and acceptance preserve owners; exact creation retries do not duplicate', function (): void {
    $s = fixture(); $before = $s['assignments']; $swap = fixture_swap($s); same($before, $s['assignments']); $noticeCount = count($s['notifications']);
    $again = command($s, 't1', 'swap.create', ['assignmentId' => $swap['assignmentId'], 'targetAssignmentId' => $swap['targetAssignmentId'], 'operationId' => 'fixture-operation-00001', 'note' => 'Private fictional note']); same($swap['id'], $again['id']); same($noticeCount, count($s['notifications']));
    failure(fn() => command($s, 't1', 'swap.create', ['assignmentId' => $swap['assignmentId'], 'targetAssignmentId' => $swap['targetAssignmentId'], 'operationId' => 'fixture-operation-00001', 'note' => 'different']), 'operation_conflict');
    command($s, 't3', 'swap.accept', ['id' => $swap['id'], 'version' => 1]); same($before, $s['assignments']); same('awaiting_supervisor', $s['swaps'][$swap['id']]['status']);
});
test('Wrong actors and active assignment reservations cannot bypass workflow', function (): void {
    $s = fixture(); $swap = fixture_swap($s);
    foreach ([['t1', 'swap.accept'], ['t3', 'swap.withdraw'], ['a1', 'swap.decline'], ['t1', 'swap.approve']] as [$actor, $action]) failure(fn() => command($s, $actor, $action, ['id' => $swap['id'], 'version' => 1]), 'forbidden');
    failure(fn() => command($s, 'supervisor', 'swap.approve', ['id' => $swap['id'], 'version' => 1]), 'invalid_transition');
    failure(fn() => command($s, 't1', 'swap.create', ['assignmentId' => $swap['assignmentId'], 'targetAssignmentId' => fixture_assignment($s, 't4', '2030-01-08', 'afternoon')['id'], 'operationId' => 'fixture-operation-00002']), 'swap_ineligible');
});
test('Decline, withdrawal and reasoned rejection keep original assignments and history', function (): void {
    foreach ([['t3', 'swap.decline', false], ['t1', 'swap.withdraw', false], ['supervisor', 'swap.reject', true]] as [$actor, $action, $accepted]) { $s = fixture(); $swap = fixture_swap($s, $accepted); $before = $s['assignments']; if ($action === 'swap.reject') failure(fn() => command($s, $actor, $action, ['id' => $swap['id'], 'version' => $swap['version']]), 'reason_required'); command($s, $actor, $action, ['id' => $swap['id'], 'version' => $swap['version'], 'reason' => 'Fictional planning reason']); same($before, $s['assignments']); expect(count($s['swaps'][$swap['id']]['timeline']) >= 2); }
});
test('Atomic approval exchanges both owners once with audit and notices', function (): void {
    $s = fixture(); $swap = fixture_swap($s, true); $store = temp_store($s);
    $approve = fn(array &$state) => Domain::command($state, $state['users']['supervisor'], 'swap.approve', ['id' => $swap['id'], 'version' => $swap['version']]);
    $store->transaction($approve); $after = $store->read(); same('t3', $after['assignments'][$swap['assignmentId']]['staffId']); same('t1', $after['assignments'][$swap['targetAssignmentId']]['staffId']);
    expect((bool)array_filter($after['audit'], fn($a) => $a['action'] === 'assignments.exchanged')); expect(count($after['notifications']) >= count($s['notifications']) + 2);
    $store->transaction($approve); same($after, $store->read(), 'Repeated approval must not write or repeat side effects');
});
test('Changing incoming free availability invalidates requests atomically', function (): void {
    $s = fixture(); $swap = fixture_swap($s, true); $before = $s['assignments']; $notices = count($s['notifications']);
    command($s, 't1', 'availability.save', ['week' => '2030-01-07', 'version' => 0, 'values' => ['2030-01-07' => ['afternoon' => 'unavailable']]]); same('invalidated', $s['swaps'][$swap['id']]['status']); same($before, $s['assignments']); expect(count($s['notifications']) >= $notices + 2);
});
test('Changed assignment version and elapsed start prevent stale approval', function (): void {
    $s = fixture(); $swap = fixture_swap($s, true); $s['assignments'][$swap['assignmentId']]['version']++; $before = $s['assignments']; command($s, 'supervisor', 'swap.approve', ['id' => $swap['id'], 'version' => $swap['version']]); same('invalidated', $s['swaps'][$swap['id']]['status']); same($before, $s['assignments']);
    $s = fixture(); $swap = fixture_swap($s, true); $before = $s; Time::configure('Asia/Kolkata', '2030-01-07T03:30:00Z'); $dto = Domain::bootstrap($s, $s['users']['t1']); same('expired', $dto['swaps'][0]['status']); same($before, $s, 'GET DTO must not clean storage'); command($s, 'supervisor', 'swap.approve', ['id' => $swap['id'], 'version' => $swap['version']]); same('expired', $s['swaps'][$swap['id']]['status']); same($before['assignments'], $s['assignments']);
});
test('Role DTOs protect hashes, coworkers emails, availability and private swap notes', function (): void {
    $s = fixture(); $swap = fixture_swap($s); $dto = Domain::bootstrap($s, $s['users']['a1']); $json = json_encode($dto, JSON_THROW_ON_ERROR); expect(!str_contains($json, 'passwordHash')); expect(!str_contains($json, 't1@fixture.test')); expect(!str_contains($json, 'Private fictional note')); same([], $dto['swaps']); same($s['availability']['a1'], $dto['availability']);
    $s['users']['t1']['active'] = false; failure(fn() => Domain::bootstrap($s, ['id' => 't1', 'role' => 'supervisor']), 'unauthenticated');
});
test('Published report week/lab scope includes zero workload and staff privacy', function (): void {
    $s = fixture(); $all = Domain::report($s, $s['users']['supervisor'], '2030-01-07'); same(20, count($all['coverage'])); same(40, $all['totals']['duties']); same(120.0, $all['totals']['hours']); same(40, $all['totals']['assigned']); same(0, $all['totals']['missingTechnicians']); expect((bool)array_filter($all['workload'], fn($w) => $w['staffId'] === 'zero' && $w['duties'] === 0));
    $lab = Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'lab-a'); same(10, count($lab['coverage'])); same(20, $lab['totals']['duties']); same(60.0, $lab['totals']['hours']);
    $own = Domain::report($s, $s['users']['t1'], '2030-01-07'); same(1, count($own['workload'])); same([], $own['coverage']); same(15.0, $own['totals']['hours']); expect(str_contains($own['measure'], 'Scheduled'));
    $draft = fixture(true, false); same(0, Domain::report($draft, $draft['users']['supervisor'], '2030-01-07')['totals']['duties']);
});
test('CSV scope, formula neutralization, quotes and multiline values round-trip safely', function (): void {
    $s = fixture(); $s['users']['t1']['name'] = '=HYPERLINK("fictional","name")'; $report = Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'lab-a');
    $rows = Csv::rows($report, 'workload'); same(count($report['workload']) + 1, count($rows)); same('scheduled_hours', $rows[0][6]);
    foreach (['=1+1', '+CMD', '-2+3', '@SUM(A1)', '  =1+1', "\tSUM(A1)", "\rtest", "\ntest"] as $value) same("'" . $value, Csv::safe($value));
    foreach (['Ananya', 'A-B', ' plain text', '42'] as $value) same($value, Csv::safe($value));
    $stream = fopen('php://temp', 'w+'); $values = ['Name, comma', 'Quoted "value"', "Two\nlines", '=1+1']; fputcsv($stream, array_map([Csv::class, 'safe'], $values), ',', '"', ''); rewind($stream); same(['Name, comma', 'Quoted "value"', "Two\nlines", "'=1+1"], fgetcsv($stream, null, ',', '"', '')); fclose($stream);
    $export = json_encode($rows, JSON_THROW_ON_ERROR); expect(!str_contains($export, 'passwordHash') && !str_contains($export, 'Private fictional note'));
    same(11, count(Csv::rows($report, 'coverage'))); failure(fn() => Csv::rows($report, 'invalid'), 'invalid_report');
});
test('History state/staff/lab filters intersect without changing workload coverage totals', function (): void {
    $s = fixture(); $swap = fixture_swap($s, true); command($s, 'supervisor', 'swap.approve', ['id' => $swap['id'], 'version' => $swap['version']]);
    $all = Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'lab-a'); $filtered = Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'lab-a', 'approved', 't1'); same(1, count($filtered['swaps'])); same($all['totals'], $filtered['totals']); same($all['coverage'], $filtered['coverage']); same($all['workload'], $filtered['workload']); same([], Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'lab-b', 'approved', 't1')['swaps']); same([], Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'lab-a', 'rejected', 't1')['swaps']); same([], Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'lab-a', 'approved', 'a1')['swaps']);
    failure(fn() => Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'all', 'forged'), 'invalid_status'); failure(fn() => Domain::report($s, $s['users']['supervisor'], '2030-01-07', 'all', 'all', 'absent'), 'invalid_staff'); failure(fn() => Domain::report($s, $s['users']['t1'], '2030-01-07', 'all', 'all', 't3'), 'forbidden'); same(1, count(Domain::report($s, $s['users']['t1'], '2030-01-07', 'all', 'approved', 't1')['swaps']));
});
test('Malformed and missing stores fail safely; init refuses overwrite', function (): void {
    global $testRoot; $s = fixture(); $dir = $testRoot . '/malformed'; mkdir($dir); $path = $dir . '/state.json'; $store = new Store($path); failure(fn() => $store->read(), 'storage_unavailable'); file_put_contents($path, '{broken'); failure(fn() => $store->read(), 'storage_malformed'); same('{broken', file_get_contents($path)); $store->init($s, true); failure(fn() => $store->init($s), 'already_initialized');
});
test('Stored and restored published snapshots require every block and full technician coverage', function (): void {
    global $testRoot;
    $valid = fixture();
    $firstSlotId = array_key_first($valid['slots']);
    $missingSlot = $valid;
    foreach ($missingSlot['assignments'] as $id => $assignment) {
        if ($assignment['slotId'] === $firstSlotId) unset($missingSlot['assignments'][$id]);
    }
    unset($missingSlot['slots'][$firstSlotId]);
    $missingTechnician = $valid;
    $technicianAssignmentId = fixture_assignment($valid, 't1')['id'];
    $missingTechnician['assignments'][$technicianAssignmentId]['staffId'] = 'a3';
    $missingPerson = $valid;
    unset($missingPerson['assignments'][$technicianAssignmentId]);

    $dir = $testRoot . '/published-integrity'; mkdir($dir);
    $path = $dir . '/state.json';
    $restorePath = $dir . '/restored.json';
    (new Store($restorePath))->init($valid);
    $priorRestoredBytes = file_get_contents($restorePath);
    foreach (['missing-slot' => $missingSlot, 'missing-technician' => $missingTechnician, 'missing-person' => $missingPerson] as $label => $invalid) {
        $json = json_encode($invalid, JSON_THROW_ON_ERROR);
        file_put_contents($path, $json);
        failure(fn() => (new Store($path))->read(), 'storage_malformed');
        same($json, file_get_contents($path), 'Reading must preserve the invalid snapshot for recovery');
        same(1, run_cli('restore.php', ['--input', $path, '--replace-existing'], $restorePath)['exit'], $label);
        same($priorRestoredBytes, file_get_contents($restorePath), 'Rejected restore must preserve the prior complete state');
    }
    $draft = $missingTechnician;
    foreach ($draft['rosters'] as &$roster) $roster['status'] = 'draft';
    unset($roster);
    unset($draft['assignments'][array_key_first($draft['assignments'])]);
    $draftPath = $dir . '/draft.json';
    (new Store($draftPath))->init($draft);
    same($draft, (new Store($draftPath))->read(), 'Draft staffing and technician gaps remain valid');
});
test('Failed encoding/write leaves complete previous valid snapshot unchanged', function (): void {
    $s = fixture(); $store = temp_store($s); $before = $store->read(); failure(fn() => $store->transaction(function (array &$state): void { $state['users']['t1']['name'] = "\xB1\x31"; }), 'storage_write_failed'); same($before, $store->read());
});
test('Failed replacement preserves old bytes after a full temporary snapshot write', function (): void {
    global $testRoot; $s = fixture(); $dir = $testRoot . '/replacement'; mkdir($dir); $path = $dir . '/state.json'; (new Store($path))->init($s); $before = file_get_contents($path);
    $store = new class($path) extends Store { public bool $replacementAttempted = false; protected function replaceSnapshot(string $temporary, string $destination): bool { $this->replacementAttempted = is_file($temporary) && filesize($temporary) > 0; return false; } };
    failure(fn() => $store->transaction(function (array &$state): void { $state['users']['t1']['name'] = 'Changed fictional name'; }), 'storage_write_failed'); expect($store->replacementAttempted); same($before, file_get_contents($path)); same([], glob($dir . '/.state-*'), 'Failed temporary file should be removed'); same($s, $store->read());
});
test('CLI seed refuses overwrite; deliberate reset creates new credentials', function (): void {
    global $testRoot; $dir = $testRoot . '/cli-seed'; mkdir($dir); $path = $dir . '/state.json';
    $result = run_cli('seed-demo.php', ['--week-start', '2030-01-07'], $path); same(0, $result['exit'], $result['error']); $before = file_get_contents($path); $state = (new Store($path))->read(); same(13, count($state['users'])); expect(is_file($dir . '/demo-credentials.txt')); expect(!str_contains($result['output'], 'Ss!'), 'Passwords must not be printed by demo setup');
    $result = run_cli('seed-demo.php', ['--week-start', '2030-01-07'], $path); same(1, $result['exit']); same($before, file_get_contents($path));
    $result = run_cli('seed-demo.php', ['--week-start', '2030-01-07', '--reset'], $path); same(0, $result['exit'], $result['error']); expect($before !== file_get_contents($path)); same(2, count(glob($dir . '/demo-credentials*.txt')));
});
test('CLI production provisioning hashes stdin passwords and protects existing accounts', function (): void {
    global $testRoot; $dir = $testRoot . '/cli-users'; mkdir($dir); $path = $dir . '/state.json'; $password = 'Fictional-safe-password-123';
    $args = ['--initialize-empty', '--name', 'Fictional Supervisor', '--email', 'supervisor@fixture.test', '--role', 'supervisor', '--password-stdin']; $result = run_cli('create-user.php', $args, $path, $password . "\n"); same(0, $result['exit'], $result['error']); $state = (new Store($path))->read(); same(1, count($state['users'])); $user = array_values($state['users'])[0]; expect(password_verify($password, $user['passwordHash'])); expect(!str_contains(file_get_contents($path), $password)); $before = file_get_contents($path);
    same(1, run_cli('create-user.php', $args, $path, $password . "\n")['exit']); same($before, file_get_contents($path));
    same(0, run_cli('create-user.php', ['--name', 'Fictional Staff', '--email', 'staff@fixture.test', '--qualification', 'technician', '--password-stdin'], $path, $password . "\n")['exit']); same(2, count((new Store($path))->read()['users']));
});
test('Explicit bcrypt policy enforces byte limits and deliberately preserves existing hashes', function (): void {
    foreach ([str_repeat('x', 12), str_repeat('x', 72), str_repeat('é', 36)] as $password) {
        $hash = Passwords::hash($password);
        same('bcrypt', password_get_info($hash)['algoName']);
        expect(Passwords::verify($password, $hash));
        expect(!Passwords::verify('a-different-password', $hash));
    }
    foreach ([str_repeat('x', 11), str_repeat('x', 73), str_repeat('é', 37), "null\0byte-password"] as $password) {
        failure(fn() => Passwords::hash($password), 'password_policy');
    }
    $prefix = str_repeat('p', 72);
    // This reproduces the information retained by old bcrypt, without creating a long new password.
    $legacyHash = password_hash($prefix, PASSWORD_BCRYPT, ['cost' => 4]);
    expect(Passwords::verify($prefix, $legacyHash));
    expect(!Passwords::verify(str_repeat('p', 71) . 'q', $legacyHash), 'The final byte within the supported 72-byte password is significant');
    foreach ([$prefix . 'first-suffix', $prefix . 'second-suffix'] as $candidate) {
        failure(fn() => Passwords::verify($candidate, $legacyHash), 'password_policy');
    }
    $shortLegacyHash = password_hash('short', PASSWORD_BCRYPT, ['cost' => 4]);
    expect(Passwords::verify('short', $shortLegacyHash), 'Existing short passwords must not be silently locked out');
});
test('Provisioning and explicit password reset share the byte policy and advance credential versions', function (): void {
    global $testRoot;
    $dir = $testRoot . '/password-policy'; mkdir($dir); $path = $dir . '/state.json';
    $args = ['--initialize-empty', '--name', 'Password Test Supervisor', '--email', 'password@fixture.test', '--role', 'supervisor', '--password-stdin'];
    same(1, run_cli('create-user.php', $args, $path, str_repeat('x', 73) . "\n")['exit']);
    expect(!is_file($path), 'Oversized account creation must not initialize storage');
    same(0, run_cli('create-user.php', $args, $path, str_repeat('x', 72) . "\n")['exit']);
    $state = (new Store($path))->read(); $user = array_values($state['users'])[0];
    $before = file_get_contents($path);
    same(1, run_cli('reset-password.php', ['--email', $user['email'], '--password-stdin'], $path, str_repeat('é', 37) . "\n")['exit']);
    same($before, file_get_contents($path), 'An oversized reset cannot change hashes or versions');
    $replacement = str_repeat('é', 36);
    same(0, run_cli('reset-password.php', ['--email', $user['email'], '--password-stdin'], $path, $replacement . "\n")['exit']);
    $after = (new Store($path))->read()['users'][$user['id']];
    same($user['credentialVersion'] + 1, $after['credentialVersion']);
    expect(Passwords::verify($replacement, $after['passwordHash']));
    expect(!Passwords::verify(str_repeat('x', 72), $after['passwordHash']));
    expect(!str_contains(file_get_contents($path), $replacement), 'A reset never stores plaintext');
});
test('CLI backup and validated restore round-trip while refusing unsafe overwrite', function (): void {
    global $testRoot; $dir = $testRoot . '/cli-backup'; mkdir($dir); $source = $dir . '/source'; $destination = $dir . '/destination'; mkdir($source); mkdir($destination); $path = $source . '/state.json'; $restorePath = $destination . '/state.json'; $state = fixture(); (new Store($path))->init($state); $backup = $dir . '/private-backup.json'; same(0, run_cli('backup.php', ['--output', $backup], $path)['exit']); same($state, json_decode(file_get_contents($backup), true, 128, JSON_THROW_ON_ERROR));
    same(0, run_cli('restore.php', ['--input', $backup], $restorePath)['exit']); same($state, (new Store($restorePath))->read()); $before = file_get_contents($restorePath); same(1, run_cli('restore.php', ['--input', $backup], $restorePath)['exit']); same($before, file_get_contents($restorePath)); $malformed = $dir . '/bad.json'; file_put_contents($malformed, '{broken'); same(1, run_cli('restore.php', ['--input', $malformed, '--replace-existing'], $restorePath)['exit']); same($before, file_get_contents($restorePath)); same(0, run_cli('restore.php', ['--input', $backup, '--replace-existing'], $restorePath)['exit']);
});
test('Independent workers approve the same request exactly once', function (): void {
    global $testRoot; $s = fixture(); $swap = fixture_swap($s, true); $dir = $testRoot . '/approve'; mkdir($dir); $path = $dir . '/state.json'; $store = new Store($path); $store->init($s); $payload = ['actor' => 'supervisor', 'params' => ['id' => $swap['id'], 'version' => $swap['version']]]; $results = workers('approve', $path, [$payload, $payload]); expect($results[0]['ok'] && $results[1]['ok']); $after = $store->read(); same('t3', $after['assignments'][$swap['assignmentId']]['staffId']); same(1, count(array_filter($after['audit'], fn($a) => $a['action'] === 'assignments.exchanged'))); same($s['revision'] + 1, $after['revision']);
});
test('Independent request creators reserve an assignment only once', function (): void {
    global $testRoot; $s = fixture(); $dir = $testRoot . '/create'; mkdir($dir); $path = $dir . '/state.json'; $store = new Store($path); $store->init($s); $a = fixture_assignment($s, 't1'); $b = fixture_assignment($s, 't3', '2030-01-07', 'afternoon'); $c = fixture_assignment($s, 't4', '2030-01-08', 'afternoon'); $results = workers('create', $path, [['actor' => 't1', 'params' => ['assignmentId' => $a['id'], 'targetAssignmentId' => $b['id'], 'operationId' => 'parallel-operation-0001']], ['actor' => 't1', 'params' => ['assignmentId' => $a['id'], 'targetAssignmentId' => $c['id'], 'operationId' => 'parallel-operation-0002']]]); same(1, count(array_filter($results, fn($r) => $r['ok']))); same(1, count($store->read()['swaps']));
});
test('An independent exclusive lock causes bounded timeout and preserves state', function (): void {
    global $testRoot; $s = fixture(); $dir = $testRoot . '/busy'; mkdir($dir); $path = $dir . '/state.json'; $store = new Store($path); $store->init($s); $before = file_get_contents($path); $gate = $dir . '/gate'; $ready = $dir . '/ready'; $pipes = []; $process = proc_open([PHP_BINARY, __DIR__ . '/concurrency/worker.php', 'hold', $path, $gate, json_encode(['ready' => $ready])], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes); expect(is_resource($process)); fclose($pipes[0]); file_put_contents($gate, 'go'); $deadline = microtime(true) + 5; while (!is_file($ready)) { if (microtime(true) > $deadline) throw new RuntimeException('Lock worker did not become ready'); usleep(5000); } $start = microtime(true); failure(fn() => (new Store($path, 0.1))->read(), 'storage_busy'); expect(microtime(true) - $start < 0.6, 'Lock timeout should be bounded'); stream_get_contents($pipes[1]); fclose($pipes[1]); fclose($pipes[2]); same(0, proc_close($process)); same($before, file_get_contents($path));
});

remove_tree($testRoot);
Time::configure('Asia/Kolkata');
echo "\n$passed passed, $failed failed. All stores were isolated temporary fixtures.\n";
exit($failed > 0 ? 1 : 0);
