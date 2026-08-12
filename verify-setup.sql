-- FacePay Setup Verification Script
-- Run this in Supabase SQL Editor after completing setup

-- ========================================
-- 1. CHECK PGVECTOR EXTENSION
-- ========================================
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ pgvector extension is enabled'
    ELSE '❌ pgvector extension NOT enabled - Run enable-pgvector.sql'
  END AS status
FROM pg_extension 
WHERE extname = 'vector';

-- ========================================
-- 2. CHECK ALL REQUIRED TABLES EXIST
-- ========================================
SELECT 
  table_name,
  CASE 
    WHEN table_name IS NOT NULL THEN '✅ Exists'
    ELSE '❌ Missing'
  END AS status
FROM (
  SELECT 'profiles' AS table_name UNION ALL
  SELECT 'customer_profiles' UNION ALL
  SELECT 'merchant_profiles' UNION ALL
  SELECT 'customer_biometrics' UNION ALL
  SELECT 'transactions' UNION ALL
  SELECT 'biometric_audit_log'
) AS required_tables
LEFT JOIN information_schema.tables t 
  ON t.table_name = required_tables.table_name 
  AND t.table_schema = 'public'
ORDER BY required_tables.table_name;

-- ========================================
-- 3. CHECK VECTOR COLUMN EXISTS
-- ========================================
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN data_type = 'USER-DEFINED' AND udt_name = 'vector' 
    THEN '✅ Vector column configured correctly'
    ELSE '❌ Vector column issue'
  END AS status
FROM information_schema.columns
WHERE table_name = 'customer_biometrics' 
  AND column_name = 'face_embedding';

-- ========================================
-- 4. CHECK RPC FUNCTIONS EXIST
-- ========================================
SELECT 
  routine_name,
  routine_type,
  '✅ Function exists' AS status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('match_face_embedding', 'verify_face_embedding')
ORDER BY routine_name;

-- ========================================
-- 5. CHECK VECTOR INDEX EXISTS
-- ========================================
SELECT 
  indexname,
  tablename,
  '✅ HNSW index exists for fast similarity search' AS status
FROM pg_indexes 
WHERE tablename = 'customer_biometrics' 
  AND indexname = 'customer_biometrics_embedding_idx';

-- ========================================
-- 6. CHECK ROW LEVEL SECURITY STATUS
-- ========================================
SELECT 
  tablename,
  rowsecurity AS rls_enabled,
  CASE 
    WHEN NOT rowsecurity THEN '✅ RLS disabled (development mode)'
    ELSE '⚠️ RLS enabled'
  END AS status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('profiles', 'customer_profiles', 'merchant_profiles', 'customer_biometrics', 'transactions', 'biometric_audit_log')
ORDER BY tablename;

-- ========================================
-- 7. CHECK STORAGE BUCKET (optional)
-- ========================================
SELECT 
  name AS bucket_name,
  public,
  file_size_limit,
  '✅ Bucket exists' AS status
FROM storage.buckets 
WHERE name = 'biometric-images';

-- ========================================
-- 8. COUNT ENROLLED CUSTOMERS
-- ========================================
SELECT 
  COUNT(*) AS enrolled_customers,
  CASE 
    WHEN COUNT(*) = 0 THEN '⚠️ No customers enrolled yet - Register a test customer'
    ELSE '✅ Customers enrolled'
  END AS status
FROM customer_biometrics;

-- ========================================
-- 9. VIEW ENROLLED CUSTOMERS (if any)
-- ========================================
SELECT 
  p.full_name,
  cp.facepay_id,
  cb.quality_score,
  cb.model_name,
  cp.facepay_enabled,
  cb.created_at
FROM customer_biometrics cb
JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
JOIN profiles p ON cb.user_id = p.id
ORDER BY cb.created_at DESC;

-- ========================================
-- 10. CHECK RECENT AUDIT LOG ENTRIES
-- ========================================
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
-- SUMMARY
-- ========================================
-- If all checks pass with ✅, your system is ready!
-- If you see ❌, follow the instructions in SETUP_CHECKLIST.md
