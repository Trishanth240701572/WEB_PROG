param([switch]$Stop)

# Share the existing application through a temporary Cloudflare Quick Tunnel.
# The dedicated origin has Secure cookies; the ordinary localhost server is untouched.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $projectRoot 'storage\preview-processes.json'
$origin = 'http://127.0.0.1:8001'

function Get-OwnedProcess($record, [string]$kind) {
    $details = $record.$kind
    if (!$details) { return $null }
    $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$details.processId) -ErrorAction SilentlyContinue
    if ($process -and $process.ExecutablePath -eq $details.executable -and $process.CommandLine.Contains($details.marker)) { return $process }
    return $null
}

$saved = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
if ($Stop) {
    foreach ($kind in @('tunnel', 'origin')) {
        $owned = Get-OwnedProcess $saved $kind
        if ($owned) { Stop-Process -Id $owned.ProcessId }
    }
    if ($saved) { Remove-Item -LiteralPath $stateFile }
    Write-Output 'Stopped the shared preview. The ordinary localhost server was left running.'
    exit
}
if ($saved) {
    $previousTunnel = Get-OwnedProcess $saved 'tunnel'
    $previousOrigin = Get-OwnedProcess $saved 'origin'
    if ($previousTunnel -and $previousOrigin) {
        Write-Output $saved.url
        exit
    }
    if ($previousTunnel -or $previousOrigin) {
        throw 'A previous preview is partially stopped. Run this script with -Stop, then start it again.'
    }
    Remove-Item -LiteralPath $stateFile
}

$phpCommand = Get-Command php -ErrorAction SilentlyContinue
$phpBinary = if ($phpCommand) { $phpCommand.Source } else { Join-Path $projectRoot '.tools\php\php.exe' }
$cloudflareCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
$tunnelBinary = if ($cloudflareCommand) { $cloudflareCommand.Source } else { Join-Path $projectRoot '.tools\cloudflared\cloudflared.exe' }
if (!(Test-Path -LiteralPath $phpBinary) -or !(Test-Path -LiteralPath $tunnelBinary)) { throw 'Install PHP and the official cloudflared client before sharing.' }
if (Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 8001 is already in use. Stop its owner before starting the preview.' }

$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$originError = Join-Path $projectRoot ('storage\preview-origin-' + $runId + '.stderr.log')
$tunnelError = Join-Path $projectRoot ('storage\cloudflared-' + $runId + '.stderr.log')
$originProcess = $null
$tunnelProcess = $null
try {
    $previousCookieFlag = [Environment]::GetEnvironmentVariable('SHIFTSYNC_SECURE_COOKIES', 'Process')
    try {
        $env:SHIFTSYNC_SECURE_COOKIES = '1'
        $originProcess = Start-Process -FilePath $phpBinary -ArgumentList @('-S', '127.0.0.1:8001', '-t', 'public', 'scripts/dev-router.php') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot ('storage\preview-origin-' + $runId + '.stdout.log')) -RedirectStandardError $originError -PassThru
    } finally {
        [Environment]::SetEnvironmentVariable('SHIFTSYNC_SECURE_COOKIES', $previousCookieFlag, 'Process')
    }
    $ready = Invoke-WebRequest -Uri ($origin + '/login.php') -UseBasicParsing -TimeoutSec 10
    if ($ready.StatusCode -ne 200 -or (($ready.Headers['Set-Cookie'] -join ';') -notmatch '(?i);\s*secure(?:;|$)')) { throw 'The preview origin did not return a protected session cookie.' }
    $tunnelProcess = Start-Process -FilePath $tunnelBinary -ArgumentList @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', $origin) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot ('storage\cloudflared-' + $runId + '.stdout.log')) -RedirectStandardError $tunnelError -PassThru
    $deadline = (Get-Date).AddSeconds(45)
    $previewUrl = $null
    do {
        if ($tunnelProcess.HasExited) { throw ('Cloudflare exited. Inspect ' + $tunnelError) }
        $log = ''
        if (Test-Path -LiteralPath $tunnelError) { $log = [string](Get-Content -LiteralPath $tunnelError -Raw) }
        $match = [regex]::Match($log, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success -and $log.Contains('Registered tunnel connection')) { $previewUrl = $match.Value; break }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if (!$previewUrl) { throw ('Cloudflare did not connect within 45 seconds. Inspect ' + $tunnelError) }
    $record = [ordered]@{
        url = $previewUrl
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        origin = @{ processId = $originProcess.Id; executable = $phpBinary; marker = '-S 127.0.0.1:8001 -t public' }
        tunnel = @{ processId = $tunnelProcess.Id; executable = $tunnelBinary; marker = '--url http://127.0.0.1:8001' }
        log = $tunnelError
    }
    $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding utf8
    Write-Output $previewUrl
} catch {
    if ($tunnelProcess -and !$tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id }
    if ($originProcess -and !$originProcess.HasExited) { Stop-Process -Id $originProcess.Id }
    throw
}
