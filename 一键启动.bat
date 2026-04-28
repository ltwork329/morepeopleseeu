@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
set "NODE=%ROOT%runtime\node\node.exe"
if not exist "%NODE%" set "NODE=node"
cd /d "%ROOT%"
"%NODE%" "%ROOT%scripts\windows_install.mjs"
"%NODE%" "%ROOT%scripts\windows_run.mjs"
pause
