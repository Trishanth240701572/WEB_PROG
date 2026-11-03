<?php
declare(strict_types=1);

/** Business rules are shared by the JSON API and ordinary PHP form handlers. */
final class Domain
{
    private const ACTIVE = ['awaiting_colleague', 'awaiting_supervisor'];

    private static function actor(array $s, array $actor): array
    {
        $user = $s['users'][$actor['id'] ?? ''] ?? null;
        if (!$user || !$user['active']) {
            throw new DomainError('Please sign in again.', 401, 'unauthenticated');
        }
        return $user;
    }

    private static function supervisor(array $actor): void
    {
        if ($actor['role'] !== 'supervisor') {
            throw new DomainError('This action is available to the supervisor.', 403, 'forbidden');
        }
    }

    private static function staff(array $actor): void
    {
        if ($actor['role'] !== 'staff') {
            throw new DomainError('Only staff can manage availability and exchange duties.', 403, 'forbidden');
        }
    }

    private static function record(array $map, mixed $id, string $type): array
    {
        if (!is_string($id) || !isset($map[$id])) {
            throw new DomainError("The $type could not be found.", 404, 'not_found');
        }
        return $map[$id];
    }

    private static function version(array $record, mixed $version): void
    {
        if (!is_int($version) || $record['version'] !== $version) {
            throw new DomainError('This record changed. Refresh it before trying again.', 409, 'stale_version');
        }
    }

    private static function id(array &$s, string $type): string
    {
        $collections = ['roster' => 'rosters', 'slot' => 'slots', 'assignment' => 'assignments', 'swap' => 'swaps', 'notification' => 'notifications', 'audit' => 'audit'];
        $counter = $s['counters'][$type] ?? 0;
        foreach ($s[$collections[$type]] as $record) {
            if (preg_match('/^' . preg_quote($type, '/') . '-(\d+)$/D', $record['id'], $match)) {
                $counter = max($counter, (int)$match[1]);
            }
        }
        $s['counters'][$type] = $counter + 1;
        return $type . '-' . str_pad((string)$s['counters'][$type], 5, '0', STR_PAD_LEFT);
    }

    private static function profile(array $user, bool $own = false): array
    {
        $safe = array_intersect_key($user, array_flip(['id', 'name', 'role', 'qualification', 'active']));
        if ($own) {
            $safe['email'] = $user['email'];
        }
        return $safe;
    }

    private static function notify(array &$s, string $userId, string $title, string $message, ?string $swapId = null): void
    {
        $id = self::id($s, 'notification');
        $s['notifications'][$id] = ['id' => $id, 'userId' => $userId, 'title' => $title, 'message' => $message, 'swapId' => $swapId, 'createdAt' => Time::iso(), 'readAt' => null];
    }

    private static function notifySupervisors(array &$s, string $title, string $message, ?string $swapId = null): void
    {
        foreach ($s['users'] as $user) {
            if ($user['active'] && $user['role'] === 'supervisor') {
                self::notify($s, $user['id'], $title, $message, $swapId);
            }
        }
    }

    private static function audit(array &$s, array $actor, string $action, array $details): void
    {
        $s['audit'][] = ['id' => self::id($s, 'audit'), 'actorId' => $actor['id'], 'action' => $action, 'createdAt' => Time::iso(), 'details' => $details];
    }

    private static function rosterSlots(array $s, string $rosterId): array
    {
        return array_values(array_filter($s['slots'], fn(array $slot): bool => $slot['rosterId'] === $rosterId));
    }

    public static function coverage(array $s, array $slot): array
    {
        $people = [];
        foreach ($s['assignments'] as $assignment) {
            if ($assignment['slotId'] === $slot['id']) {
                $people[$assignment['staffId']] = $s['users'][$assignment['staffId']];
            }
        }
        $technicians = count(array_filter($people, fn(array $u): bool => $u['qualification'] === 'technician'));
        return ['slotId' => $slot['id'], 'date' => $slot['date'], 'block' => $slot['block'], 'lab' => $slot['lab'], 'headcount' => $slot['headcount'], 'assigned' => count($people), 'technicianMinimum' => $slot['technicianMinimum'], 'technicians' => $technicians, 'missingPeople' => max(0, $slot['headcount'] - count($people)), 'missingTechnicians' => max(0, $slot['technicianMinimum'] - $technicians)];
    }

    /** Excluding the exchanged assignment IDs is essential to a correct hypothetical check. */
    private static function assignmentReasons(array $s, string $staffId, array $slot, array $exclude = [], bool $checkHeadcount = true): array
    {
        $reasons = [];
        $user = $s['users'][$staffId] ?? null;
        if (!$user || !$user['active'] || $user['role'] !== 'staff') {
            $reasons[] = 'Only active staff can hold a duty.';
        }
        if (($s['availability'][$staffId][$slot['date']][$slot['block']] ?? 'not_submitted') !== 'available') {
            $reasons[] = 'Unavailable or availability not submitted for the proposed block.';
        }
        if (!Time::future($slot['startsAt'])) {
            $reasons[] = 'The duty has already started.';
        }
        $count = 0;
        foreach ($s['assignments'] as $assignment) {
            if (in_array($assignment['id'], $exclude, true)) {
                continue;
            }
            if ($assignment['slotId'] === $slot['id']) {
                $count++;
                if ($assignment['staffId'] === $staffId) {
                    $reasons[] = 'Already assigned to this duty block.';
                }
            }
            if ($assignment['staffId'] === $staffId && Time::overlap($slot, $s['slots'][$assignment['slotId']])) {
                $reasons[] = 'Overlaps another retained duty assignment.';
            }
        }
        if ($checkHeadcount && $count >= $slot['headcount']) {
            $reasons[] = 'This duty block already has its requested headcount.';
        }
        return array_values(array_unique($reasons));
    }

