<?php
declare(strict_types=1);

/** One cooperative lock protects the replaceable, private JSON snapshot. */
class Store
{
    private string $lockPath;

    public function __construct(private string $path, private float $lockTimeout = 2.0)
    {
        $directory = realpath(dirname($path));
        if ($directory !== false) {
            $this->path = $directory . DIRECTORY_SEPARATOR . basename($path);
        }
        $this->lockPath = dirname($path) . DIRECTORY_SEPARATOR . 'state.lock';
    }

    public function read(): array
    {
        return $this->locked(LOCK_SH, fn(): array => $this->load());
    }

    public function transaction(callable $fn): mixed
    {
        return $this->locked(LOCK_EX, function () use ($fn): mixed {
            $state = $this->load();
            $before = $state;
            $result = $fn($state);
            if ($state !== $before) {
                $state['revision'] = $before['revision'] + 1;
                self::validate($state);
                $this->save($state);
            }
            return $result;
        });
    }

    public function init(array $state, bool $reset = false): void
    {
        $this->locked(LOCK_EX, function () use ($state, $reset): void {
            if (file_exists($this->path) && !$reset) {
                throw new DomainError('Storage already exists. Use the deliberate reset option to replace it.', 409, 'already_initialized');
            }
            self::validate($state);
            $this->save($state);
        });
    }

