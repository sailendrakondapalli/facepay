-- ========================================
-- TEST NEW EMBEDDINGS - Verify Real MediaPipe Data
-- ========================================
-- Run this to check if new enrollments are using REAL MediaPipe embeddings

-- Step 1: Check how many biometric records exist
SELECT 
    '📊 Current biometric records:' as status,
    COUNT(*) as total_records
FROM customer_biometrics;

-- Step 2: Get the most recent enrollment
SELECT 
    '🆕 Most recent enrollment:' as status,
    cb.id,
    cb.customer_profile_id,
    cb.quality,
    cb.model_name,
    cb.model_version,
    cb.created_at,
    cp.full_name
FROM customer_biometrics cb
JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
ORDER BY cb.created_at DESC
LIMIT 1;

-- Step 3: Sample the embedding (first 10 values) to check if it's real data
SELECT 
    '🔍 Embedding sample (first 10 values):' as status,
    cb.customer_profile_id,
    (cb.face_embedding::text::json->0)::float as val_0,
    (cb.face_embedding::text::json->1)::float as val_1,
    (cb.face_embedding::text::json->2)::float as val_2,
    (cb.face_embedding::text::json->3)::float as val_3,
    (cb.face_embedding::text::json->4)::float as val_4,
    (cb.face_embedding::text::json->5)::float as val_5,
    (cb.face_embedding::text::json->6)::float as val_6,
    (cb.face_embedding::text::json->7)::float as val_7,
    (cb.face_embedding::text::json->8)::float as val_8,
    (cb.face_embedding::text::json->9)::float as val_9
FROM customer_biometrics cb
ORDER BY cb.created_at DESC
LIMIT 1;

-- Step 4: Check embedding statistics (variance indicates real vs random)
WITH embedding_stats AS (
    SELECT 
        customer_profile_id,
        -- Calculate variance of first 50 values
        (SELECT variance(val::float)
         FROM unnest(
             array(SELECT json_array_elements_text(face_embedding::text::json))
         ) WITH ORDINALITY AS t(val, ord)
         WHERE t.ord <= 50
        ) as variance_50,
        -- Check if all values are identical (bad sign)
        (SELECT COUNT(DISTINCT val::float)
         FROM unnest(
             array(SELECT json_array_elements_text(face_embedding::text::json))
         ) WITH ORDINALITY AS t(val, ord)
         WHERE t.ord <= 50
        ) as unique_values_50
    FROM customer_biometrics
    ORDER BY created_at DESC
    LIMIT 1
)
SELECT 
    '📈 Embedding quality check:' as status,
    variance_50,
    unique_values_50,
    CASE 
        WHEN variance_50 > 0.001 AND unique_values_50 > 10 THEN '✅ REAL MediaPipe data - Good variation!'
        WHEN variance_50 < 0.0001 THEN '❌ BAD - Low variance (may be random/placeholder)'
        WHEN unique_values_50 < 5 THEN '❌ BAD - Too few unique values'
        ELSE '⚠️  UNCLEAR - Borderline quality'
    END as quality_assessment
FROM embedding_stats;

-- ========================================
-- INTERPRETATION:
-- ✅ variance_50 > 0.001 AND unique_values_50 > 10 = REAL MediaPipe
-- ❌ variance_50 < 0.0001 = Placeholder/random data
-- ❌ unique_values_50 < 5 = All values too similar
-- ========================================

SELECT '✅ Analysis complete!' as result;
