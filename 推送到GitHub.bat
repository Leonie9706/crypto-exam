@echo off
chcp 936 >nul
title 推送到 GitHub（关掉本窗口即取消）
cd /d "%~dp0"

echo ============================================================
echo   把刷题程序推送到 GitHub
echo ============================================================
echo.
echo  请先在浏览器打开  https://github.com/new  创建一个空仓库
echo    - 仓库名建议：crypto-quiz-js-2026
echo    - 可见性选 Public
echo    - 不要勾选 Add a README / .gitignore / license
echo.
echo  创建好之后回到这里，按提示输入用户名和仓库名。
echo.

set PY=
for %%P in (python.exe) do if not defined PY if exist "%%~$PATH:P" set PY=%%~$PATH:P
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
if not defined PY goto nopython

"%PY%" "%~dp0deploy.py"
echo.
pause
exit /b 0

:nopython
echo   [提示] 没有找到 Python，无法运行一键脚本。
echo   可以手动执行：
echo     git remote add origin https://github.com/用户名/仓库名.git
echo     git push -u origin main
echo.
pause
exit /b 1
