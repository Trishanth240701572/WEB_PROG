<?php
declare(strict_types=1);

/** Explicit, fictional setup fixtures. This class is never called by a request. */
final class Demo
{
    public static function emails(): array
    {
        return array_map(fn(string $name): string => $name . '@shiftsync.test', ['ananya', 'arjun', 'divya', 'kabir', 'meera', 'rohan', 'isha', 'nikhil', 'priya', 'samir', 'tara', 'vivek', 'supervisor']);
    }

    public static function state(array $passwords, ?string $week = null): array
    {
        $week = Time::week($week);
        [$first] = Time::slotTimes($week, 'morning');
        if (!Time::future($first)) {
            throw new DomainError('The demo published week must be a complete future work week.', 422, 'past_week');
        }
        $state = ['schemaVersion' => 1, 'revision' => 1, 'counters' => [], 'users' => [], 'availability' => [], 'rosters' => [], 'slots' => [], 'assignments' => [], 'swaps' => [], 'notifications' => [], 'audit' => [], 'operations' => [], 'demo' => true];
        $names = ['Ananya Krishnamurthy', 'Arjun Menon', 'Divya Nair', 'Kabir Shah', 'Meera Srinivasan', 'Rohan Desai', 'Isha Rao', 'Nikhil Banerjee', 'Priya Venkataraman', 'Samir Kapoor', 'Tara Fernandes', 'Vivek Subramanian', 'Dr. Kavitha Raman'];
        $emails = self::emails();
        foreach ($names as $index => $name) {
            $id = $index === 12 ? 'supervisor-1' : 'staff-' . ($index + 1);
            if (!isset($passwords[$emails[$index]]) || !is_string($passwords[$emails[$index]])) {
                throw new DomainError('Setup must provide a generated 12–72 byte password for every demo account.', 422, 'demo_passwords');
            }
            $state['users'][$id] = ['id' => $id, 'name' => $name, 'email' => $emails[$index], 'passwordHash' => Passwords::hash($passwords[$emails[$index]]), 'credentialVersion' => 1, 'role' => $index === 12 ? 'supervisor' : 'staff', 'qualification' => $index < 6 ? 'technician' : 'assistant', 'active' => true];
        }
        $published = self::roster($state, $week, 'published', true);
        $draftWeek = Time::date($week)->modify('+7 days')->format('Y-m-d');
        $draft = self::roster($state, $draftWeek, 'draft', false);
        // The draft deliberately has both a missing-person and a missing-technician example.
        $draftSlots = self::slots($state, $draft);
        self::assign($state, $draftSlots[0]['id'], 'staff-7');
        self::assign($state, $draftSlots[0]['id'], 'staff-8');
        self::assign($state, $draftSlots[1]['id'], 'staff-1');
        self::assign($state, $draftSlots[2]['id'], 'staff-2');
        self::assign($state, $draftSlots[2]['id'], 'staff-9');

        $slots = self::slots($state, $published);
        // Unknown never counts as available. This free cell blocks a plausible candidate.
        $state['availability']['staff-1'][$slots[4]['date']][$slots[4]['block']] = 'unavailable';

        $supervisor = $state['users']['supervisor-1'];
        $assignments = array_values(array_filter($state['assignments'], fn(array $a): bool => $state['slots'][$a['slotId']]['rosterId'] === $published));
        $freePair = function () use (&$state, $assignments): array {
            foreach ($assignments as $assignment) {
                $actor = $state['users'][$assignment['staffId']];
                foreach (Domain::candidates($state, $actor, $assignment['id']) as $candidate) {
                    if ($candidate['eligible']) {
                        return [$actor, $assignment['id'], $candidate['assignmentId']];
                    }
                }
            }
            throw new RuntimeException('Demo could not find a feasible exchange.');
        };
        [$requester, $a, $b] = $freePair();
        Domain::command($state, $requester, 'swap.create', ['assignmentId' => $a, 'targetAssignmentId' => $b, 'note' => 'Fictional demo: please exchange these two support duties.', 'operationId' => 'demo-pending-colleague-0001']);
        [$requester, $a, $b] = $freePair();
        $accepted = Domain::command($state, $requester, 'swap.create', ['assignmentId' => $a, 'targetAssignmentId' => $b, 'note' => 'Fictional demo: agreed exchange ready for review.', 'operationId' => 'demo-pending-supervisor-0001']);
        Domain::command($state, $state['users'][$accepted['recipientId']], 'swap.accept', ['id' => $accepted['id'], 'version' => $accepted['version']]);
        [$requester, $a, $b] = $freePair();
        $rejected = Domain::command($state, $requester, 'swap.create', ['assignmentId' => $a, 'targetAssignmentId' => $b, 'note' => 'Fictional demo: a request with a retained decision.', 'operationId' => 'demo-rejected-00000001']);
        $rejected = Domain::command($state, $state['users'][$rejected['recipientId']], 'swap.accept', ['id' => $rejected['id'], 'version' => $rejected['version']]);
        Domain::command($state, $supervisor, 'swap.reject', ['id' => $rejected['id'], 'version' => $rejected['version'], 'reason' => 'Fictional example: planned lab induction requires the original allocation.']);
        [$requester, $a, $b] = $freePair();
        $approved = Domain::command($state, $requester, 'swap.create', ['assignmentId' => $a, 'targetAssignmentId' => $b, 'note' => 'Fictional demo: completed exchange with matching ownership and audit.', 'operationId' => 'demo-approved-00000001']);
        $approved = Domain::command($state, $state['users'][$approved['recipientId']], 'swap.accept', ['id' => $approved['id'], 'version' => $approved['version']]);
        Domain::command($state, $supervisor, 'swap.approve', ['id' => $approved['id'], 'version' => $approved['version']]);

        // A separate historical roster makes expiry truthful without a public clock override.
        $pastWeek = Time::now()->modify('monday this week')->modify('-14 days')->format('Y-m-d');
        $history = self::roster($state, $pastWeek, 'published', true);
        $pastAssignments = array_values(array_filter($state['assignments'], fn(array $a): bool => $state['slots'][$a['slotId']]['rosterId'] === $history && $state['users'][$a['staffId']]['qualification'] === 'technician'));
        $a = $pastAssignments[0];
        $b = $pastAssignments[2];
        $createdAt = Time::date($pastWeek)->modify('-3 days')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
        $expiredAt = $state['slots'][$a['slotId']]['startsAt'];
        $id = self::id($state, 'swap');
        $state['swaps'][$id] = ['id' => $id, 'rosterId' => $history, 'week' => $pastWeek, 'assignmentId' => $a['id'], 'targetAssignmentId' => $b['id'], 'requesterId' => $a['staffId'], 'recipientId' => $b['staffId'], 'assignmentVersion' => $a['version'], 'targetAssignmentVersion' => $b['version'], 'status' => 'expired', 'version' => 2, 'note' => 'Fictional historical request; it expired before a response.', 'createdAt' => $createdAt, 'updatedAt' => $expiredAt, 'timeline' => [['status' => 'awaiting_colleague', 'at' => $createdAt, 'actorId' => $a['staffId'], 'reason' => 'Historical fictional request.'], ['status' => 'expired', 'at' => $expiredAt, 'actorId' => null, 'reason' => 'The earlier duty started.']]];
        $state['audit'][] = ['id' => self::id($state, 'audit'), 'actorId' => 'supervisor-1', 'action' => 'demo.seeded', 'createdAt' => Time::iso(), 'details' => ['fictional' => true, 'publishedWeek' => $week, 'draftWeek' => $draftWeek]];
        Store::validate($state);
        return $state;
    }

