-- Enable pgvector extension for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Test that pgvector is working
SELECT '[1]'::vector <-> '[2]'::vector AS distance_test;