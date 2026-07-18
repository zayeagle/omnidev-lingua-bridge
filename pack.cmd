@echo off
setlocal
cd /d "%~dp0"
echo Lingua Bridge pack (Windows)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install from https://nodejs.org/
  exit /b 1
)
node scripts\pack.mjs %*
exit /b %ERRORLEVEL%