    private static function snapshot(array $s, array $assignment): array
    {
        $user = $s['users'][$assignment['staffId']];
        return ['assignmentId' => $assignment['id'], 'staffId' => $user['id'], 'name' => $user['name'], 'qualification' => $user['qualification'], 'slot' => $s['slots'][$assignment['slotId']]];
    }

    private static function weeklyHours(array $s, string $staffId, string $week): float
    {
        $hours = 0.0;
        foreach ($s['assignments'] as $assignment) {
            $slot = $s['slots'][$assignment['slotId']];
            $roster = $s['rosters'][$slot['rosterId']];
            if ($assignment['staffId'] === $staffId && $roster['week'] === $week && $roster['status'] === 'published') {
                $hours += Time::hours($slot);
            }
        }
        return $hours;
    }

    public static function derivedStatus(array $s, array $swap): string
    {
        if (!in_array($swap['status'], self::ACTIVE, true)) {
            return $swap['status'];
        }
        foreach (['assignmentId', 'targetAssignmentId'] as $field) {
            $assignment = $s['assignments'][$swap[$field]] ?? null;
            if (!$assignment || !Time::future($s['slots'][$assignment['slotId']]['startsAt'])) {
                return 'expired';
            }
        }
        return $swap['status'];
    }

    private static function reservations(array $s, array $assignmentIds, ?string $excludeSwap = null): bool
    {
        foreach ($s['swaps'] as $swap) {
            if ($swap['id'] !== $excludeSwap && in_array(self::derivedStatus($s, $swap), self::ACTIVE, true) && (in_array($swap['assignmentId'], $assignmentIds, true) || in_array($swap['targetAssignmentId'], $assignmentIds, true))) {
                return true;
            }
        }
        return false;
    }

    private static function evaluate(array $s, array $a, array $b, ?array $swap = null): array
    {
        $slotA = $s['slots'][$a['slotId']];
        $slotB = $s['slots'][$b['slotId']];
        $rosterA = $s['rosters'][$slotA['rosterId']];
        $rosterB = $s['rosters'][$slotB['rosterId']];
        $checks = [];
        $add = function (string $code, string $label, bool $passed, string $detail) use (&$checks): void {
            $checks[] = compact('code', 'label', 'passed', 'detail');
        };
        $add('published', 'Same published week', $rosterA['id'] === $rosterB['id'] && $rosterA['status'] === 'published' && $rosterB['status'] === 'published', 'Both duties must belong to the same published roster.');
        $add('different_people', 'Two different staff members', $a['staffId'] !== $b['staffId'] && $a['id'] !== $b['id'], 'Choose a colleague’s distinct assignment.');
        $add('different_blocks', 'Distinct, non-overlapping blocks', !Time::overlap($slotA, $slotB), 'An exchange must involve two different time blocks.');
        $add('future', 'Both duties start in the future', Time::future($slotA['startsAt']) && Time::future($slotB['startsAt']), 'One or both duties have already started.');
        $add('reservation', 'Assignments are free of another pending exchange', !self::reservations($s, [$a['id'], $b['id']], $swap['id'] ?? null), 'One assignment is reserved by another pending exchange.');
        if ($swap !== null) {
            $matches = $a['staffId'] === $swap['requesterId'] && $b['staffId'] === $swap['recipientId'] && $a['version'] === $swap['assignmentVersion'] && $b['version'] === $swap['targetAssignmentVersion'];
            $add('ownership', 'Original ownership and versions match', $matches, 'Assignment ownership or version changed after this request.');
        }
        $exclude = [$a['id'], $b['id']];
        $reasonsA = self::assignmentReasons($s, $a['staffId'], $slotB, $exclude);
        $reasonsB = self::assignmentReasons($s, $b['staffId'], $slotA, $exclude);
        $add('requester_eligible', 'Requester can cover the colleague’s duty', !$reasonsA, implode(' ', $reasonsA) ?: 'Availability, activity, capacity and conflicts checked.');
        $add('recipient_eligible', 'Colleague can cover the requester’s duty', !$reasonsB, implode(' ', $reasonsB) ?: 'Availability, activity, capacity and conflicts checked.');
        $after = $s;
        $after['assignments'][$a['id']]['staffId'] = $b['staffId'];
        $after['assignments'][$b['id']]['staffId'] = $a['staffId'];
        $coverageBefore = [self::coverage($s, $slotA), self::coverage($s, $slotB)];
        $coverageAfter = [self::coverage($after, $slotA), self::coverage($after, $slotB)];
        foreach ($coverageAfter as $i => $coverage) {
            $add('coverage_' . $i, 'Coverage retained in ' . strtoupper(str_replace('-', ' ', $coverage['lab'])) . ' ' . $coverage['date'] . ' ' . $coverage['block'], $coverage['missingPeople'] === 0 && $coverage['missingTechnicians'] === 0 && $coverage['assigned'] <= $coverage['headcount'], 'Requires ' . $coverage['headcount'] . ' people and ' . $coverage['technicianMinimum'] . ' technician(s); after: ' . $coverage['assigned'] . ' people, ' . $coverage['technicians'] . ' technician(s).');
        }
        $hours = [];
        foreach (array_unique([$a['staffId'], $b['staffId']]) as $staffId) {
            $hours[] = ['staffId' => $staffId, 'name' => $s['users'][$staffId]['name'], 'before' => self::weeklyHours($s, $staffId, $rosterA['week']), 'after' => self::weeklyHours($after, $staffId, $rosterA['week'])];
        }
        $eligible = !array_filter($checks, fn(array $c): bool => !$c['passed']);
        return ['swapId' => $swap['id'] ?? null, 'eligible' => $eligible, 'checks' => $checks, 'before' => [self::snapshot($s, $a), self::snapshot($s, $b)], 'after' => [self::snapshot($after, $after['assignments'][$a['id']]), self::snapshot($after, $after['assignments'][$b['id']])], 'coverage' => ['before' => $coverageBefore, 'after' => $coverageAfter], 'hours' => $hours, 'hoursNote' => 'Scheduled hours are unchanged for equal-duration blocks. An exchange does not increase filled places.'];
    }