    private static function id(array &$state, string $type): string
    {
        $state['counters'][$type] = ($state['counters'][$type] ?? 0) + 1;
        return $type . '-' . str_pad((string)$state['counters'][$type], 5, '0', STR_PAD_LEFT);
    }

    private static function slots(array $state, string $id): array
    {
        return array_values(array_filter($state['slots'], fn(array $slot): bool => $slot['rosterId'] === $id));
    }

    private static function assign(array &$state, string $slotId, string $staffId): void
    {
        $id = self::id($state, 'assignment');
        $state['assignments'][$id] = ['id' => $id, 'slotId' => $slotId, 'staffId' => $staffId, 'version' => 1];
    }

    private static function roster(array &$state, string $week, string $status, bool $complete): string
    {
        $id = self::id($state, 'roster');
        $state['rosters'][$id] = ['id' => $id, 'week' => $week, 'status' => $status, 'version' => 1, 'createdAt' => Time::iso()];
        if ($status === 'published') {
            $state['rosters'][$id]['publishedAt'] = Time::date($week)->modify('-3 days')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
        }
        $blockIndex = 0;
        foreach (Time::dates($week) as $date) {
            foreach (['morning', 'afternoon'] as $block) {
                foreach ($state['users'] as $user) {
                    if ($user['role'] === 'staff') {
                        $state['availability'][$user['id']][$date][$block] = 'available';
                    }
                }
                foreach (['lab-a', 'lab-b'] as $labIndex => $lab) {
                    [$startsAt, $endsAt] = Time::slotTimes($date, $block);
                    $slotId = self::id($state, 'slot');
                    $state['slots'][$slotId] = compact('slotId', 'date', 'block', 'lab', 'startsAt', 'endsAt');
                    unset($state['slots'][$slotId]['slotId']);
                    $state['slots'][$slotId] += ['id' => $slotId, 'rosterId' => $id, 'headcount' => 2, 'technicianMinimum' => 1];
                    if ($complete) {
                        self::assign($state, $slotId, 'staff-' . (($blockIndex * 2 + $labIndex) % 6 + 1));
                        self::assign($state, $slotId, 'staff-' . (($blockIndex * 2 + $labIndex) % 5 + 7));
                    }
                }
                $blockIndex++;
            }
        }
        return $id;
    }
}
