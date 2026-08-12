-- Diagnostic Script for Biometric Issues
-- Run this to understand why face matching is failing

-- ========================================
-- 1. CHECK IF CUSTOMER HAS BIOMETRIC DATA
-- ========================================
SELECT 
  'STEP 1: Check enrolled customers' as diagnostic_step;

SELECT 
  p.id as user_id,
  p.full_name,
  p.email,
  cp.id as customer_profile_id,
  cp.facepay_id,
  cp.facepay_enabled,
  cb.id as biometric_id,
  cb.quality_score,
  cb.model_name,
  CASE 
    WHEN cb.face_embedding IS NULL THEN '❌ No embedding'
    WHEN cb.face_embedding::text LIKE '[%' AND cb.face_embedding::text LIKE '%]' THEN '✅ Correct format'
    ELSE '❌ Wrong format: ' || LEFT(cb.face_embedding::text, 50)
  END as embedding_status,
  cb.created_at as enrolled_at
FROM profiles p
LEFT JOIN customer_profiles cp ON p.id = cp.user_id
LEFT JOIN customer_biometrics cb ON p.id = cb.user_id
WHERE p.role = 'customer'
ORDER BY p.created_at DESC;

-- ========================================
-- 2. CHECK IF RPC FUNCTIONS EXIST
-- ========================================
SELECT 
  'STEP 2: Check RPC functions' as diagnostic_step;

SELECT 
  routine_name,
  routine_type,
  data_type as return_type,
  '✅ Exists' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('match_face_embedding', 'verify_face_embedding')
ORDER BY routine_name;

-- ========================================
-- 3. CHECK VECTOR INDEX
-- ========================================
SELECT 
  'STEP 3: Check vector index' as diagnostic_step;

SELECT 
  indexname,
  indexdef,
  '✅ Exists' as status
FROM pg_indexes 
WHERE tablename = 'customer_biometrics';

-- ========================================
-- 4. TEST RPC FUNCTION (if embeddings exist)
-- ========================================
SELECT 
  'STEP 4: Test RPC function with real data' as diagnostic_step;

DO $$
DECLARE
  test_embedding vector(512);
  test_customer_id uuid;
BEGIN
  -- Get a real embedding from the database
  SELECT face_embedding, customer_profile_id 
  INTO test_embedding, test_customer_id
  FROM customer_biometrics 
  LIMIT 1;
  
  IF test_embedding IS NOT NULL THEN
    RAISE NOTICE 'Found test embedding for customer: %', test_customer_id;
    RAISE NOTICE 'Embedding format: %', LEFT(test_embedding::text, 100);
    
    -- Test match_face_embedding function
    RAISE NOTICE 'Testing match_face_embedding...';
    PERFORM * FROM match_face_embedding(test_embedding, 0.85, 1);
    RAISE NOTICE '✅ match_face_embedding executed successfully';
    
    -- Test verify_face_embedding function
    RAISE NOTICE 'Testing verify_face_embedding...';
    PERFORM * FROM verify_face_embedding(test_customer_id, test_embedding, 0.90);
    RAISE NOTICE '✅ verify_face_embedding executed successfully';
  ELSE
    RAISE NOTICE '❌ No embeddings found in database. You need to register a customer first.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ RPC function test failed: %', SQLERRM;
END $$;

-- ========================================
-- 5. CHECK RECENT AUDIT LOG
-- ========================================
SELECT 
  'STEP 5: Recent biometric operations' as diagnostic_step;

SELECT 
  action,
  success,
  similarity_score,
  error_message,
  created_at
FROM biometric_audit_log
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- 6. CHECK IF CUSTOMER IS FACEPAY ENABLED
-- ========================================
SELECT 
  'STEP 6: Check FacePay enabled status' as diagnostic_step;

SELECT 
  p.full_name,
  cp.facepay_id,
  cp.facepay_enabled,
  CASE 
    WHEN cp.facepay_enabled THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as status
FROM customer_profiles cp
JOIN profiles p ON cp.user_id = p.id
ORDER BY cp.created_at DESC;

-- ========================================
-- 7. CHECK TABLE STRUCTURE
-- ========================================
SELECT 
  'STEP 7: customer_biometrics table structure' as diagnostic_step;

SELECT 
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'customer_biometrics'
ORDER BY ordinal_position;

-- ========================================
-- SUMMARY & RECOMMENDATIONS
-- ========================================
SELECT 
  'DIAGNOSTICS COMPLETE' as status,
  'Check the results above for ❌ marks' as next_step;

-- Common Issues and Solutions:
-- 
-- Issue 1: "No embedding" or "No embeddings found"
-- Solution: Register a customer through the UI with biometric capture
--
-- Issue 2: "Wrong format" in embedding_status
-- Solution: Delete old embeddings and re-register:
--   DELETE FROM customer_biometrics;
--   Then register again through UI
--
-- Issue 3: RPC functions don't exist
-- Solution: Run migrate-existing-database.sql
--
-- Issue 4: "Disabled" in FacePay enabled status
-- Solution: Update customer profile:
--   UPDATE customer_profiles SET facepay_enabled = true WHERE id = 'customer-id';
--
-- Issue 5: RPC function test fails
-- Solution: Check error message and verify pgvector extension is enabled:
--   SELECT * FROM pg_extension WHERE extname = 'vector';
