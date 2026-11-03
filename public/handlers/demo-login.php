<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') redirect('');
try {
    DemoLogin::login(is_string($_POST['email'] ?? null) ? $_POST['email'] : '');
    redirect('app.php#/overview');
} catch (DomainError $exception) {
    redirect('?demo_error=' . rawurlencode($exception->errorCode) . '#demo-accounts');
}
