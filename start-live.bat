@echo off
rem KRISHNA SAKHA - start the server and put it online (double-click this file).
rem Keep both windows open while he should be live: https://impalamol.github.io/krishna-sakha/
cd /d "%~dp0"
start "Krishna Sakha server" cmd /k "node server.js"
timeout /t 15 /nobreak >nul
start "Krishna Sakha live link" cmd /k "node scripts\go-live.mjs"
