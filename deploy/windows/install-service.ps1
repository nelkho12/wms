<#
  Installs ApexWMS so it starts automatically with Windows (no one needs to log in).
  Run in PowerShell **as Administrator**, from the folder that contains server.cjs and .env:

      powershell -ExecutionPolicy Bypass -File .\install-service.ps1

  What it does:
    1. copies the service files to C:\ApexWMS\service
    2. creates a Task Scheduler job "ApexWMS Service" that starts at boot and restarts if it stops
    3. opens TCP port 3000 in the Windows firewall (only the desktop apps need this port)
#>
param(
    [string]$InstallDir = "C:\ApexWMS\service",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this script as Administrator (right-click PowerShell > Run as administrator)."
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js is not installed. Install the LTS version from https://nodejs.org first." }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $here "server.cjs"))) { throw "server.cjs was not found next to this script." }
if (-not (Test-Path (Join-Path $here ".env"))) { throw "The file .env is missing. Copy .env.example to .env and fill in your SQL Server details first." }

New-Item -ItemType Directory -Force $InstallDir | Out-Null
Copy-Item (Join-Path $here "server.cjs") $InstallDir -Force
Copy-Item (Join-Path $here ".env") $InstallDir -Force
foreach ($f in "start-service.bat", "backup-database.bat", "02-backup-database.sql") {
    if (Test-Path (Join-Path $here $f)) { Copy-Item (Join-Path $here $f) $InstallDir -Force }
}

$taskName = "ApexWMS Service"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# cmd wrapper so that the output is also kept in a log file
$cmd = "/c `"set NODE_ENV=production&& `"$node`" server.cjs >> service.log 2>&1`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmd -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null

Remove-NetFirewallRule -DisplayName "ApexWMS Service" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "ApexWMS Service" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Domain,Private | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "ApexWMS service installed and started." -ForegroundColor Green
Write-Host "  Files:   $InstallDir"
Write-Host "  Log:     $InstallDir\service.log   (the first-run administrator password is printed here if you did not set ADMIN_PASSWORD)"
Write-Host "  Address: http://<this-PC-name-or-IP>:$Port   <- type this in the desktop app"
try {
    $r = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 5
    Write-Host "  Check:   service answers ($($r.status))" -ForegroundColor Green
} catch {
    Write-Host "  Check:   the service did not answer yet - look at service.log" -ForegroundColor Yellow
}
