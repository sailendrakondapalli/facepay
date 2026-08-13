-- Enable FacePay for all existing customers
-- Run this to fix "FacePay is disabled for this customer" error

-- Update all customer profiles to enable FacePay
UPDATE customer_profiles 
SET facepay_enabled = true
WHERE facepay_enabled = false;

-- Also ensure transaction limits are set
UPDATE customer_profiles 
SET transaction_limit = 10000
WHERE transaction_limit IS NULL OR transaction_limit = 0;

-- Check the results
SELECT 
    cp.id,
    p.full_name,
    p.email,
    cp.facepay_id,
    cp.facepay_enabled,
    cp.transaction_limit,
    -- Check if they have biometric data
    (SELECT COUNT(*) FROM customer_biometrics cb WHERE cb.user_id = p.id) as face_enrollments,
    -- Check if they have WebAuthn credentials  
    (SELECT COUNT(*) FROM webauthn_credentials wc WHERE wc.user_id = p.id) as webauthn_credentials
FROM customer_profiles cp
JOIN profiles p ON cp.user_id = p.id
ORDER BY p.created_at DESC
LIMIT 10;