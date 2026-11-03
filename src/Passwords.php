<?php
declare(strict_types=1);

/** Bcrypt's limit is bytes, not characters. Never silently truncate a password. */
final class Passwords
{
    public static function validateForCreation(string $password): void
    {
        $length = strlen($password);
        if ($length < 12 || $length > 72 || str_contains($password, "\0")) {
            throw new DomainError('Passwords must contain 12–72 bytes and no null bytes; multibyte characters use more than one byte.', 422, 'password_policy', ['password' => 'Use 12–72 bytes.']);
        }
    }

    public static function validateForLogin(string $password): void
    {
        // Existing shorter hashes remain usable. New/reset passwords require 12 bytes.
        if (strlen($password) > 72 || str_contains($password, "\0")) {
            throw new DomainError('Sign-in passwords support at most 72 bytes and no null bytes. If an older password was longer, ask your supervisor to reset it; its discarded suffix cannot be recovered.', 422, 'password_policy', ['password' => 'A password reset is required for an older password longer than 72 bytes.']);
        }
    }

    public static function hash(string $password): string
    {
        self::validateForCreation($password);
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verify(string $password, string $hash): bool
    {
        self::validateForLogin($password);
        return password_verify($password, $hash);
    }
}
