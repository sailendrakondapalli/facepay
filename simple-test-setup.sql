-- Simple test customer setup - run these queries one by one

-- 1. First, check what profiles exist
SELECT 'Existing Profiles' as info, id, email, full_name, role, created_at 
FROM profiles 
WHERE role = 'customer' 
ORDER BY created_at DESC 
LIMIT 5;

-- 2. Check which profiles have customer_profiles
SELECT 'Profiles with Customer Data' as info, 
       p.email, 
       p.full_name,
       cp.id as customer_profile_id,
       cp.facepay_enabled
FROM profiles p
LEFT JOIN customer_profiles cp ON cp.user_id = p.id
WHERE p.role = 'customer'
ORDER BY p.created_at DESC
LIMIT 5;

-- 3. If you need to create a test customer, use this (replace email/name):
-- INSERT INTO profiles (id, role, full_name, email)
-- VALUES (uuid_generate_v4(), 'customer', 'Bot Test', 'bot@test.com');

-- 4. Then create the customer profile for that user:
-- INSERT INTO customer_profiles (user_id, facepay_id, facepay_enabled, transaction_limit)
-- SELECT p.id, 'FP-BOT-TEST', false, 10000
-- FROM profiles p 
-- WHERE p.email = 'bot@test.com';

-- 5. Verify the setup:
-- SELECT p.email, p.full_name, cp.facepay_id, cp.facepay_enabled
-- FROM profiles p
-- INNER JOIN customer_profiles cp ON cp.user_id = p.id
-- WHERE p.email = 'bot@test.com';