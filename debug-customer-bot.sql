-- Debug the specific customer that's causing issues
-- This query will help identify why customerProfile.id is undefined

-- Look for customers with "Bot" in their name or email
SELECT 
  'Profile Search' as search_type,
  p.id as user_id,
  p.email,
  p.full_name,
  p.role,
  cp.id as customer_profile_id,
  cp.facepay_id,
  cp.facepay_enabled,
  cp.transaction_limit
FROM profiles p
LEFT JOIN customer_profiles cp ON cp.user_id = p.id
WHERE LOWER(p.full_name) LIKE '%bot%' 
   OR LOWER(p.email) LIKE '%bot%'
   OR cp.facepay_id LIKE '%bot%';

-- Look for ALL customer profiles to see the structure
SELECT 
  'All Customers' as search_type,
  p.id as user_id,
  p.email,
  p.full_name,
  cp.id as customer_profile_id,
  cp.facepay_id,
  cp.facepay_enabled,
  CASE 
    WHEN cp.id IS NULL THEN 'NO_CUSTOMER_PROFILE'
    WHEN cp.facepay_enabled = false THEN 'FACEPAY_DISABLED'
    ELSE 'FACEPAY_ENABLED'
  END as status
FROM profiles p
LEFT JOIN customer_profiles cp ON cp.user_id = p.id
WHERE p.role = 'customer'
ORDER BY p.created_at DESC
LIMIT 10;

-- Check if there are profiles without customer_profiles
SELECT 
  'Missing Customer Profiles' as search_type,
  p.id as user_id,
  p.email,
  p.full_name,
  p.role
FROM profiles p
LEFT JOIN customer_profiles cp ON cp.user_id = p.id
WHERE p.role = 'customer' AND cp.id IS NULL;