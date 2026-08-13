-- Debug customer status - replace 'your-email@gmail.com' with actual email
-- This will show exactly what the system sees for a customer

-- Replace this with the actual email you're testing with
-- Example: SET @test_email = 'sailendra@gmail.com';
SET @test_email = 'sailendra@gmail.com'; -- Update this with your actual email

-- Check profile existence
SELECT 'Profile Check' as check_type, 
       p.id as user_id,
       p.email, 
       p.full_name, 
       p.created_at
FROM profiles p 
WHERE p.email = @test_email;

-- Check customer profile
SELECT 'Customer Profile Check' as check_type,
       cp.id as customer_profile_id,
       cp.user_id,
       cp.facepay_id,
       cp.facepay_enabled,
       cp.transaction_limit,
       cp.created_at
FROM customer_profiles cp
JOIN profiles p ON cp.user_id = p.id
WHERE p.email = @test_email;

-- Check biometric enrollments
SELECT 'Biometric Check' as check_type,
       cb.id,
       cb.user_id,
       cb.created_at,
       cb.quality_score
FROM customer_biometrics cb
JOIN profiles p ON cb.user_id = p.id
WHERE p.email = @test_email;

-- Check WebAuthn credentials
SELECT 'WebAuthn Check' as check_type,
       wc.id,
       wc.user_id,
       wc.credential_name,
       wc.authenticator_name,
       wc.created_at
FROM webauthn_credentials wc
JOIN profiles p ON wc.user_id = p.id
WHERE p.email = @test_email;

-- Summary for this customer
SELECT 'Summary' as check_type,
       p.email,
       p.full_name,
       cp.facepay_enabled,
       cp.transaction_limit,
       COUNT(DISTINCT cb.id) as face_enrollments,
       COUNT(DISTINCT wc.id) as webauthn_credentials,
       CASE 
         WHEN cp.facepay_enabled = false THEN 'FacePay Disabled'
         WHEN cp.facepay_enabled IS NULL THEN 'No Customer Profile'
         WHEN COUNT(DISTINCT cb.id) = 0 AND COUNT(DISTINCT wc.id) = 0 THEN 'No Biometrics Registered'
         WHEN COUNT(DISTINCT cb.id) > 0 AND COUNT(DISTINCT wc.id) > 0 THEN 'Full Biometric Setup'
         WHEN COUNT(DISTINCT cb.id) > 0 THEN 'Face Recognition Only'
         WHEN COUNT(DISTINCT wc.id) > 0 THEN 'Device Biometric Only'
         ELSE 'Unknown Status'
       END as status
FROM profiles p
LEFT JOIN customer_profiles cp ON cp.user_id = p.id
LEFT JOIN customer_biometrics cb ON cb.user_id = p.id
LEFT JOIN webauthn_credentials wc ON wc.user_id = p.id
WHERE p.email = @test_email
GROUP BY p.id, p.email, p.full_name, cp.facepay_enabled, cp.transaction_limit;