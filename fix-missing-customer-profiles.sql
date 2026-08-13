-- Fix profiles that exist but don't have customer_profiles records
-- This addresses the "invalid input syntax for type uuid: undefined" issue

-- Create customer_profiles for any customer profile that doesn't have one
INSERT INTO customer_profiles (user_id, facepay_id, facepay_enabled, transaction_limit)
SELECT 
  p.id as user_id,
  'FP-' || EXTRACT(epoch FROM now()) || '-' || substring(p.id::text, 1, 8) as facepay_id,
  false as facepay_enabled, -- Start disabled, can be enabled by auto-enable feature
  10000 as transaction_limit
FROM profiles p
LEFT JOIN customer_profiles cp ON cp.user_id = p.id
WHERE p.role = 'customer' 
  AND cp.id IS NULL;

-- Verify the fix
SELECT 
  'Fixed Profiles' as status,
  p.email,
  p.full_name,
  cp.id as customer_profile_id,
  cp.facepay_id,
  cp.facepay_enabled
FROM profiles p
INNER JOIN customer_profiles cp ON cp.user_id = p.id
WHERE p.role = 'customer'
ORDER BY cp.created_at DESC;