    private static function authorizeSwap(array $actor, array $swap): void
    {
        if ($actor['role'] !== 'supervisor' && !in_array($actor['id'], [$swap['requesterId'], $swap['recipientId']], true)) {
            throw new DomainError('This request is private to its participants and supervisor.', 403, 'forbidden');
        }
    }

    public static function preview(array $s, array $actor, string $swapId): array
    {
        $actor = self::actor($s, $actor);
        $swap = self::record($s['swaps'], $swapId, 'request');
        self::authorizeSwap($actor, $swap);
        if ($swap['status'] === 'approved' && isset($swap['result']['preview'])) {
            return $swap['result']['preview'];
        }
        $preview = self::evaluate($s, $s['assignments'][$swap['assignmentId']], $s['assignments'][$swap['targetAssignmentId']], $swap);
        if (!in_array(self::derivedStatus($s, $swap), self::ACTIVE, true)) {
            $preview['eligible'] = false;
        }
        return $preview;
    }

    private static function swapDto(array $s, array $actor, array $swap): array
    {
        $dto = $swap;
        $dto['status'] = self::derivedStatus($s, $swap);
        $dto['requesterName'] = $s['users'][$swap['requesterId']]['name'];
        $dto['recipientName'] = $s['users'][$swap['recipientId']]['name'];
        $dto['preview'] = self::preview($s, $actor, $swap['id']);
        $dto['expiresAt'] = min($s['slots'][$s['assignments'][$swap['assignmentId']]['slotId']]['startsAt'], $s['slots'][$s['assignments'][$swap['targetAssignmentId']]['slotId']]['startsAt']);
        if ($dto['status'] === 'expired' && $swap['status'] !== 'expired') {
            $dto['timeline'][] = ['status' => 'expired', 'at' => $dto['expiresAt'], 'actorId' => null, 'reason' => 'The earlier duty has started.'];
        }
        return $dto;
    }

    public static function bootstrap(array $s, array $actor): array
    {
        $actor = self::actor($s, $actor);
        $rosters = array_filter($s['rosters'], fn(array $r): bool => $actor['role'] === 'supervisor' || $r['status'] === 'published');
        $slots = array_filter($s['slots'], fn(array $slot): bool => isset($rosters[$slot['rosterId']]));
        $assignments = array_filter($s['assignments'], fn(array $a): bool => isset($slots[$a['slotId']]));
        $swaps = array_filter($s['swaps'], fn(array $swap): bool => $actor['role'] === 'supervisor' || in_array($actor['id'], [$swap['requesterId'], $swap['recipientId']], true));
        return ['user' => self::profile($actor, true), 'users' => array_values(array_map(fn(array $user): array => self::profile($user), $s['users'])), 'rosters' => array_values($rosters), 'slots' => array_values($slots), 'assignments' => array_values($assignments), 'swaps' => array_values(array_map(fn(array $swap): array => self::swapDto($s, $actor, $swap), $swaps)), 'notifications' => array_values(array_filter($s['notifications'], fn(array $notice): bool => $notice['userId'] === $actor['id'])), 'audit' => $actor['role'] === 'supervisor' ? array_slice($s['audit'], -100) : [], 'availability' => $actor['role'] === 'supervisor' ? $s['availability'] : ($s['availability'][$actor['id']] ?? []), 'availabilityVersions' => $actor['role'] === 'supervisor' ? ($s['availabilityVersions'] ?? []) : ($s['availabilityVersions'][$actor['id']] ?? []), 'timezone' => Time::timezone(), 'revision' => $s['revision']];
    }

    /** Legacy snapshots project version zero; GETs never migrate or rewrite storage. */
    public static function availability(array $s, array $actor, string $week): array
    {
        $actor = self::actor($s, $actor);
        self::staff($actor);
        Time::week($week);
        $values = [];
        foreach (Time::dates($week) as $date) {
            foreach (['morning', 'afternoon'] as $block) {
                $values[$date][$block] = $s['availability'][$actor['id']][$date][$block] ?? 'not_submitted';
            }
        }
        return ['week' => $week, 'version' => $s['availabilityVersions'][$actor['id']][$week] ?? 0, 'values' => $values];
    }

