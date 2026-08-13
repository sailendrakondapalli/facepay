-- Create a test customer for testing the device biometric payment
-- Replace the email and name with your actual test data

-- Step 1: Insert profile (if it doesn't exist)
INSERT INTO profiles (id, role, full_name, email, phone)
SELECT 
  uuid_generate_v4(),
  'customer',
  'Test Bot Customer',
  'bot@test.com', -- Change this to your test email
  '+1234567890'
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE email = 'bot@test.com' -- Change this to match your test email
);

-- Step 2: Insert customer profile linked to the profile
INSERT INTO customer_profiles (user_id, facepay_id, facepay_enabled, transaction_limit)
SELECT 
  p.id,
  'FP-TEST-BOT-' || EXTRACT(epoch FROM now())::text,
  false, -- Start disabled so we can test the auto-enable feature
  10000
FROM profiles p 
WHERE p.email = 'bot@test.com' -- Change this to match your test email
AND NOT EXISTS (
  SELECT 1 FROM customer_profiles cp WHERE cp.user_id = p.id
);

-- Step 3: Verify the setup
SELECT 
  'Test Customer Setup' as status,
  p.id as user_id,
  p.email,
  p.full_name,
  cp.id as customer_profile_id,
  cp.facepay_id,
  cp.facepay_enabled,
  cp.transaction_limit
FROM profiles p
INNER JOIN customer_profiles cp ON cp.user_id = p.id
WHERE p.email = 'bot@test.com'; -- Change this to match your test email