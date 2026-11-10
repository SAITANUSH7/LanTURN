@echo off
setlocal EnableExtensions
title LanTURN launcher
cd /d "%~dp0"

echo ============================================================
echo   LanTURN - one-click local setup and hosting
echo ============================================================
echo.

rem ---- Optional: launch.bat reset  (wipes the local database and uploads)
if /i "%~1"=="reset" (
  echo Resetting local data...
  if exist data rmdir /s /q data
  echo Done. Starting fresh.
  echo.
)

rem ---- 1. Node.js 22.5+ (needed for the built-in SQLite)
where node >nul 2>nul
if errorlevel 1 goto :install_node
node scripts\launch-helper.mjs check
if errorlevel 1 goto :install_node
goto :node_ok

:install_node
echo [1/5] Node.js 22.5 or newer was not found.
where winget >nul 2>nul
if errorlevel 1 (
  echo       winget is not available. Install Node.js LTS from https://nodejs.org
  echo       then run this file again.
  pause
  exit /b 1
)
echo       Installing Node.js LTS with winget ^(this can take a minute^)...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo       Node.js was installed. Close this window and double-click launch.bat
echo       again so Windows picks up the new PATH.
pause
exit /b 0

:node_ok
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo [1/5] Node.js %NODEV% OK

rem ---- 2. Dependencies
if not exist node_modules (
  echo [2/5] Installing dependencies ^(first run only^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo       npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
) else (
  echo [2/5] Dependencies already installed
)

rem ---- 3. Settings (.env with fresh random secrets)
for /f "delims=" %%s in ('node scripts\launch-helper.mjs env') do set ENVSTATE=%%s
if "%ENVSTATE%"=="created" (echo [3/5] Created .env with new random secrets) else (echo [3/5] Using existing .env)

rem ---- 4. Pick a free port and find the LAN address
for /f "delims=" %%p in ('node scripts\launch-helper.mjs port 3000') do set PORT=%%p
for /f "delims=" %%i in ('node scripts\launch-helper.mjs lan') do set LANIP=%%i
echo [4/5] Port %PORT% is free

rem ---- 5. Start the server, open the browser
echo [5/5] Starting LanTURN...
echo.
echo   On this PC:        http://localhost:%PORT%
if defined LANIP echo   On your network:   http://%LANIP%:%PORT%   ^(phones / other PCs on the same Wi-Fi^)
echo   Design system:     http://localhost:%PORT%/design-system.html
echo.
echo   Demo logins ^(password in brackets^)
echo     Student   student.one@example.test   [Demo@12345]
echo     Employer  hr@examplecorp.test        [Demo@12345]
echo     Admin     admin@lanturn.local        [Admin@12345]
echo.
echo   Keep this window open while you use the app. Press Ctrl+C to stop.
echo   If other devices cannot connect, allow Node.js through Windows Firewall
echo   ^(Private networks^) when Windows asks.
echo ============================================================
echo.

start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"
node --no-warnings server.js

echo.
echo LanTURN stopped.
pause
endlocal
