@echo off
echo ========================================
echo Deploying WebAuthn Edge Functions
echo ========================================
echo.

echo Step 1: Login to Supabase
supabase login

echo.
echo Step 2: Link to project
supabase link --project-ref elepidjpvuywldsnaetd

echo.
echo Step 3: Deploy Edge Functions
echo.

echo Deploying webauthn-register-begin...
supabase functions deploy webauthn-register-begin

echo.
echo Deploying webauthn-register-complete...
supabase functions deploy webauthn-register-complete

echo.
echo Deploying webauthn-authenticate-begin...
supabase functions deploy webauthn-authenticate-begin

echo.
echo Deploying webauthn-authenticate-complete...
supabase functions deploy webauthn-authenticate-complete

echo.
echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Visit https://facepay-kappa.vercel.app
echo 2. Login as customer
echo 3. Go to Customer Dashboard
echo 4. Try registering Windows Hello / Touch ID
echo.
pause
