<?php
declare(strict_types=1);

final class Csrf
{
    private static ?string $cached = null;
    public static function token(): string
    {
        if (self::$cached !== null) return self::$cached;
        Auth::open();
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
        $token = $_SESSION['csrf'];
        session_write_close();
        return self::$cached = $token;
    }

    public static function check(?string $token): void
    {
        $expected = self::token();
        if (!$token || !hash_equals($expected, $token)) {
            // This check always runs before a business mutation; clients may safely refresh the token.
            throw new DomainError('Your security token has expired. Reload this page and try again; nothing was saved.', 403, 'csrf_rejected');
        }
    }
}
