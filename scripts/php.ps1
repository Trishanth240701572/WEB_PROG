# Prefer a normal PHP installation, then the optional private local runtime.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if ($phpCommand) { & $phpCommand.Source @args; exit $LASTEXITCODE }
$portablePhp = Join-Path $taskRoot '.tools/php/php.exe'
if (Test-Path -LiteralPath $portablePhp) { & $portablePhp @args; exit $LASTEXITCODE }
throw 'PHP 8.3+ was not found. Add PHP to PATH or install it under .tools/php/.'
