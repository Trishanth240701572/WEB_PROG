<?php
declare(strict_types=1);

/**
 * One-click sign-in for the local demo. Available only to loopback requests while a private setup
 * receipt exists. Passwords stay on the server: the page posts only the chosen email.
 */
final class DemoLogin
{
    public static function enabled(): bool
    {
        return self::isLocal() && self::receipt() !== null;
    }

    /** @return list<array{email:string,name:string,role:string}> */
    public static function accounts(): array
    {
        if (!self::enabled()) return [];
        try { $users = store()->read()['users'] ?? []; } catch (Throwable) { $users = []; }
        $byEmail = [];
        foreach ($users as $user) $byEmail[strtolower($user['email'])] = $user;
        $accounts = [];
        foreach (array_keys(self::credentials()) as $email) {
            $user = $byEmail[$email] ?? null;
            if ($user !== null && empty($user['active'])) continue;
            $accounts[] = [
                'email' => $email,
                'name' => $user['name'] ?? $email,
                'role' => ($user['role'] ?? '') === 'supervisor' ? 'Supervisor' : (($user['qualification'] ?? '') === 'technician' ? 'Technician' : 'Lab assistant'),
            ];
        }
        // Supervisor first, then staff in receipt order.
        usort($accounts, fn(array $a, array $b): int => ($b['role'] === 'Supervisor') <=> ($a['role'] === 'Supervisor'));
        return $accounts;
    }

    public static function login(string $email): array
    {
        if (!self::enabled()) throw new DomainError('Demo sign-in is available only on this computer.', 403, 'forbidden');
        self::checkSameOrigin();
        $password = self::credentials()[strtolower(trim($email))] ?? null;
        if ($password === null) throw new DomainError('That demo account was not found.', 422, 'invalid_credentials');
        return Auth::login($email, $password);
    }

    /** @return array<string,string> email => password, from the newest setup receipt. */
    private static function credentials(): array
    {
        $receipt = self::receipt();
        $credentials = [];
        foreach ($receipt ? (file($receipt, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []) : [] as $line) {
            $parts = explode("\t", trim($line));
            if (count($parts) === 2 && str_contains($parts[0], '@')) $credentials[strtolower($parts[0])] = $parts[1];
        }
        return $credentials;
    }

    private static function receipt(): ?string
    {
        // seed-demo.php --reset writes a timestamped receipt; the newest one matches the current state.
        $files = glob(dirname(config('store_path')) . '/demo-credentials*.txt') ?: [];
        usort($files, fn(string $a, string $b): int => filemtime($b) <=> filemtime($a));
        return $files[0] ?? null;
    }

    private static function isLocal(): bool
    {
        return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1', '::ffff:127.0.0.1'], true);
    }

    /** Replaces the session token check so an open home page never goes stale after signing in or out. */
    private static function checkSameOrigin(): void
    {
        $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? null;
        if ($site !== null) {
            if (in_array($site, ['same-origin', 'none'], true)) return;
        } else {
            $source = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
            if ($source !== '' && parse_url($source, PHP_URL_HOST) === parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) return;
        }
        throw new DomainError('Demo sign-in must start from this site.', 403, 'forbidden');
    }
}