    public static function candidates(array $s, array $actor, string $assignmentId): array
    {
        $actor = self::actor($s, $actor);
        self::staff($actor);
        $a = self::record($s['assignments'], $assignmentId, 'assignment');
        if ($a['staffId'] !== $actor['id']) {
            throw new DomainError('Choose one of your own assignments.', 403, 'forbidden');
        }
        $slot = $s['slots'][$a['slotId']];
        if ($s['rosters'][$slot['rosterId']]['status'] !== 'published') {
            throw new DomainError('Exchanges require published duties.', 409, 'not_published');
        }
        $eligible = [];
        $blocked = [];
        foreach ($s['assignments'] as $b) {
            $targetSlot = $s['slots'][$b['slotId']];
            if ($b['staffId'] === $actor['id'] || $targetSlot['rosterId'] !== $slot['rosterId']) {
                continue;
            }
            $preview = self::evaluate($s, $a, $b);
            $record = self::snapshot($s, $b) + ['eligible' => $preview['eligible'], 'reasons' => array_values(array_map(fn(array $c): string => $c['detail'], array_filter($preview['checks'], fn(array $c): bool => !$c['passed']))), 'checks' => $preview['checks'], 'preview' => $preview];
            if ($preview['eligible']) {
                $eligible[] = $record;
            } elseif (count($blocked) < 16) {
                $blocked[] = $record;
            }
        }
        return array_merge($eligible, $blocked);
    }

    public static function assignmentCandidates(array $s, array $actor, string $slotId): array
    {
        $actor = self::actor($s, $actor);
        self::supervisor($actor);
        $slot = self::record($s['slots'], $slotId, 'duty block');
        $records = [];
        foreach ($s['users'] as $user) {
            if ($user['role'] !== 'staff' || !$user['active']) {
                continue;
            }
            $reasons = self::assignmentReasons($s, $user['id'], $slot);
            if ($s['rosters'][$slot['rosterId']]['status'] !== 'draft') {
                $reasons[] = 'Published rosters can only change through approved exchanges.';
            }
            $records[] = self::profile($user) + ['staffId' => $user['id'], 'eligible' => !$reasons, 'reasons' => $reasons];
        }
        return $records;
    }

    private static function transition(array &$s, array $actor, string $id, string $status, string $reason = ''): array
    {
        $s['swaps'][$id]['status'] = $status;
        $s['swaps'][$id]['version']++;
        $s['swaps'][$id]['updatedAt'] = Time::iso();
        $s['swaps'][$id]['timeline'][] = ['status' => $status, 'at' => Time::iso(), 'actorId' => $actor['id'], 'reason' => $reason];
        if (in_array($status, ['approved', 'rejected'], true)) {
            $s['swaps'][$id]['decisionActorId'] = $actor['id'];
            $s['swaps'][$id]['decisionAt'] = Time::iso();
            $s['swaps'][$id]['decisionReason'] = $reason;
        }
        $swap = $s['swaps'][$id];
        foreach (array_unique([$swap['requesterId'], $swap['recipientId']]) as $staffId) {
            self::notify($s, $staffId, 'Exchange ' . str_replace('_', ' ', $status), $reason ?: 'The exchange request is now ' . str_replace('_', ' ', $status) . '.', $id);
        }
        self::audit($s, $actor, 'swap.' . $status, ['swapId' => $id, 'reason' => $reason]);
        return $swap;
    }

    /** Reads derive expiry; mutations persist actual terminal transitions and their notices. */
    private static function settle(array &$s, array $actor, bool $checkEligibility = false): void
    {
        foreach (array_keys($s['swaps']) as $id) {
            $swap = $s['swaps'][$id];
            if (!in_array($swap['status'], self::ACTIVE, true)) {
                continue;
            }
            if (self::derivedStatus($s, $swap) === 'expired') {
                self::transition($s, $actor, $id, 'expired', 'The earlier duty has started.');
            } elseif ($checkEligibility) {
                $preview = self::evaluate($s, $s['assignments'][$swap['assignmentId']], $s['assignments'][$swap['targetAssignmentId']], $swap);
                if (!$preview['eligible']) {
                    $reason = implode(' ', array_column(array_filter($preview['checks'], fn(array $c): bool => !$c['passed']), 'detail'));
                    self::transition($s, $actor, $id, 'invalidated', $reason);
                }
            }
        }
    }

    public static function command(array &$s, array $actor, string $action, array $p): mixed
    {
        $actor = self::actor($s, $actor);
        if (str_starts_with($action, 'roster.')) {
            return self::rosterCommand($s, $actor, $action, $p);
        }
        if ($action === 'availability.save') {
            return self::saveAvailability($s, $actor, $p);
        }
        if (str_starts_with($action, 'swap.')) {
            return self::swapCommand($s, $actor, $action, $p);
        }
        if ($action === 'notification.read') {
            $all = ($p['all'] ?? false) === true;
            if (!$all) {
                $notice = self::record($s['notifications'], $p['id'] ?? null, 'notification');
                if ($notice['userId'] !== $actor['id']) {
                    throw new DomainError('You can mark only your own notifications.', 403, 'forbidden');
                }
            }
            foreach ($s['notifications'] as $id => $notice) {
                if ($notice['userId'] === $actor['id'] && ($all || $id === $p['id']) && !$notice['readAt']) {
                    $s['notifications'][$id]['readAt'] = Time::iso();
                }
            }
            return ['read' => true];
        }
        throw new DomainError('Unknown action.', 404, 'not_found');
    }

