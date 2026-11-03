# Run npm with installed Node; the workspace fallback is optional, never bundled.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) { & $npmCommand.Source @args; exit $LASTEXITCODE }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
$npmCli = Join-Path $taskRoot '.tools/npm/package/bin/npm-cli.js'
if (!(Test-Path -LiteralPath $nodeExecutable) -or !(Test-Path -LiteralPath $npmCli)) { throw 'Install Node.js 22.12+ with npm and add it to PATH.' }
$env:PATH = (Split-Path -Parent $nodeExecutable) + [IO.Path]::PathSeparator + $env:PATH
& $nodeExecutable $npmCli @args
exit $LASTEXITCODE
