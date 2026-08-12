-- Debug False Positive Issue
-- This checks why unregistered faces are being matched

-- ========================================
-- 1. CHECK HOW MANY CUSTOMERS ARE ENROLLED
-- ========================================
SELECT 
  'STEP 1: Enrolled customers' as step;

SELECT 
  COUNT(*) as total_enrolled_customers,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ No customers enrolled!'
    WHEN COUNT(*) = 1 THEN '⚠️ Only 1 customer - any face might match!'
    ELSE '✅ Multiple customers enrolled'
  END as status
FROM customer_biometrics;

-- ========================================
-- 2. CHECK RECENT IDENTIFICATION ATTEMPTS
-- ========================================
SELECT 
  'STEP 2: Recent identification attempts' as step;

SELECT 
  action,
  success,
  similarity_score,
  error_message,
  created_at,
  CASE 
    WHEN similarity_score > 0.85 AND success = true THEN '✅ Valid match'
    WHEN similarity_score > 0.85 AND success = false THEN '❌ False positive!'
    WHEN similarity_score < 0.85 THEN '✅ Correctly rejected'
    ELSE '⚠️ Unknown'
  END as match_assessment
FROM biometric_audit_log
WHERE action = 'identify'
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- 3. CHECK WHAT CUSTOMER IS BEING RETURNED
-- ========================================
SELECT 
  'STEP 3: Check enrolled customer details' as step;

SELECT 
  p.full_name,
  p.email,
  cp.facepay_id,
  cp.facepay_enabled,
  cb.quality_score as enrollment_quality,
  cb.created_at as enrolled_at
FROM customer_biometrics cb
JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
JOIN profiles p ON cb.user_id = p.id
ORDER BY cb.created_at DESC;

-- ========================================
-- 4. TEST: Simulate matching with itself
-- ========================================
SELECT 
  'STEP 4: Test self-matching (should be ~100%)' as step;

DO $$
DECLARE
  test_embedding vector(512);
  test_customer_name text;
  result_row RECORD;
BEGIN
  -- Get the enrolled customer's embedding
  SELECT cb.face_embedding, p.full_name
  INTO test_embedding, test_customer_name
  FROM customer_biometrics cb
  JOIN profiles p ON cb.user_id = p.id
  LIMIT 1;
  
  IF test_embedding IS NOT NULL THEN
    RAISE NOTICE 'Testing self-match for customer: %', test_customer_name;
    
    -- Test matching the same embedding (should be 100% similarity)
    FOR result_row IN 
      SELECT * FROM match_face_embedding(test_embedding, 0.85, 1)
    LOOP
      RAISE NOTICE 'Self-match result: similarity_score=%, match_status=%', 
        result_row.similarity_score, result_row.match_status;
        
      IF result_row.similarity_score < 0.99 THEN
        RAISE NOTICE '❌ WARNING: Self-match similarity is too low! Should be ~1.0';
      ELSE
        RAISE NOTICE '✅ Self-match works correctly';
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE '❌ No enrolled customers found';
  END IF;
END $$;

-- ========================================
-- 5. CHECK THRESHOLD SETTINGS
-- ========================================
SELECT 
  'STEP 5: Threshold analysis' as step;

SELECT 
  '0.85 (Current identification threshold)' as threshold_type,
  'Any face with >85% similarity will match' as meaning,
  '⚠️ May be too low if embeddings are poor quality' as warning;

-- ========================================
-- RECOMMENDATIONS
-- ========================================
SELECT 
  'DIAGNOSIS COMPLETE' as status;

-- Possible causes of false positives:
-- 
-- 1. ONLY ONE CUSTOMER ENROLLED
--    If only 1 customer is enrolled, the system has nothing to compare against.
--    The RPC function will return the closest match even if it's a poor match.
--    Solution: The Edge Function should check if similarity is above threshold.
--
-- 2. POOR QUALITY EMBEDDINGS
--    If the enrolled embedding is poor quality (low resolution, bad lighting),
--    it might match many different faces.
--    Solution: Increase enrollment quality threshold.
--
-- 3. THRESHOLD TOO LOW
--    0.85 similarity might be too permissive.
--    Solution: Increase threshold to 0.90 or higher.
--
-- 4. EMBEDDING GENERATION BUG
--    If embeddings are not being generated correctly (all zeros, random),
--    any face would match.
--    Solution: Check embedding values.
--
-- 5. EDGE FUNCTION NOT CHECKING THRESHOLD
--    If the Edge Function returns any result regardless of similarity,
--    false positives will occur.
--    Solution: Edge Function must reject matches below threshold.
