-- Fix RPC Functions - Column Name Mismatch Issue
-- Run this to fix the "structure of query does not match function result type" error

-- ========================================
-- Drop old functions first
-- ========================================
DROP FUNCTION IF EXISTS match_face_embedding(vector, numeric, integer);
DROP FUNCTION IF EXISTS verify_face_embedding(uuid, vector, numeric);

-- ========================================
-- Recreate match_face_embedding with correct column names
-- ========================================
CREATE OR REPLACE FUNCTION match_face_embedding(
  query_embedding vector(512),
  match_threshold numeric DEFAULT 0.85,
  match_count integer DEFAULT 1
)
RETURNS TABLE (
  customer_id uuid,
  customer_profile_id uuid,
  similarity_score double precision,
  match_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cb.user_id AS customer_id,
    cb.customer_profile_id AS customer_profile_id,
    (1 - (cb.face_embedding <=> query_embedding))::double precision AS similarity_score,
    CASE 
      WHEN (1 - (cb.face_embedding <=> query_embedding)) >= match_threshold THEN 'MATCH'
      ELSE 'NO_MATCH'
    END AS match_status
  FROM customer_biometrics cb
  INNER JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
  WHERE cp.facepay_enabled = true
  ORDER BY cb.face_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ========================================
-- Recreate verify_face_embedding with correct column names
-- ========================================
CREATE OR REPLACE FUNCTION verify_face_embedding(
  customer_profile_id_param uuid,
  query_embedding vector(512),
  verification_threshold numeric DEFAULT 0.90
)
RETURNS TABLE (
  similarity_score double precision,
  verification_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (1 - (cb.face_embedding <=> query_embedding))::double precision AS similarity_score,
    CASE 
      WHEN (1 - (cb.face_embedding <=> query_embedding)) >= verification_threshold THEN 'VERIFIED'
      ELSE 'FAILED'
    END AS verification_status
  FROM customer_biometrics cb
  WHERE cb.customer_profile_id = customer_profile_id_param;
END;
$$;

-- ========================================
-- Test the fixed functions
-- ========================================
SELECT 'RPC functions recreated successfully!' as status;

-- Test match_face_embedding exists
SELECT routine_name, '✅ Function exists' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'match_face_embedding';

-- Test verify_face_embedding exists
SELECT routine_name, '✅ Function exists' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'verify_face_embedding';

-- Test with real data (if exists)
DO $$
DECLARE
  test_embedding vector(512);
  test_customer_profile_id uuid;
  result_row RECORD;
BEGIN
  -- Get a test embedding from database
  SELECT face_embedding, customer_profile_id 
  INTO test_embedding, test_customer_profile_id
  FROM customer_biometrics 
  LIMIT 1;
  
  IF test_embedding IS NOT NULL THEN
    RAISE NOTICE '✅ Found test embedding for customer: %', test_customer_profile_id;
    
    -- Test match_face_embedding
    RAISE NOTICE 'Testing match_face_embedding...';
    FOR result_row IN 
      SELECT * FROM match_face_embedding(test_embedding, 0.85, 1)
    LOOP
      RAISE NOTICE '✅ match_face_embedding returned: customer_id=%, similarity_score=%, match_status=%', 
        result_row.customer_id, result_row.similarity_score, result_row.match_status;
    END LOOP;
    
    -- Test verify_face_embedding
    RAISE NOTICE 'Testing verify_face_embedding...';
    FOR result_row IN 
      SELECT * FROM verify_face_embedding(test_customer_profile_id, test_embedding, 0.90)
    LOOP
      RAISE NOTICE '✅ verify_face_embedding returned: similarity_score=%, verification_status=%', 
        result_row.similarity_score, result_row.verification_status;
    END LOOP;
    
    RAISE NOTICE '✅ All RPC functions tested successfully!';
  ELSE
    RAISE NOTICE '⚠️  No test data found. Register a customer to test RPC functions.';
  END IF;
END $$;

SELECT '✅ Fix complete! Try face identification again.' as next_step;
