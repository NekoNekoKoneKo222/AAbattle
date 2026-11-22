param([int]$Port = 3187)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$serverProcess = $null
$published = $false
try {
    if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be 1024-65535' }
    $node = Get-Command node -ErrorAction Stop
    $null = Get-Command npm -ErrorAction Stop
    $null = Get-Command tailscale -ErrorAction Stop
    Write-Host ''
    Write-Host '  SPRA - INK BATTLE / FRIEND FUNNEL' -ForegroundColor Cyan
    Write-Host '  Standalone 2D battle server (other AAbattle games are NOT served).'
    Write-Host ''
    if (-not (Test-Path (Join-Path $root 'node_modules/express')) -or
        -not (Test-Path (Join-Path $root 'node_modules/ws'))) {
        Write-Host 'Installing Node.js dependencies...'
        & npm ci --omit=dev
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    $secret = Read-Host 'Enter a private shared password (12-128 characters)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($password.Length -lt 12 -or $password.Length -gt 128) {
        throw 'Password must be 12-128 characters.'
    }
    $env:SPRA_FRIEND_PASSWORD = $password
    $env:SPRA_PORT = [string]$Port
    $serverProcess = Start-Process -FilePath $node.Source -ArgumentList 'src/spra-funnel-server.js' -WorkingDirectory $root -NoNewWindow -PassThru
    $base = "http://127.0.0.1:$Port"
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 400
        if ($serverProcess.HasExited) { throw 'SPRA server exited unexpectedly.' }
        try {
            $check = Invoke-WebRequest -UseBasicParsing -Uri "$base/healthz" -TimeoutSec 2
            if ($check.StatusCode -eq 200 -and $check.Content -eq 'ok') {
                $ready = $true
                break
            }
        } catch {}
    }
    if (-not $ready) { throw 'SPRA local health check failed.' }
    Write-Host 'Checking protected CSS/JS asset delivery...' -ForegroundColor Cyan
    $loginSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ password = $password } | ConvertTo-Json -Compress
    $null = Invoke-WebRequest -UseBasicParsing -Uri "$base/spra/login" -Method POST -ContentType 'application/json' -Headers @{Origin=$base} -Body $loginBody -WebSession $loginSession -TimeoutSec 10
    foreach ($item in @(
      @{ path='/spra/style.css'; mime='text/css' },
      @{ path='/spra/game.js'; mime='javascript' },
      @{ path='/spra/index.html'; mime='text/html' },
      @{ path='/fonts/ibm-plex-mono-latin-400-normal.woff2'; mime='font/woff2' }
    )) {
      $response = Invoke-WebRequest -UseBasicParsing -Uri ($base + $item.path) -WebSession $loginSession -TimeoutSec 10
      if ($response.StatusCode -ne 200 -or $response.Headers['Content-Type'] -notmatch $item.mime) {
        throw ("Asset delivery failed: " + $item.path)
      }
    }
    Write-Host 'CSS / game script / game HTML / font: OK' -ForegroundColor Green
    Write-Host 'Starting Tailscale Funnel HTTPS :443 -> localhost:'$Port -ForegroundColor Cyan
    & tailscale funnel --https=443 --bg "127.0.0.1:$Port"
    if ($LASTEXITCODE -ne 0) { throw 'Tailscale Funnel did not start.' }
    $published = $true
    & tailscale funnel status
    Write-Host ''
    Write-Host 'Share the https://...ts.net/spra/ link with your friends.' -ForegroundColor Green
    Write-Host 'Send your password separately; NEVER put it in the URL.'
    Write-Host 'Press ENTER to stop hosting and disable Funnel.' -ForegroundColor Yellow
    $null = Read-Host
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'See SPRA_FUNNEL_README.md for troubleshooting.'
    $null = Read-Host 'Press ENTER to exit'
} finally {
    if ($published) {
        & tailscale funnel --https=443 off
        Write-Host 'Funnel disabled.' -ForegroundColor Yellow
    }
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:SPRA_FRIEND_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SPRA_PORT -ErrorAction SilentlyContinue
}