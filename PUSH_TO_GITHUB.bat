@echo off
echo ============================================================
echo   FacePay - Push Entire Project to GitHub
echo   Repository: https://github.com/sailendrakondapalli/facepay.git
echo ============================================================
echo.

cd /d "%~dp0"

echo Step 1: Initializing Git repository...
git init
echo.

echo Step 2: Adding all files...
git add .
echo.

echo Step 3: Committing files...
git commit -m "FacePay biometric payment system with YuNet+SFace - Production ready"
echo.

echo Step 4: Setting remote repository...
git remote remove origin 2>nul
git remote add origin https://github.com/sailendrakondapalli/facepay.git
echo.

echo Step 5: Setting main branch...
git branch -M main
echo.

echo Step 6: Pushing to GitHub (this may take a minute)...
git push -u origin main --force
echo.

if %errorlevel% equ 0 (
    echo ============================================================
    echo   SUCCESS! Your project is now on GitHub!
    echo   View it at: https://github.com/sailendrakondapalli/facepay
    echo.
    echo   Next steps:
    echo   1. Go to Render.com and deploy the backend
    echo   2. Go to Vercel.com and deploy the frontend
    echo   3. Read DEPLOY_TO_EXISTING_REPO.md for full instructions
    echo ============================================================
) else (
    echo ============================================================
    echo   ERROR! Push failed.
    echo   
    echo   Common fixes:
    echo   1. Make sure you're logged into GitHub
    echo   2. Check your internet connection
    echo   3. Verify the repository exists at:
    echo      https://github.com/sailendrakondapalli/facepay
    echo ============================================================
)

echo.
echo Press any key to exit...
pause >nul