    private static function rosterCommand(array &$s, array $actor, string $action, array $p): array
    {
        self::supervisor($actor);
        if ($action === 'roster.create') {
            $week = Time::week(is_string($p['week'] ?? null) ? $p['week'] : '');
            foreach ($s['rosters'] as $roster) {
                if ($roster['week'] === $week) {
                    throw new DomainError('A roster already exists for that week.', 409, 'duplicate_roster');
                }
            }
            [$firstStart] = Time::slotTimes($week, 'morning');
            if (!Time::future($firstStart)) {
                throw new DomainError('New roster weeks must be entirely in the future.', 422, 'past_week');
            }
            $id = self::id($s, 'roster');
            $s['rosters'][$id] = ['id' => $id, 'week' => $week, 'status' => 'draft', 'version' => 1, 'createdAt' => Time::iso()];
            foreach (Time::dates($week) as $date) {
                foreach (['morning', 'afternoon'] as $block) {
                    [$start, $end] = Time::slotTimes($date, $block);
                    foreach (['lab-a', 'lab-b'] as $lab) {
                        $slotId = self::id($s, 'slot');
                        $s['slots'][$slotId] = ['id' => $slotId, 'rosterId' => $id, 'lab' => $lab, 'date' => $date, 'block' => $block, 'startsAt' => $start, 'endsAt' => $end, 'headcount' => 2, 'technicianMinimum' => 1];
                    }
                }
            }
            self::audit($s, $actor, 'roster.created', ['rosterId' => $id, 'week' => $week]);
            return $s['rosters'][$id];
        }
        $roster = self::record($s['rosters'], $p['rosterId'] ?? null, 'roster');
        self::version($roster, $p['version'] ?? null);
        if ($roster['status'] !== 'draft') {
            throw new DomainError('Published rosters can only change through approved exchanges.', 409, 'roster_published');
        }
        $id = $roster['id'];
        if ($action === 'roster.assign' || $action === 'roster.requirements') {
            $slot = self::record($s['slots'], $p['slotId'] ?? null, 'duty block');
            if ($slot['rosterId'] !== $id) {
                throw new DomainError('The duty block belongs to another roster.', 422, 'invalid_slot');
            }
            if (!Time::future($slot['startsAt'])) {
                throw new DomainError('Started duty blocks cannot be edited.', 409, 'duty_started');
            }
            if ($action === 'roster.assign') {
                $staff = self::record($s['users'], $p['staffId'] ?? null, 'staff member');
                $reasons = self::assignmentReasons($s, $staff['id'], $slot);
                if ($reasons) {
                    throw new DomainError(implode(' ', $reasons), 422, 'assignment_ineligible', ['staffId' => implode(' ', $reasons)]);
                }
                $assignmentId = self::id($s, 'assignment');
                $s['assignments'][$assignmentId] = ['id' => $assignmentId, 'slotId' => $slot['id'], 'staffId' => $staff['id'], 'version' => 1];
            } else {
                $headcount = $p['headcount'] ?? null;
                $minimum = $p['technicianMinimum'] ?? null;
                if (!is_int($headcount) || $headcount < 1 || $headcount > 12 || !is_int($minimum) || $minimum < 0 || $minimum > $headcount) {
                    throw new DomainError('Use 1–12 people and a technician minimum between zero and headcount.', 422, 'invalid_requirements');
                }
                if (self::coverage($s, $slot)['assigned'] > $headcount) {
                    throw new DomainError('Remove excess assignments before reducing headcount.', 409, 'over_capacity');
                }
                $s['slots'][$slot['id']]['headcount'] = $headcount;
                $s['slots'][$slot['id']]['technicianMinimum'] = $minimum;
            }
        } elseif ($action === 'roster.remove') {
            $assignment = self::record($s['assignments'], $p['assignmentId'] ?? null, 'assignment');
            $slot = $s['slots'][$assignment['slotId']];
            if ($slot['rosterId'] !== $id || !Time::future($slot['startsAt'])) {
                throw new DomainError('Only future assignments in this draft can be removed.', 409, 'invalid_assignment');
            }
            unset($s['assignments'][$assignment['id']]);
        } elseif ($action === 'roster.publish') {
            $slots = self::rosterSlots($s, $id);
            if (count($slots) !== 20) {
                throw new DomainError('The roster must contain all 20 weekday duty blocks.', 422, 'incomplete_roster');
            }
            $issues = [];
            foreach ($slots as $slot) {
                $coverage = self::coverage($s, $slot);
                if ($coverage['missingPeople'] || $coverage['missingTechnicians'] || $coverage['assigned'] > $coverage['headcount'] || !Time::future($slot['startsAt'])) {
                    $issues[] = $slot['id'];
                }
                foreach ($s['assignments'] as $assignment) {
                    if ($assignment['slotId'] === $slot['id'] && self::assignmentReasons($s, $assignment['staffId'], $slot, [$assignment['id']], false)) {
                        $issues[] = $slot['id'];
                    }
                }
            }
            if ($issues) {
                throw new DomainError('Complete staffing, technician coverage and eligibility before publishing.', 422, 'coverage_incomplete', ['slots' => array_values(array_unique($issues))]);
            }
            $s['rosters'][$id]['status'] = 'published';
            $s['rosters'][$id]['publishedAt'] = Time::iso();
            $staffIds = [];
            foreach ($s['assignments'] as $assignment) {
                if ($s['slots'][$assignment['slotId']]['rosterId'] === $id) {
                    $staffIds[$assignment['staffId']] = true;
                }
            }
            foreach (array_keys($staffIds) as $staffId) {
                self::notify($s, $staffId, 'Roster published', 'Your scheduled duties for the week of ' . $roster['week'] . ' are available.');
            }
        } else {
            throw new DomainError('Unknown roster action.', 404, 'not_found');
        }
        $s['rosters'][$id]['version']++;
        self::settle($s, $actor);
        self::audit($s, $actor, $action, ['rosterId' => $id, 'slotId' => $p['slotId'] ?? null, 'assignmentId' => $p['assignmentId'] ?? ($assignmentId ?? null)]);
        return $s['rosters'][$id];
    }

