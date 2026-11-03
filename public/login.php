<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/src/bootstrap.php';
$error = null;
$email = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = is_string($_POST['email'] ?? null) ? $_POST['email'] : '';
    try {
        Csrf::check(is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : null);
        Auth::login($email, is_string($_POST['password'] ?? null) ? $_POST['password'] : '');
        redirect('app.php#/overview');
    } catch (DomainError $exception) { http_response_code($exception->status); $error = $exception->getMessage(); }
} else {
    Auth::open();
    $signedIn = isset($_SESSION['userId']);
    session_write_close();
    if ($signedIn) {
        try { Auth::user(); redirect('app.php#/overview'); }
        catch (DomainError $exception) { if ($exception->status !== 401) $error = $exception->getMessage(); }
    }
}
$csrf = Csrf::token();
Page::head('Sign in');
?>
<header class="public-header container"><?php Page::brand(); ?><a class="back-link" href="<?= e(url()) ?>">Back to introduction</a></header>
<main id="main" class="auth-layout container">
    <section class="auth-story"><span class="pill">Northfield College</span><h1>Your team.<br>Your week.<br>In sync.</h1><p>A little clarity goes a long way. Know your duties, plan your time, and keep every lab covered.</p><div class="auth-story-rule"></div><span class="muted">Computer lab support · Asia/Kolkata</span></section>
    <section class="auth-card panel" aria-labelledby="login-heading"><div class="panel-body">
        <span class="muted">WELCOME BACK</span><h2 id="login-heading">Sign in to ShiftSync</h2><p class="muted">Use your provisioned college team account.</p>
        <?php if ($error): ?><div class="notice notice-error" role="alert"><strong>Unable to sign in</strong><p><?= e($error) ?></p><a href="#email">Check sign-in details</a></div><?php endif; ?>
        <form method="post" action="<?= e(url('handlers/login.php')) ?>" class="login-form">
            <input type="hidden" name="csrf" value="<?= e(Csrf::token()) ?>">
            <div class="field"><label class="form-label" for="email">Email address</label><input class="form-control" id="email" name="email" type="email" autocomplete="username" maxlength="254" value="<?= e($email) ?>" required></div>
            <div class="field"><label class="form-label" for="password">Password</label><input class="form-control" id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required></div>
            <button class="btn btn-primary auth-submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
        </form>
        <p class="auth-help muted">Need an account? Ask your supervisor to provision one.</p>
        <div class="auth-demo-note">Local demonstration uses fictional staff. Generated sign-in details are in your private setup receipt.</div>
    </div></section>
</main>
<?php Page::foot(); ?>
