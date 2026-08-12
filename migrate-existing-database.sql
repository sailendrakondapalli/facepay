-- Migration Script for Existing FacePay Database
-- Run this if you already have tables but they're missing the new biometric columns

-- ========================================
-- STEP 1: Enable pgvector extension
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Test pgvector
SELECT '[1]'::vector <-> '[2]'::vector AS distance_test;

-- ========================================
-- STEP 2: Add missing columns to transactions table
-- ========================================

-- Check if biometric_similarity column exists, if not add it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'biometric_similarity'
  ) THEN
    ALTER TABLE transactions ADD COLUMN biometric_similarity numeric;
    RAISE NOTICE 'Added biometric_similarity column';
  ELSE
    RAISE NOTICE 'biometric_similarity column already exists';
  END IF;
END $$;

-- Check if transaction_nonce column exists, if not add it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'transaction_nonce'
  ) THEN
    ALTER TABLE transactions ADD COLUMN transaction_nonce text;
    RAISE NOTICE 'Added transaction_nonce column';
  ELSE
    RAISE NOTICE 'transaction_nonce column already exists';
  END IF;
END $$;

-- Check if first_scan_timestamp column exists, if not add it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'first_scan_timestamp'
  ) THEN
    ALTER TABLE transactions ADD COLUMN first_scan_timestamp timestamptz;
    RAISE NOTICE 'Added first_scan_timestamp column';
  ELSE
    RAISE NOTICE 'first_scan_timestamp column already exists';
  END IF;
END $$;

-- Check if verification_timestamp column exists, if not add it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'verification_timestamp'
  ) THEN
    ALTER TABLE transactions ADD COLUMN verification_timestamp timestamptz;
    RAISE NOTICE 'Added verification_timestamp column';
  ELSE
    RAISE NOTICE 'verification_timestamp column already exists';
  END IF;
END $$;

-- ========================================
-- STEP 3: Create customer_biometrics table if not exists
-- ========================================
CREATE TABLE IF NOT EXISTS customer_biometrics (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade unique,
  customer_profile_id uuid references customer_profiles(id) on delete cascade,
  face_embedding vector(512), -- 512-dimensional face embedding
  model_name text not null default 'mediapipe-facemesh',
  embedding_version text not null default 'v1.0',
  quality_score numeric, -- Face image quality score (0-1)
  enrollment_image_path text, -- Optional: path to enrollment image
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- STEP 4: Create biometric_audit_log table if not exists
-- ========================================
CREATE TABLE IF NOT EXISTS biometric_audit_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id),
  action text not null, -- 'enroll', 'identify', 'verify', 'liveness_check'
  success boolean not null,
  similarity_score numeric,
  error_message text,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

-- ========================================
-- STEP 5: Create vector similarity index for fast face matching
-- ========================================
CREATE INDEX IF NOT EXISTS customer_biometrics_embedding_idx 
ON customer_biometrics 
USING hnsw (face_embedding vector_cosine_ops);

-- ========================================
-- STEP 6: Disable RLS for development
-- ========================================
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_biometrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_audit_log DISABLE ROW LEVEL SECURITY;

-- ========================================
-- STEP 7: Create or replace RPC functions
-- ========================================

-- Secure RPC function for face matching (1:N identification)
CREATE OR REPLACE FUNCTION match_face_embedding(
  query_embedding vector(512),
  match_threshold numeric DEFAULT 0.85,
  match_count integer DEFAULT 1
)
RETURNS TABLE (
  customer_id uuid,
  customer_profile_id uuid,
  similarity_score numeric,
  match_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cb.user_id,
    cb.customer_profile_id,
    1 - (cb.face_embedding <=> query_embedding) AS similarity,
    CASE 
      WHEN (1 - (cb.face_embedding <=> query_embedding)) >= match_threshold THEN 'MATCH'
      ELSE 'NO_MATCH'
    END AS status
  FROM customer_biometrics cb
  INNER JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
  WHERE cp.facepay_enabled = true
  ORDER BY cb.face_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Secure RPC function for face verification (1:1 verification)
CREATE OR REPLACE FUNCTION verify_face_embedding(
  customer_profile_id_param uuid,
  query_embedding vector(512),
  verification_threshold numeric DEFAULT 0.90
)
RETURNS TABLE (
  similarity_score numeric,
  verification_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    1 - (cb.face_embedding <=> query_embedding) AS similarity,
    CASE 
      WHEN (1 - (cb.face_embedding <=> query_embedding)) >= verification_threshold THEN 'VERIFIED'
      ELSE 'FAILED'
    END AS status
  FROM customer_biometrics cb
  WHERE cb.customer_profile_id = customer_profile_id_param;
END;
$$;

-- ========================================
-- STEP 8: Verification
-- ========================================

-- Check all required tables exist
SELECT 
  table_name,
  '✅ Exists' as status
FROM (
  SELECT 'profiles' AS table_name UNION ALL
  SELECT 'customer_profiles' UNION ALL
  SELECT 'merchant_profiles' UNION ALL
  SELECT 'customer_biometrics' UNION ALL
  SELECT 'transactions' UNION ALL
  SELECT 'biometric_audit_log'
) AS required_tables
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables t 
  WHERE t.table_name = required_tables.table_name 
  AND t.table_schema = 'public'
);

-- Check all required columns in transactions
SELECT 
  column_name,
  data_type,
  '✅ Exists' as status
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN (
    'biometric_similarity',
    'transaction_nonce',
    'first_scan_timestamp',
    'verification_timestamp'
  )
ORDER BY column_name;

-- Check customer_biometrics columns
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN data_type = 'USER-DEFINED' AND udt_name = 'vector' 
    THEN '✅ Vector type'
    ELSE '✅ ' || data_type
  END as status
FROM information_schema.columns
WHERE table_name = 'customer_biometrics'
ORDER BY ordinal_position;

-- Check RPC functions
SELECT 
  routine_name,
  '✅ Function exists' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('match_face_embedding', 'verify_face_embedding')
ORDER BY routine_name;

-- Check vector index
SELECT 
  indexname,
  '✅ HNSW index exists' as status
FROM pg_indexes 
WHERE tablename = 'customer_biometrics' 
  AND indexname = 'customer_biometrics_embedding_idx';

-- ========================================
-- SUMMARY
-- ========================================
SELECT 
  '✅ Migration completed successfully!' as message,
  'Your database is now ready for real biometric face recognition' as next_step;
