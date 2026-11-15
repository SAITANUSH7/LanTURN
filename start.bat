@echo off
set "PATH=C:\Users\astek\AppData\Local\OpenAI\Codex\runtimes\cua_node\bbc9141fe9f920ac\bin;%PATH%"
cd /d "%~dp0"

echo ============================================================
echo   Starting LanTURN 3.0 Platform...
echo ============================================================
echo.

start "" "http://localhost:3000"
node --no-warnings server.js
