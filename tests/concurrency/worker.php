<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';
Time::configure('Asia/Kolkata', '2029-12-01T00:00:00Z');
[$script, $mode, $path, $gate, $payloadJson] = $argv;
$payload = json_decode($payloadJson, true, 64, JSON_THROW_ON_ERROR);
$deadline = microtime(true) + 8;
while (!is_file($gate)) { if (microtime(true) > $deadline) exit(3); usleep(5000); }
try {
    if ($mode === 'hold') {
        $handle = fopen(dirname($path) . '/state.lock', 'c+b');
        flock($handle, LOCK_EX);
        file_put_contents($payload['ready'], 'ready');
        usleep(800000);
        flock($handle, LOCK_UN);
        fclose($handle);
        echo json_encode(['ok' => true]);
    } else {
        $result = (new Store($path))->transaction(function (array &$state) use ($mode, $payload): array {
            $actor = $state['users'][$payload['actor']];
            return Domain::command($state, $actor, $mode === 'approve' ? 'swap.approve' : 'swap.create', $payload['params']);
        });
        echo json_encode(['ok' => true, 'id' => $result['id'], 'status' => $result['status']]);
    }
} catch (DomainError $error) { echo json_encode(['ok' => false, 'code' => $error->errorCode]); }