    private static function saveAvailability(array &$s, array $actor, array $p): array
    {
        self::staff($actor);
        if (isset($p['staffId']) && $p['staffId'] !== $actor['id']) {
            throw new DomainError('You can edit only your own availability.', 403, 'forbidden');
        }
        $week = Time::week(is_string($p['week'] ?? null) ? $p['week'] : '');
        $version = $p['version'] ?? null;
        if (!is_int($version) || $version < 0) {
            throw new DomainError('Reload the saved week before saving: an availability version is required.', 422, 'version_required', ['version' => 'Load this week and submit its version.']);
        }
        $currentVersion = $s['availabilityVersions'][$actor['id']][$week] ?? 0;
        if ($version !== $currentVersion) {
            throw new DomainError('Your availability changed in another tab. Your choices were not saved. Reload the saved week before editing again.', 409, 'stale_version', ['version' => 'This form is based on an older saved week.']);
        }
        $values = $p['values'] ?? null;
        if (!is_array($values) || count($values) > 5) {
            throw new DomainError('Submit at most five weekdays of availability.', 422, 'invalid_availability');
        }
        $dates = Time::dates($week);
        $changes = [];
        foreach ($values as $date => $blocks) {
            if (!in_array($date, $dates, true) || !is_array($blocks) || count($blocks) > 2) {
                throw new DomainError('Availability must use dates in the selected work week.', 422, 'invalid_availability');
            }
            foreach ($blocks as $block => $value) {
                if (!in_array($block, ['morning', 'afternoon'], true) || !in_array($value, ['available', 'unavailable', 'not_submitted'], true)) {
                    throw new DomainError('Choose an allowed availability state and block.', 422, 'invalid_availability');
                }
                $old = $s['availability'][$actor['id']][$date][$block] ?? 'not_submitted';
                if ($old === $value) {
                    continue;
                }
                [$start] = Time::slotTimes($date, $block);
                if (!Time::future($start)) {
                    throw new DomainError('Availability cannot change after a block has started.', 409, 'duty_started', ['date' => $date, 'block' => $block]);
                }
                if ($value !== 'available') {
                    foreach ($s['assignments'] as $assignment) {
                        $slot = $s['slots'][$assignment['slotId']];
                        if ($assignment['staffId'] === $actor['id'] && $slot['date'] === $date && $slot['block'] === $block) {
                            throw new DomainError('You already hold ' . strtoupper(str_replace('-', ' ', $slot['lab'])) . ' on ' . $date . ' (' . $block . '). Request an exchange or contact the supervisor.', 409, 'assigned_availability', ['assignmentId' => $assignment['id'], 'date' => $date, 'block' => $block, 'lab' => $slot['lab']]);
                        }
                    }
                }
                $changes[] = [$date, $block, $value];
            }
        }
        foreach ($changes as [$date, $block, $value]) {
            $s['availability'][$actor['id']][$date][$block] = $value;
        }
        $s['availabilityVersions'][$actor['id']][$week] = $currentVersion + 1;
        self::settle($s, $actor, true);
        if ($changes) {
            self::audit($s, $actor, 'availability.saved', ['staffId' => $actor['id'], 'week' => $week, 'cells' => count($changes)]);
        }
        return ['week' => $week, 'version' => $currentVersion + 1, 'values' => array_intersect_key($s['availability'][$actor['id']] ?? [], array_flip($dates)), 'saved' => count($changes)];
    }

