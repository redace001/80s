@echo off
REM Double-click to run the local server and open the desktop browser.
REM For phone play: use the http://192.168.x.x:8000 address printed below.
cd /d "%~dp0"
start "" powershell -NoProfile -Command "Start-Sleep -Milliseconds 800; Start-Process 'http://localhost:8000/'"
node serve.js %*
