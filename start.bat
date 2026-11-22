@echo off
rem KRISHNA SAKHA - start him on this computer (double-click). Open http://localhost:3100 in the browser.
rem If the server ever stops by itself, it is started again after 3 seconds. Close this window to stop him.
cd /d "%~dp0"
title Krishna Sakha
:loop
node server.js
echo.
echo Krishna Sakha stopped. Starting again in 3 seconds... (close this window to stop)
timeout /t 3 /nobreak >nul
goto loop