    private function locked(int $type, callable $fn): mixed
    {
        if (!is_dir(dirname($this->path))) {
            throw new DomainError('Private storage directory is missing.', 503, 'storage_unavailable');
        }
        $handle = @fopen($this->lockPath, 'c+b');
        if ($handle === false) {
            throw new DomainError('Private storage cannot be locked.', 503, 'storage_unavailable');
        }
        $acquired = false;
        try {
            $deadline = microtime(true) + max(0.01, min(10.0, $this->lockTimeout));
            do {
                if (@flock($handle, $type | LOCK_NB)) {
                    $acquired = true;
                    return $fn();
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            throw new DomainError('Storage is busy. Please try again shortly.', 503, 'storage_busy');
        } finally {
            if ($acquired) {
                flock($handle, LOCK_UN);
            }
            fclose($handle);
        }
    }

    private function load(): array
    {
        $json = @file_get_contents($this->path);
        if ($json === false) {
            throw new DomainError('Private state is missing or unreadable. Run setup or restore a verified backup.', 503, 'storage_unavailable');
        }
        try {
            $state = json_decode($json, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new DomainError('Private state is malformed. Restore a verified backup; no data was replaced.', 503, 'storage_malformed');
        }
        if (!is_array($state)) {
            throw new DomainError('Private state is malformed.', 503, 'storage_malformed');
        }
        self::validate($state);
        return $state;
    }

    public static function validate(array $state): void
    {
        $bad = fn(): never => throw new DomainError('Private state failed its integrity checks. No data was replaced.', 503, 'storage_malformed');
        if (($state['schemaVersion'] ?? null) !== 1 || !is_int($state['revision'] ?? null) || $state['revision'] < 0) {
            $bad();
        }
        foreach (['users', 'availability', 'rosters', 'slots', 'assignments', 'swaps', 'notifications', 'audit'] as $key) {
            if (!isset($state[$key]) || !is_array($state[$key])) {
                $bad();
            }
        }
        foreach (['counters', 'operations', 'availabilityVersions'] as $optional) {
            if (isset($state[$optional]) && !is_array($state[$optional])) {
                $bad();
            }
        }
        foreach ($state['counters'] ?? [] as $name => $value) {
            if (!is_string($name) || !is_int($value) || $value < 0) {
                $bad();
            }
        }
        $emails = [];
        foreach ($state['users'] as $id => $user) {
            if (!is_array($user) || ($user['id'] ?? '') !== (string)$id || !in_array($user['role'] ?? '', ['staff', 'supervisor'], true) || !in_array($user['qualification'] ?? '', ['technician', 'assistant'], true) || !is_bool($user['active'] ?? null) || !is_string($user['passwordHash'] ?? null) || $user['passwordHash'] === '' || !is_string($user['name'] ?? null) || trim($user['name']) === '' || strlen($user['name']) > 120 || !is_string($user['email'] ?? null) || strlen($user['email']) > 180 || !filter_var($user['email'], FILTER_VALIDATE_EMAIL)) {
                $bad();
            }
            $email = strtolower($user['email']);
            if (isset($emails[$email])) {
                $bad();
            }
            $emails[$email] = true;
            if (isset($user['credentialVersion']) && (!is_int($user['credentialVersion']) || $user['credentialVersion'] < 0)) {
                $bad();
            }
        }
        $validDate = static function (mixed $value): bool {
            if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
                return false;
            }
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            return $date !== false && $date->format('Y-m-d') === $value;
        };
        foreach ($state['availabilityVersions'] ?? [] as $userId => $versions) {
            if (!isset($state['users'][$userId]) || $state['users'][$userId]['role'] !== 'staff' || !is_array($versions)) {
                $bad();
            }
            foreach ($versions as $week => $version) {
                if (!$validDate($week) || (new DateTimeImmutable($week))->format('N') !== '1' || !is_int($version) || $version < 0) {
                    $bad();
                }
            }
        }
        foreach ($state['availability'] as $userId => $days) {
            if (!isset($state['users'][$userId]) || $state['users'][$userId]['role'] !== 'staff' || !is_array($days)) {
                $bad();
            }
            foreach ($days as $date => $blocks) {
                if (!$validDate($date) || !is_array($blocks)) {
                    $bad();
                }
                foreach ($blocks as $block => $value) {
                    if (!in_array($block, ['morning', 'afternoon'], true) || !in_array($value, ['available', 'unavailable', 'not_submitted'], true)) {
                        $bad();
                    }
                }
            }
        }
        $weeks = [];
        foreach ($state['rosters'] as $id => $roster) {
            if (!is_array($roster) || ($roster['id'] ?? '') !== (string)$id || !in_array($roster['status'] ?? '', ['draft', 'published'], true) || !is_int($roster['version'] ?? null) || $roster['version'] < 1 || !$validDate($roster['week'] ?? null) || (new DateTimeImmutable($roster['week']))->format('N') !== '1' || isset($weeks[$roster['week']])) {
                $bad();
            }
            $weeks[$roster['week']] = true;
        }
        $slotKeys = [];
        $rosterSlotCounts = array_fill_keys(array_keys($state['rosters']), 0);
        foreach ($state['slots'] as $id => $slot) {
            if (!is_array($slot) || ($slot['id'] ?? '') !== (string)$id || !isset($state['rosters'][$slot['rosterId'] ?? '']) || !in_array($slot['lab'] ?? '', ['lab-a', 'lab-b'], true) || !in_array($slot['block'] ?? '', ['morning', 'afternoon'], true) || !$validDate($slot['date'] ?? null) || !is_int($slot['headcount'] ?? null) || !is_int($slot['technicianMinimum'] ?? null) || $slot['headcount'] < 1 || $slot['technicianMinimum'] < 0 || $slot['technicianMinimum'] > $slot['headcount'] || !is_string($slot['startsAt'] ?? null) || !is_string($slot['endsAt'] ?? null) || strtotime($slot['startsAt']) === false || strtotime($slot['endsAt']) <= strtotime($slot['startsAt'])) {
                $bad();
            }
            $week = new DateTimeImmutable($state['rosters'][$slot['rosterId']]['week']);
            $date = new DateTimeImmutable($slot['date']);
            if ($date < $week || $date > $week->modify('+4 days')) {
                $bad();
            }
            try {
                [$canonicalStart, $canonicalEnd] = Time::slotTimes($slot['date'], $slot['block']);
            } catch (Throwable $error) {
                $bad();
            }
            if ($slot['startsAt'] !== $canonicalStart || $slot['endsAt'] !== $canonicalEnd) {
                $bad();
            }
            $key = $slot['rosterId'] . ':' . $slot['date'] . ':' . $slot['block'] . ':' . $slot['lab'];
            if (isset($slotKeys[$key])) {
                $bad();
            }
            $slotKeys[$key] = true;
            $rosterSlotCounts[$slot['rosterId']]++;
        }
        // Canonical, unique keys plus 20 slots guarantee every weekday/lab/block exists.
        foreach ($rosterSlotCounts as $count) {
            if ($count !== 20) {
                $bad();
            }
        }
        $unique = [];
        $staffSlots = [];
        $slotCounts = [];
        $slotTechnicians = [];
        foreach ($state['assignments'] as $id => $assignment) {
            if (!is_array($assignment) || ($assignment['id'] ?? '') !== (string)$id || !isset($state['slots'][$assignment['slotId'] ?? ''], $state['users'][$assignment['staffId'] ?? '']) || !is_int($assignment['version'] ?? null) || $assignment['version'] < 1 || $state['users'][$assignment['staffId']]['role'] !== 'staff') {
                $bad();
            }
            $key = $assignment['slotId'] . ':' . $assignment['staffId'];
            if (isset($unique[$key])) {
                $bad();
            }
            $unique[$key] = true;
            $slot = $state['slots'][$assignment['slotId']];
            $staffId = $assignment['staffId'];
            if (!$state['users'][$staffId]['active'] || ($state['availability'][$staffId][$slot['date']][$slot['block']] ?? 'not_submitted') !== 'available') {
                $bad();
            }
            foreach ($staffSlots[$staffId] ?? [] as $other) {
                if (Time::overlap($slot, $other)) {
                    $bad();
                }
            }
            $staffSlots[$staffId][] = $slot;
            $slotCounts[$slot['id']] = ($slotCounts[$slot['id']] ?? 0) + 1;
            if ($state['users'][$staffId]['qualification'] === 'technician') {
                $slotTechnicians[$slot['id']] = ($slotTechnicians[$slot['id']] ?? 0) + 1;
            }
            if ($slotCounts[$slot['id']] > $slot['headcount']) {
                $bad();
            }
        }
        // Historical published weeks stay complete; draft planning gaps remain valid.
        foreach ($state['slots'] as $slot) {
            if ($state['rosters'][$slot['rosterId']]['status'] === 'published' &&
                (($slotCounts[$slot['id']] ?? 0) !== $slot['headcount'] || ($slotTechnicians[$slot['id']] ?? 0) < $slot['technicianMinimum'])) {
                $bad();
            }
        }
        foreach ($state['swaps'] as $id => $swap) {
            if (!is_array($swap) || ($swap['id'] ?? '') !== (string)$id || !in_array($swap['status'] ?? '', ['awaiting_colleague', 'awaiting_supervisor', 'approved', 'declined', 'rejected', 'withdrawn', 'expired', 'invalidated'], true) || !isset($state['assignments'][$swap['assignmentId'] ?? ''], $state['assignments'][$swap['targetAssignmentId'] ?? ''], $state['users'][$swap['requesterId'] ?? ''], $state['users'][$swap['recipientId'] ?? ''], $state['rosters'][$swap['rosterId'] ?? '']) || !is_int($swap['version'] ?? null) || $swap['version'] < 1 || !is_int($swap['assignmentVersion'] ?? null) || !is_int($swap['targetAssignmentVersion'] ?? null) || !is_array($swap['timeline'] ?? null) || !is_string($swap['note'] ?? null)) {
                $bad();
            }
        }
        foreach ($state['notifications'] as $id => $notice) {
            if (!is_array($notice) || ($notice['id'] ?? '') !== (string)$id || !isset($state['users'][$notice['userId'] ?? '']) || !is_string($notice['title'] ?? null) || !is_string($notice['message'] ?? null) || !is_string($notice['createdAt'] ?? null)) {
                $bad();
            }
        }
        foreach ($state['audit'] as $entry) {
            if (!is_array($entry) || !is_string($entry['id'] ?? null) || !isset($state['users'][$entry['actorId'] ?? '']) || !is_string($entry['action'] ?? null) || !is_string($entry['createdAt'] ?? null) || !is_array($entry['details'] ?? null)) {
                $bad();
            }
        }
        if (count($state['operations'] ?? []) > 2000) {
            $bad();
        }
        foreach ($state['operations'] ?? [] as $key => $operation) {
            if (!is_string($key) || !is_array($operation) || !isset($state['swaps'][$operation['swapId'] ?? '']) || !is_string($operation['hash'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $operation['hash']) || !is_string($operation['createdAt'] ?? null)) {
                $bad();
            }
            $parts = explode(':', $key, 2);
            if (count($parts) !== 2 || !preg_match('/^[A-Za-z0-9_-]{16,100}$/D', $parts[1]) || $state['swaps'][$operation['swapId']]['requesterId'] !== $parts[0]) {
                $bad();
            }
        }
    }

    private function save(array $state): void
    {
        try {
            $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
        } catch (JsonException $error) {
            throw new DomainError('State could not be encoded. The previous snapshot was preserved.', 503, 'storage_write_failed');
        }
        $temp = @tempnam(dirname($this->path), '.state-');
        if ($temp === false || realpath(dirname($temp)) !== realpath(dirname($this->path))) {
            if (is_string($temp)) {
                @unlink($temp);
            }
            throw new DomainError('A private temporary snapshot could not be created.', 503, 'storage_write_failed');
        }
        $handle = null;
        try {
            @chmod($temp, 0600);
            $handle = @fopen($temp, 'wb');
            if ($handle === false) {
                throw new RuntimeException('open');
            }
            $length = strlen($json);
            $offset = 0;
            while ($offset < $length) {
                $written = @fwrite($handle, substr($json, $offset));
                if ($written === false || $written === 0) {
                    throw new RuntimeException('write');
                }
                $offset += $written;
            }
            if (!@fflush($handle) || (function_exists('fsync') && !@fsync($handle))) {
                throw new RuntimeException('flush');
            }
            if (!@fclose($handle)) {
                $handle = null;
                throw new RuntimeException('close');
            }
            $handle = null;
            // Never unlink the destination: a failed replacement must leave it intact.
            if (!$this->replaceSnapshot($temp, $this->path)) {
                throw new RuntimeException('replace');
            }
        } catch (Throwable $error) {
            throw new DomainError('The snapshot could not be saved. The previous state was preserved.', 503, 'storage_write_failed');
        } finally {
            if (is_resource($handle)) {
                fclose($handle);
            }
            if (file_exists($temp)) {
                @unlink($temp);
            }
        }
    }

    /** A small filesystem boundary also lets tests exercise replacement failure safely. */
    protected function replaceSnapshot(string $temporary, string $destination): bool
    {
        return @rename($temporary, $destination);
    }
}
