<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $action = Input::query('action', 'bootstrap');
    if (!is_string($action) || strlen($action) > 64) throw new DomainError('Unknown API action.', 404, 'not_found');
    $background = $method === 'GET' && ($_SERVER['HTTP_X_BACKGROUND_REFRESH'] ?? '') === '1';
    $actor = Auth::user(!$background);
    if ($method === 'GET') {
        $state = store()->read();
        $data = match ($action) {
            'bootstrap' => Domain::bootstrap($state, $actor),
            'session' => ['user' => $actor, 'csrf' => Csrf::token()],
            'availability' => Domain::availability($state, $actor, Input::query('week')),
            'candidates' => Domain::candidates($state, $actor, Input::query('assignmentId')),
            'assignment-candidates' => Domain::assignmentCandidates($state, $actor, Input::query('slotId')),
            'preview' => Domain::preview($state, $actor, Input::query('id')),
            'report' => Domain::report($state, $actor, Input::query('week'), Input::query('lab', 'all'), Input::query('status', 'all'), Input::query('staffId', 'all')),
            default => throw new DomainError('This endpoint does not support this read action.', 405, 'method_not_allowed'),
        };
        Response::json($data, $state['revision']);
    }
    if ($method !== 'POST') throw new DomainError('Use GET or POST for this endpoint.', 405, 'method_not_allowed');
    Csrf::check($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) throw new DomainError('This request is too large.', 413, 'payload_too_large');
    try { $payload = json_decode(file_get_contents('php://input', false, null, 0, 32769), true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new DomainError('Send a valid JSON object.', 422, 'invalid_json'); }
    if (!is_array($payload) || array_is_list($payload) && $payload !== []) throw new DomainError('Send a JSON object.', 422, 'invalid_json');
    if ($action === 'logout') { Auth::logout(); Response::json(['signedOut' => true]); }
    $result = store()->transaction(static function (array &$state) use ($actor, $action, $payload): array {
        // Re-read the actor inside the same transaction as permission-sensitive changes.
        $current = $state['users'][$actor['id']] ?? null;
        if (!$current || !$current['active']) throw new DomainError('This account is no longer active.', 401, 'unauthenticated');
        $data = Domain::command($state, $current, $action, $payload);
        return ['data' => $data];
    });
    Response::json($result['data'], store()->read()['revision']);
} catch (Throwable $error) { Response::error($error); }
