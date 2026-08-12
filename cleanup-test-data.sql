-- Cleanup Test Data Script
-- Use this to clear all test data and start fresh after the pgvector format fix

-- ========================================
-- OPTION 1: Clear ALL data (complete reset)
-- ========================================
-- Uncomment these lines to delete everything:

-- DELETE FROM biometric_audit_log;
-- DELETE FROM transactions;
-- DELETE FROM customer_biometrics;
-- DELETE FROM merchant_profiles;
-- DELETE FROM customer_profiles;
-- DELETE FROM profiles;

-- ========================================
-- OPTION 2: Clear only biometric datain
-- ========================================
-- Use this if you want to keep profiles but re-enroll biometrics:

-- DELETE FROM biometric_audit_log WHERE action IN ('enroll', 'identify', 'verify');
-- DELETE FROM customer_biometrics;

-- ========================================
-- OPTION 3: Clear specific customer
-- ========================================
-- Replace 'customer-email@example.com' with actual email:

-- DELETE FROM customer_biometrics 
-- WHERE user_id IN (
--   SELECT id FROM profiles WHERE email = 'customer-email@example.com'
-- );

-- ========================================
-- VIEW CURRENT DATA
-- ========================================

-- View all customers with biometric data
SELECT 
  p.id as user_id,
  p.full_name,
  p.email,
  cp.facepay_id,
  cb.quality_score,
  cb.model_name,
  LEFT(cb.face_embedding::text, 50) || '...' as embedding_preview,
  cb.face_embedding::text LIKE '[%' AND cb.face_embedding::text LIKE '%]' as format_correct,
  cb.created_at as enrolled_at
FROM profiles p
JOIN customer_profiles cp ON p.id = cp.user_id
LEFT JOIN customer_biometrics cb ON p.id = cb.user_id
WHERE p.role = 'customer'
ORDER BY p.created_at DESC;

-- View all merchants
SELECT 
  p.id,
  p.full_name,
  p.email,
  mp.business_name,
  mp.merchant_id,
  p.created_at
FROM profiles p
JOIN merchant_profiles mp ON p.id = mp.user_id
WHERE p.role = 'merchant'
ORDER BY p.created_at DESC;

-- View recent audit log
SELECT 
  action,
  success,
  similarity_score,
  error_message,
  created_at
FROM biometric_audit_log
ORDER BY created_at DESC
LIMIT 20;

-- View recent transactions
SELECT 
  t.transaction_id,
  t.amount,
  t.status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'transactions' AND column_name = 'biometric_similarity'
    ) THEN (SELECT biometric_similarity FROM transactions WHERE id = t.id)
    ELSE NULL 
  END as biometric_similarity,
  cp.facepay_id as customer_facepay_id,
  mp.business_name as merchant_name,
  t.created_at
FROM transactions t
LEFT JOIN customer_profiles cp ON t.customer_id = cp.id
LEFT JOIN merchant_profiles mp ON t.merchant_id = mp.id
ORDER BY t.created_at DESC
LIMIT 20;

-- ========================================
-- TEST QUERIES
-- ========================================

-- Test 1: Count enrolled customers
SELECT COUNT(*) as enrolled_customers FROM customer_biometrics;

-- Test 2: Check embedding format
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN face_embedding::text LIKE '[%' AND face_embedding::text LIKE '%]' THEN 1 ELSE 0 END) as correct_format,
  SUM(CASE WHEN face_embedding::text LIKE '"[%' THEN 1 ELSE 0 END) as wrong_format_with_quotes
FROM customer_biometrics;

-- Test 3: Check if RPC functions exist and work
SELECT routine_name, routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('match_face_embedding', 'verify_face_embedding');

-- ========================================
-- NOTES
-- ========================================

-- After running cleanup:
-- 1. Go to http://localhost:5174
-- 2. Register new customer with biometric data
-- 3. Login as merchant
-- 4. Try to identify the customer
-- 5. Complete a transaction

-- If you see errors:
-- 1. Check browser console (F12)
-- 2. Check Edge Function logs: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd/functions
-- 3. Check this audit log for error messages
