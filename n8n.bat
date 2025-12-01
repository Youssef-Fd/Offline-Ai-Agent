@echo off
REM Set environment variables to fix deprecation warnings
set DB_SQLITE_POOL_SIZE=5
set N8N_RUNNERS_ENABLED=true

echo Starting n8n...
cd /d "C:\Users\Lenovo\AppData\Roaming\npm"

REM Start n8n in a new window
start "n8n Server" cmd /k "n8n & pause"

REM Wait for n8n to start by checking port 5678
echo Waiting for n8n to be ready...
:wait_n8n
timeout /t 2 >nul
powershell -command "(Test-NetConnection -ComputerName localhost -Port 5678).TcpTestSucceeded" | findstr "True" >nul
if errorlevel 1 goto wait_n8n

REM Open n8n Editor UI in Chrome
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5678"

REM Navigate back to the project folder
cd /d "%~dp0"

REM Run npm dev in a new window
start "Dev Server" cmd /k "npm run dev & pause"

REM Wait for npm run dev to be ready by checking port 3000
echo Waiting for npm run dev to start...
:wait_dev
timeout /t 2 >nul
powershell -command "(Test-NetConnection -ComputerName localhost -Port 3000).TcpTestSucceeded" | findstr "True" >nul
if errorlevel 1 goto wait_dev

REM Open your web app in Chrome
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:3000"

echo All processes started successfully!
echo n8n running on: http://localhost:5678
echo Web app running on: http://localhost:3000
pause
