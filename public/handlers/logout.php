<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new DomainError('Sign out using the form in your workspace.', 405, 'method_not_allowed');
    Auth::user();
    Csrf::check(is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : null);
    Auth::logout();
    redirect('login.php');
} catch (DomainError $error) {
    http_response_code($error->status);
    Page::head('Sign out'); ?><main id="main" class="container public-main"><div class="notice notice-error"><?= e($error->getMessage()) ?></div><a class="btn btn-secondary" href="<?= e(url('app.php')) ?>">Return to workspace</a></main><?php Page::foot();
}
