@echo off
echo ========================================
echo   FacePay - Push to GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo Checking git status...
git status
echo.

echo Adding all files...
git add .
echo.

echo Enter commit message (or press Enter for default):
set /p commit_msg="Message: "

if "%commit_msg%"=="" (
    set commit_msg=Update FacePay system
)

echo.
echo Committing with message: %commit_msg%
git commit -m "%commit_msg%"
echo.

echo Pushing to GitHub...
git push origin main
echo.

if %errorlevel% equ 0 (
    echo ========================================
    echo   SUCCESS! Code pushed to GitHub
    echo   Render and Vercel will auto-deploy
    echo ========================================
) else (
    echo ========================================
    echo   ERROR! Push failed
    echo   Check the error message above
    echo ========================================
)

echo.
pause
