$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$node = (Get-Command node.exe -ErrorAction Stop).Source

Start-Process -FilePath $node -ArgumentList 'src/entry-routes.js' -WorkingDirectory $root -WindowStyle Hidden

$envFile = Join-Path $root '.env'
if (Test-Path -LiteralPath $envFile) {
    Start-Process -FilePath $node -ArgumentList @('--env-file=.env', 'src/gateway-server.js') -WorkingDirectory $root -WindowStyle Hidden
}
