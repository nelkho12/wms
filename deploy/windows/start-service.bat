@echo off
REM Starts the ApexWMS service in this window (good for a first test).
REM Close the window to stop it.  For automatic start with Windows, run install-service.ps1 instead.
cd /d "%~dp0"
if not exist ".env" (
  echo.
  echo  The file ".env" is missing. Copy ".env.example" to ".env" and fill in your SQL Server details.
  echo.
  pause
  exit /b 1
)
set NODE_ENV=production
node server.cjs
pause
