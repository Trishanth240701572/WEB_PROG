<?php
declare(strict_types=1);

/** Expected errors carry an HTTP status without exposing private records. */
class DomainError extends RuntimeException
{
    public function __construct(string $message, public int $status = 422, public string $errorCode = 'validation', public array $fields = [])
    {
        parent::__construct($message);
    }
}