    private static function swapCommand(array &$s, array $actor, string $action, array $p): array
    {
        if ($action === 'swap.create') {
            self::staff($actor);
            $operationId = $p['operationId'] ?? '';
            if (!is_string($operationId) || !preg_match('/^[A-Za-z0-9_-]{16,100}$/D', $operationId)) {
                throw new DomainError('A valid operation ID is required for safe retries.', 422, 'invalid_operation_id');
            }
            $note = $p['note'] ?? '';
            if (!is_string($note) || strlen($note) > 1000) {
                throw new DomainError('Keep the private note within 1,000 characters.', 422, 'invalid_note');
            }
            $payloadHash = hash('sha256', json_encode([$p['assignmentId'] ?? null, $p['targetAssignmentId'] ?? null, trim($note)], JSON_THROW_ON_ERROR));
            $operationKey = $actor['id'] . ':' . $operationId;
            if (isset($s['operations'][$operationKey])) {
                $operation = $s['operations'][$operationKey];
                if (!hash_equals($operation['hash'], $payloadHash)) {
                    throw new DomainError('This operation ID was already used for different details.', 409, 'operation_conflict');
                }
                return self::swapDto($s, $actor, $s['swaps'][$operation['swapId']]);
            }
            $a = self::record($s['assignments'], $p['assignmentId'] ?? null, 'assignment');
            $b = self::record($s['assignments'], $p['targetAssignmentId'] ?? null, 'colleague assignment');
            if ($a['staffId'] !== $actor['id']) {
                throw new DomainError('Create an exchange only from your own duty.', 403, 'forbidden');
            }
            $preview = self::evaluate($s, $a, $b);
            if (!$preview['eligible']) {
                throw new DomainError(implode(' ', array_column(array_filter($preview['checks'], fn(array $c): bool => !$c['passed']), 'detail')), 409, 'swap_ineligible');
            }
            self::settle($s, $actor);
            $id = self::id($s, 'swap');
            $slot = $s['slots'][$a['slotId']];
            $s['swaps'][$id] = ['id' => $id, 'rosterId' => $slot['rosterId'], 'week' => $s['rosters'][$slot['rosterId']]['week'], 'assignmentId' => $a['id'], 'targetAssignmentId' => $b['id'], 'requesterId' => $a['staffId'], 'recipientId' => $b['staffId'], 'assignmentVersion' => $a['version'], 'targetAssignmentVersion' => $b['version'], 'status' => 'awaiting_colleague', 'version' => 1, 'note' => trim($note), 'createdAt' => Time::iso(), 'updatedAt' => Time::iso(), 'timeline' => [['status' => 'awaiting_colleague', 'at' => Time::iso(), 'actorId' => $actor['id'], 'reason' => 'Request submitted; assignments remain unchanged.']]];
            $s['operations'][$operationKey] = ['hash' => $payloadHash, 'swapId' => $id, 'createdAt' => Time::iso()];
            if (count($s['operations']) > 2000) {
                $s['operations'] = array_slice($s['operations'], -2000, null, true);
            }
            self::notify($s, $b['staffId'], 'New exchange request', $actor['name'] . ' has requested a two-way duty exchange.', $id);
            self::audit($s, $actor, 'swap.created', ['swapId' => $id]);
            return self::swapDto($s, $actor, $s['swaps'][$id]);
        }
        $swap = self::record($s['swaps'], $p['id'] ?? null, 'exchange request');
        self::authorizeSwap($actor, $swap);
        $id = $swap['id'];
        if ($action === 'swap.approve' || $action === 'swap.reject') {
            self::supervisor($actor);
        } elseif ($action === 'swap.accept' || $action === 'swap.decline') {
            if ($actor['role'] !== 'staff' || $actor['id'] !== $swap['recipientId']) {
                throw new DomainError('Only the addressed colleague can respond.', 403, 'forbidden');
            }
        } elseif ($action === 'swap.withdraw') {
            if ($actor['role'] !== 'staff' || $actor['id'] !== $swap['requesterId']) {
                throw new DomainError('Only the requester can withdraw this exchange.', 403, 'forbidden');
            }
        } else {
            throw new DomainError('Unknown exchange action.', 404, 'not_found');
        }
        // An acknowledged approval is an idempotent result even with its original version.
        if ($action === 'swap.approve' && $swap['status'] === 'approved') {
            return self::swapDto($s, $actor, $swap);
        }
        self::version($swap, $p['version'] ?? null);
        if (!in_array($swap['status'], self::ACTIVE, true)) {
            throw new DomainError('This exchange is already ' . str_replace('_', ' ', $swap['status']) . '.', 409, 'terminal_request');
        }
        if (self::derivedStatus($s, $swap) === 'expired') {
            self::transition($s, $actor, $id, 'expired', 'The earlier duty has started.');
            return self::swapDto($s, $actor, $s['swaps'][$id]) + ['transitioned' => true, 'message' => 'The request expired; no duties changed.'];
        }
        if (in_array($action, ['swap.approve', 'swap.reject'], true) && $swap['status'] !== 'awaiting_supervisor') {
            throw new DomainError('The colleague must accept before a supervisor decision.', 409, 'invalid_transition');
        }
        if (in_array($action, ['swap.accept', 'swap.decline'], true) && $swap['status'] !== 'awaiting_colleague') {
            throw new DomainError('The colleague has already responded.', 409, 'invalid_transition');
        }
        if ($action === 'swap.accept' || $action === 'swap.approve') {
            $a = $s['assignments'][$swap['assignmentId']];
            $b = $s['assignments'][$swap['targetAssignmentId']];
            $preview = self::evaluate($s, $a, $b, $swap);
            if (!$preview['eligible']) {
                $reason = implode(' ', array_column(array_filter($preview['checks'], fn(array $c): bool => !$c['passed']), 'detail'));
                self::transition($s, $actor, $id, 'invalidated', $reason);
                return self::swapDto($s, $actor, $s['swaps'][$id]) + ['transitioned' => true, 'message' => 'Eligibility changed; the request was invalidated without changing duties.'];
            }
            if ($action === 'swap.accept') {
                self::transition($s, $actor, $id, 'awaiting_supervisor', 'Colleague accepted; assignments remain unchanged until supervisor approval.');
                self::notifySupervisors($s, 'Exchange ready for review', 'Both colleagues agreed. Review eligibility and coverage before approving.', $id);
            } else {
                // Both ownership changes and all side effects commit as one Store transaction.
                $s['assignments'][$a['id']]['staffId'] = $b['staffId'];
                $s['assignments'][$b['id']]['staffId'] = $a['staffId'];
                $s['assignments'][$a['id']]['version']++;
                $s['assignments'][$b['id']]['version']++;
                $s['rosters'][$swap['rosterId']]['version']++;
                $s['swaps'][$id]['result'] = ['preview' => $preview, 'approvedAt' => Time::iso()];
                self::transition($s, $actor, $id, 'approved', 'The supervisor approved and both assignment owners were exchanged atomically.');
                self::audit($s, $actor, 'assignments.exchanged', ['swapId' => $id, 'rosterId' => $swap['rosterId'], 'before' => $preview['before'], 'after' => $preview['after']]);
                self::settle($s, $actor, true);
            }
        } elseif ($action === 'swap.reject') {
            $reason = $p['reason'] ?? '';
            if (!is_string($reason) || strlen(trim($reason)) < 3 || strlen($reason) > 500) {
                throw new DomainError('Provide a rejection reason between 3 and 500 characters.', 422, 'reason_required', ['reason' => 'Explain the decision briefly.']);
            }
            self::transition($s, $actor, $id, 'rejected', trim($reason));
        } elseif ($action === 'swap.decline') {
            self::transition($s, $actor, $id, 'declined', 'The colleague declined. Assignments were not changed.');
        } else {
            self::transition($s, $actor, $id, 'withdrawn', 'The requester withdrew. Assignments were not changed.');
        }
        self::settle($s, $actor);
        return self::swapDto($s, $actor, $s['swaps'][$id]);
    }

