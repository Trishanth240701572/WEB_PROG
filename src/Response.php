<?php
declare(strict_types=1);

final class Response
{
    public static function json(mixed $data, ?int $revision = null): never
    {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => true, 'data' => $data, 'meta' => ['revision' => $revision, 'serverTime' => Time::iso()]], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    public static function error(Throwable $error): never
    {
        $known = $error instanceof DomainError;
        http_response_code($known ? $error->status : 500);
        header('Content-Type: application/json; charset=utf-8');
        if (!$known) error_log('ShiftSync: ' . $error->getMessage());
        echo json_encode(['ok' => false, 'error' => ['code' => $known ? $error->errorCode : 'internal_error',
            'message' => $known ? $error->getMessage() : 'Something went wrong. Your last saved records are safe. Try refreshing.',
            'fields' => $known ? $error->fields : []], 'meta' => ['serverTime' => Time::iso()]], JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }
}
