@echo off
chcp 65001 >nul
title xTooler_Tracker Demo Server
echo.
echo  xTooler_Tracker Demo 服务器启动中...
echo  本机访问:   http://localhost:8123/demo/
echo  同事访问:   http://本机IP:8123/demo/  (需先放行防火墙端口 8123)
echo  关闭此窗口即停止服务器
echo.
C:\ProgramData\miniconda3\python.exe -m http.server 8123 --directory "%~dp0"
pause