    public static function report(array $s, array $actor, string $week, string $lab = 'all', string $status = 'all', string $staffId = 'all'): array
    {
        $actor = self::actor($s, $actor);
        Time::week($week);
        if (!in_array($lab, ['all', 'lab-a', 'lab-b'], true)) {
            throw new DomainError('Choose a valid lab.', 422, 'invalid_lab');
        }
        if (!in_array($status, ['all', 'awaiting_colleague', 'awaiting_supervisor', 'approved', 'declined', 'rejected', 'withdrawn', 'expired', 'invalidated'], true)) {
            throw new DomainError('Choose a valid exchange state.', 422, 'invalid_status');
        }
        if ($staffId !== 'all') {
            if ($actor['role'] !== 'supervisor' && $staffId !== $actor['id']) {
                throw new DomainError('You can filter only your own exchange history.', 403, 'forbidden');
            }
            if (!isset($s['users'][$staffId]) || $s['users'][$staffId]['role'] !== 'staff') {
                throw new DomainError('Choose a valid staff member.', 422, 'invalid_staff');
            }
        }
        $rosters = array_filter($s['rosters'], fn(array $r): bool => $r['week'] === $week && $r['status'] === 'published');
        $slots = array_filter($s['slots'], fn(array $slot): bool => isset($rosters[$slot['rosterId']]) && ($lab === 'all' || $slot['lab'] === $lab));
        $workload = [];
        foreach ($s['users'] as $user) {
            if ($user['role'] === 'staff' && $user['active'] && ($actor['role'] === 'supervisor' || $user['id'] === $actor['id'])) {
                $workload[$user['id']] = ['staffId' => $user['id'], 'name' => $user['name'], 'qualification' => $user['qualification'], 'duties' => 0, 'hours' => 0.0];
            }
        }
        foreach ($s['assignments'] as $assignment) {
            if (isset($slots[$assignment['slotId']], $workload[$assignment['staffId']])) {
                $workload[$assignment['staffId']]['duties']++;
                $workload[$assignment['staffId']]['hours'] += Time::hours($slots[$assignment['slotId']]);
            }
        }
        $coverage = $actor['role'] === 'supervisor' ? array_values(array_map(fn(array $slot): array => self::coverage($s, $slot), $slots)) : [];
        $swaps = [];
        foreach ($s['swaps'] as $swap) {
            if (($swap['week'] ?? '') !== $week || ($actor['role'] !== 'supervisor' && !in_array($actor['id'], [$swap['requesterId'], $swap['recipientId']], true))) {
                continue;
            }
            $derivedStatus = self::derivedStatus($s, $swap);
            if (($status !== 'all' && $derivedStatus !== $status) || ($staffId !== 'all' && !in_array($staffId, [$swap['requesterId'], $swap['recipientId']], true))) {
                continue;
            }
            $aSlot = $s['slots'][$s['assignments'][$swap['assignmentId']]['slotId']];
            $bSlot = $s['slots'][$s['assignments'][$swap['targetAssignmentId']]['slotId']];
            if ($lab !== 'all' && $aSlot['lab'] !== $lab && $bSlot['lab'] !== $lab) {
                continue;
            }
            $swaps[] = ['id' => $swap['id'], 'week' => $week, 'status' => $derivedStatus, 'requesterId' => $swap['requesterId'], 'recipientId' => $swap['recipientId'], 'requesterName' => $s['users'][$swap['requesterId']]['name'], 'recipientName' => $s['users'][$swap['recipientId']]['name'], 'createdAt' => $swap['createdAt'], 'updatedAt' => $swap['updatedAt'] ?? $swap['createdAt']];
        }
        $totals = ['hours' => array_sum(array_column($workload, 'hours')), 'duties' => array_sum(array_column($workload, 'duties')), 'required' => array_sum(array_column($coverage, 'headcount')), 'assigned' => array_sum(array_column($coverage, 'assigned')), 'missingPeople' => array_sum(array_column($coverage, 'missingPeople')), 'missingTechnicians' => array_sum(array_column($coverage, 'missingTechnicians'))];
        return ['week' => $week, 'lab' => $lab, 'status' => $status, 'staffId' => $staffId, 'filters' => ['status' => $status, 'staffId' => $staffId], 'scope' => 'published', 'measure' => 'Scheduled hours, not verified worked hours', 'workload' => array_values($workload), 'coverage' => $coverage, 'swaps' => $swaps, 'totals' => $totals];
    }
}
