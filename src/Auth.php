<?php
declare(strict_types=1);

final class Auth
{
    public static function open(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        $path = config('session_path');
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
            throw new DomainError('Session storage is unavailable.', 503, 'session_unavailable');
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', (string)config('absolute_seconds'));
        session_save_path($path);
        session_name('shiftsync_session');
        session_set_cookie_params([
            'lifetime' => 0, 'path' => config('base_path') ?: '/',
            'secure' => config('secure_cookies') || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true, 'samesite' => 'Lax',
        ]);
        if (!session_start()) throw new DomainError('Could not start the session.', 503, 'session_unavailable');
    }

    public static function safe(array $user): array
    {
        return array_intersect_key($user, array_flip(['id', 'name', 'email', 'role', 'qualification', 'active']));
    }

    public static function user(bool $touch = true): array
    {
        self::open();
        $id = $_SESSION['userId'] ?? null;
        $sessionCredentialVersion = $_SESSION['credentialVersion'] ?? 0;
        $now = time();
        if (!$id || $now - ($_SESSION['lastActivity'] ?? 0) >= config('idle_seconds') ||
            $now - ($_SESSION['signedInAt'] ?? 0) >= config('absolute_seconds')) {
            if ($id) self::logout(); else session_write_close();
            throw new DomainError('Your session has ended. Sign in to continue.', 401, 'unauthenticated');
        }
        if ($touch) $_SESSION['lastActivity'] = $now;
        session_write_close(); // Never hold a session lock while waiting for the business-store lock.
        $state = store()->read();
        $user = $state['users'][$id] ?? null;
        if (!$user || !($user['active'] ?? false)) {
            self::logout();
            throw new DomainError('This account is unavailable. Contact your supervisor.', 401, 'unauthenticated');
        }
        // Older records/sessions both default to zero until an explicit password reset.
        if ($sessionCredentialVersion !== ($user['credentialVersion'] ?? 0)) {
            self::logout();
            throw new DomainError('Your password changed. Sign in again.', 401, 'unauthenticated');
        }
        return self::safe($user);
    }

    public static function pageUser(?string $role = null): array
    {
        try { $user = self::user(); }
        catch (DomainError $error) {
            if ($error->status === 401) redirect('login.php');
            throw $error;
        }
        if ($role !== null && $user['role'] !== $role) {
            http_response_code(403);
            throw new DomainError('This page is available to ' . $role . ' accounts only.', 403, 'forbidden');
        }
        return $user;
    }

    public static function login(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        if (strlen($email) > 254) {
            throw new DomainError('Check your email and password and try again.', 422, 'invalid_credentials');
        }
        Passwords::validateForLogin($password);
        self::throttle($email, false);
        $state = store()->read();
        $found = null;
        foreach ($state['users'] as $user) if (strtolower($user['email']) === $email) $found = $user;
        $dummy = '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        $valid = Passwords::verify($password, $found['passwordHash'] ?? $dummy);
        if (!$valid || !$found || !$found['active']) {
            self::throttle($email, true);
            throw new DomainError('Check your email and password and try again.', 422, 'invalid_credentials');
        }
        self::open();
        session_regenerate_id(true);
        $_SESSION = ['userId' => $found['id'], 'credentialVersion' => $found['credentialVersion'] ?? 0, 'signedInAt' => time(), 'lastActivity' => time(), 'csrf' => bin2hex(random_bytes(32))];
        session_write_close();
        return self::safe($found);
    }

    private static function throttle(string $email, bool $record): void
    {
        $path = dirname(config('store_path')) . '/login-throttle.json';
        $handle = fopen($path, 'c+');
        if (!$handle || !flock($handle, LOCK_EX)) throw new DomainError('Sign-in is temporarily unavailable.', 503, 'throttle_unavailable');
        try {
            $raw = stream_get_contents($handle);
            $attempts = $raw ? json_decode($raw, true, 512, JSON_THROW_ON_ERROR) : [];
            $cutoff = time() - 300;
            foreach ($attempts as $key => $times) {
                $attempts[$key] = array_values(array_filter($times, fn($t) => $t > $cutoff));
                if (!$attempts[$key]) unset($attempts[$key]);
            }
            $key = hash('sha256', $email . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'));
            if (count($attempts[$key] ?? []) >= 8) throw new DomainError('Too many attempts for this account. Try again in five minutes.', 429, 'rate_limited');
            if ($record) {
                $attempts[$key][] = time();
                $json = json_encode($attempts, JSON_THROW_ON_ERROR);
                rewind($handle);
                if (!ftruncate($handle, 0) || fwrite($handle, $json) !== strlen($json) || !fflush($handle)) {
                    throw new DomainError('Sign-in is temporarily unavailable.', 503, 'throttle_unavailable');
                }
            }
        } finally { flock($handle, LOCK_UN); fclose($handle); }
    }

    public static function logout(): void
    {
        self::open();
        $_SESSION = [];
        $params = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $params['path'], 'secure' => $params['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        session_destroy();
    }
}
