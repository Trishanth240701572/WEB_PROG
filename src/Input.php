<?php
declare(strict_types=1);

final class Input
{
    public static function query(string $key, string $default = ''): string
    {
        $value = $_GET[$key] ?? $default;
        if (!is_string($value) || strlen($value) > 128) {
            throw new DomainError('Use a single, valid value for ' . $key . '.', 422, 'invalid_query', [$key => 'Provide one value, up to 128 characters.']);
        }
        return $value;
    }
}
