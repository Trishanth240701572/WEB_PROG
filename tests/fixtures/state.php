<?php
declare(strict_types=1);

/** Entirely fictional data with a fixed server clock, separate from local demo records. */
function fixture(bool $filled = true, bool $published = true): array
{
    Time::configure('Asia/Kolkata', '2029-12-01T00:00:00Z');
    $state = ['schemaVersion' => 1, 'revision' => 0, 'counters' => [], 'users' => [], 'availability' => [], 'rosters' => [], 'slots' => [], 'assignments' => [], 'swaps' => [], 'notifications' => [], 'audit' => [], 'operations' => []];
    foreach (['supervisor', 't1', 't2', 't3', 't4', 'a1', 'a2', 'a3', 'a4', 'zero'] as $id) {
        $state['users'][$id] = ['id' => $id, 'name' => $id === 'zero' ? 'Unassigned fictional colleague with a long name' : 'Fictional ' . $id, 'email' => $id . '@fixture.test', 'role' => $id === 'supervisor' ? 'supervisor' : 'staff', 'qualification' => str_starts_with($id, 't') ? 'technician' : 'assistant', 'active' => true, 'passwordHash' => 'not-a-real-fixture-password'];
        if ($id !== 'supervisor') foreach (Time::dates('2030-01-07') as $date) $state['availability'][$id][$date] = ['morning' => 'available', 'afternoon' => 'available'];
    }
    $supervisor = $state['users']['supervisor'];
    $roster = Domain::command($state, $supervisor, 'roster.create', ['week' => '2030-01-07']);
    if ($filled) {
        foreach ($state['slots'] as $slot) {
            $suffix = $slot['block'] === 'morning' ? ($slot['lab'] === 'lab-a' ? '1' : '2') : ($slot['lab'] === 'lab-a' ? '3' : '4');
            foreach (['t' . $suffix, 'a' . $suffix] as $staffId) Domain::command($state, $supervisor, 'roster.assign', ['rosterId' => $roster['id'], 'version' => $state['rosters'][$roster['id']]['version'], 'slotId' => $slot['id'], 'staffId' => $staffId]);
        }
        if ($published) Domain::command($state, $supervisor, 'roster.publish', ['rosterId' => $roster['id'], 'version' => $state['rosters'][$roster['id']]['version']]);
    }
    Store::validate($state);
    return $state;
}

function fixture_assignment(array $state, string $staff, string $date = '2030-01-07', string $block = 'morning'): array
{
    foreach ($state['assignments'] as $a) {
        $slot = $state['slots'][$a['slotId']];
        if ($a['staffId'] === $staff && $slot['date'] === $date && $slot['block'] === $block) return $a;
    }
    throw new RuntimeException('Fixture assignment missing.');
}

function fixture_swap(array &$state, bool $accepted = false): array
{
    $a = fixture_assignment($state, 't1');
    $b = fixture_assignment($state, 't3', '2030-01-07', 'afternoon');
    $swap = Domain::command($state, $state['users']['t1'], 'swap.create', ['assignmentId' => $a['id'], 'targetAssignmentId' => $b['id'], 'operationId' => 'fixture-operation-00001', 'note' => 'Private fictional note']);
    if ($accepted) $swap = Domain::command($state, $state['users']['t3'], 'swap.accept', ['id' => $swap['id'], 'version' => $swap['version']]);
    return $swap;
}
