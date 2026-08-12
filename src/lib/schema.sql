-- FacePay Database Schema with Real Biometric Support
-- Run this in your Supabase SQL editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Profiles table (shared for both roles)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null check (role in ('customer', 'merchant')),
  full_name text,
  email text,
  phone text,
  created_at timestamptz default now()
);

-- Customer profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade unique,
  facepay_id text unique,
  face_reference text,
  payment_identifier text,
  transaction_limit numeric default 1000,
  facepay_enabled boolean default true,
  created_at timestamptz default now()
);

-- Merchant profiles
CREATE TABLE IF NOT EXISTS merchant_profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade unique,
  business_name text,
  business_address text,
  merchant_id text unique,
  created_at timestamptz default now()
);

-- Biometric embeddings table for face recognition
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

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id uuid default uuid_generate_v4() primary key,
  transaction_id text unique,
  customer_id uuid references customer_profiles(id),
  merchant_id uuid references merchant_profiles(id),
  amount numeric not null,
  currency text default 'INR',
  status text default 'SUCCESS',
  authentication_method text default 'BIOMETRIC_VERIFIED',
  biometric_similarity numeric, -- Similarity score from face matching
  transaction_nonce text, -- Cryptographic nonce for 1:1 verification
  first_scan_timestamp timestamptz, -- When 1:N identification occurred
  verification_timestamp timestamptz, -- When 1:1 verification occurred
  created_at timestamptz default now()
);

-- Biometric audit log for security
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

-- Create vector similarity index for fast face matching
CREATE INDEX IF NOT EXISTS customer_biometrics_embedding_idx 
ON customer_biometrics 
USING hnsw (face_embedding vector_cosine_ops);

-- Row Level Security (disabled for now during development)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_biometrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_audit_log DISABLE ROW LEVEL SECURITY;

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
