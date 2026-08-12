-- ========================================
-- CLEAR BAD EMBEDDINGS FROM PLACEHOLDER IMPLEMENTATION
-- ========================================
-- This removes all random/placeholder embeddings that cause false positives
-- Run this before re-registering users with real MediaPipe face recognition

-- Step 1: Backup count before deletion
SELECT 'Before cleanup:' as status,
       COUNT(*) as biometric_records 
FROM customer_biometrics;

SELECT 'Before cleanup:' as status,
       COUNT(*) as audit_records 
FROM biometric_audit_log;

-- Step 2: Delete all bad biometric data
DELETE FROM customer_biometrics;
DELETE FROM biometric_audit_log;

-- Step 3: Verify cleanup
SELECT '✅ After cleanup:' as status,
       COUNT(*) as biometric_records 
FROM customer_biometrics;

SELECT '✅ After cleanup:' as status,
       COUNT(*) as audit_records 
FROM biometric_audit_log;

-- Step 4: Keep customer profiles intact (they can re-register their face)
SELECT '✅ Customer profiles preserved:' as status,
       COUNT(*) as customer_count 
FROM customer_profiles;

-- ========================================
-- NEXT STEPS:
-- 1. Users must re-register their biometric data
-- 2. New enrollments will use REAL MediaPipe face recognition
-- 3. Test with two different people - similarity should be <70%
-- ========================================

SELECT '✅ Database cleaned! Ready for real MediaPipe enrollment.' as next_step;
