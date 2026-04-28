@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
set "NODE=%ROOT%runtime\node\node.exe"
if not exist "%NODE%" set "NODE=node"
cd /d "%ROOT%"
"%NODE%" "%ROOT%scripts\windows_install.mjs"
echo.
echo 安装检查完成。按任意键退出。
pause >nul
