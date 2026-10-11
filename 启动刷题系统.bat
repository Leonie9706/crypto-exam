@echo off
chcp 936 >nul
title 密码竞赛刷题 - 本地服务（关掉本窗口即退出）
cd /d "%~dp0"
set PY=

for %%P in (python.exe) do if not defined PY if exist "%%~$PATH:P" set PY=%%~$PATH:P
if not defined PY for %%P in (py.exe) do if exist "%%~$PATH:P" set PY=%%~$PATH:P

if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python310\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python39\python.exe
if not defined PY if exist "C:\Python313\python.exe" set PY=C:\Python313\python.exe
if not defined PY if exist "C:\Python312\python.exe" set PY=C:\Python312\python.exe
if not defined PY if exist "C:\Python311\python.exe" set PY=C:\Python311\python.exe
if not defined PY if exist "C:\Python310\python.exe" set PY=C:\Python310\python.exe

if not defined PY goto nopython

"%PY%" "%~dp0server.py"
echo.
echo 服务已退出，可以关闭本窗口。
pause
exit /b 0

:nopython
echo.
echo   [提示] 没有找到 Python，无法启动本地服务。
echo.
echo   两种办法：
echo     1) 直接双击本文件夹里的「密码竞赛刷题-单文件版.html」，不用服务也能用；
echo     2) 安装 Python 后再双击本文件。
echo.
pause
exit /b 1
