<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';
$demoAccounts = DemoLogin::accounts();
$demoErrors = [
    'rate_limited' => 'Too many attempts for this account. Wait five minutes and try again.',
    'invalid_credentials' => 'That account could not sign in. If the demo was re-seeded, reload this page and try again.',
    'forbidden' => 'Demo sign-in works only from this computer, using this page.',
];
$demoError = is_string($_GET['demo_error'] ?? null) ? ($demoErrors[$_GET['demo_error']] ?? 'Sign-in failed. Reload this page and try again.') : null;
Page::head('A clearer week for your lab team');
?>
<header class="public-header container"><?php Page::brand(); ?><a class="btn btn-secondary" href="<?= e(url('login.php')) ?>">Sign in <span aria-hidden="true">↗</span></a></header>
<?php if ($demoAccounts): ?>
<section id="demo-accounts" class="demo-accounts container" aria-labelledby="demo-heading">
    <div class="demo-accounts-head">
        <div><h2 id="demo-heading">Quick sign-in</h2><p class="muted">Pick an account to open its workspace. Shown only on this computer for the fictional local demo.</p></div>
        <span class="pill">Local demo · <?= count($demoAccounts) ?> accounts</span>
    </div>
    <?php if ($demoError): ?><div class="notice notice-error demo-accounts-error" role="alert"><strong>Unable to sign in</strong><p><?= e($demoError) ?></p></div><?php endif; ?>
    <ul class="demo-account-list">
        <?php foreach ($demoAccounts as $account): ?>
        <li>
            <form method="post" action="<?= e(url('handlers/demo-login.php')) ?>">
                <input type="hidden" name="email" value="<?= e($account['email']) ?>">
                <button class="demo-account<?= $account['role'] === 'Supervisor' ? ' demo-account-lead' : '' ?>" type="submit">
                    <span class="demo-account-avatar" aria-hidden="true"><?= e(Page::initials($account['name'])) ?></span>
                    <span class="demo-account-text"><strong><?= e($account['name']) ?></strong><span><?= e($account['role']) ?> · <?= e($account['email']) ?></span></span>
                    <span class="demo-account-go" aria-hidden="true">→</span>
                </button>
            </form>
        </li>
        <?php endforeach; ?>
    </ul>
</section>
<?php endif; ?>
<main id="main" class="public-main container">
    <section class="public-intro">
        <span class="pill">Duty roster management</span>
        <h1 class="public-title">A clearer week.<br>A covered lab.</h1>
        <p class="public-copy">Bring availability, lab coverage and approved shift exchanges into one considered workspace.</p>
        <a class="btn btn-primary" href="<?= e(url('login.php')) ?>">Open your workspace <span aria-hidden="true">→</span></a>
        <p class="muted public-context">Northfield College · Computer lab support · Asia/Kolkata</p>
    </section>
    <section class="intro-workflow" aria-labelledby="workflow-heading">
        <div class="panel-head"><h2 id="workflow-heading">From availability to an approved exchange</h2><span class="pill">How it works</span></div>
        <ol class="workflow-list">
            <li><span class="workflow-number">01</span><div><h3>Share your availability</h3><p>Tell your team which morning and afternoon blocks you can cover.</p></div></li>
            <li><span class="workflow-number">02</span><div><h3>Publish a covered week</h3><p>Your supervisor checks headcount and technician coverage before publishing.</p></div></li>
            <li><span class="workflow-number">03</span><div><h3>Exchange with confidence</h3><p>A colleague accepts, your supervisor reviews, and both duties update together.</p></div></li>
        </ol>
        <div class="intro-note">Built for one college, two laboratories and the people keeping them running.</div>
    </section>
</main>
<footer class="public-footer container"><span>ShiftSync</span><span>Scheduled duties. Clear decisions.</span></footer>
<?php Page::foot(); ?>
