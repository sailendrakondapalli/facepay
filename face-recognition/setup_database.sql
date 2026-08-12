-- Face Recognition Database Schema Setup
-- Run this in Supabase SQL Editor

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Face embeddings table
CREATE TABLE IF NOT EXISTS face_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    embedding VECTOR(128) NOT NULL,
    quality_score FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS face_embeddings_embedding_idx 
ON face_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS face_embeddings_user_id_idx ON face_embeddings(user_id);
CREATE INDEX IF NOT EXISTS users_user_id_idx ON users(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
CREATE POLICY "Enable read access for all users" ON users
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for own records" ON users
    FOR UPDATE USING (true);

-- Create RLS policies for face_embeddings table
CREATE POLICY "Enable read access for all users" ON face_embeddings
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON face_embeddings
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for own records" ON face_embeddings
    FOR UPDATE USING (true);

-- Create function for face embedding similarity search
CREATE OR REPLACE FUNCTION match_face_embeddings(
    query_embedding VECTOR(128),
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_name TEXT,
    embedding VECTOR(128),
    similarity FLOAT,
    quality_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
AS $$
    SELECT
        fe.id,
        fe.user_id,
        u.name as user_name,
        fe.embedding,
        1 - (fe.embedding <=> query_embedding) as similarity,
        fe.quality_score,
        fe.created_at
    FROM face_embeddings fe
    JOIN users u ON fe.user_id = u.id
    WHERE 1 - (fe.embedding <=> query_embedding) > match_threshold
    AND u.is_active = TRUE
    ORDER BY similarity DESC
    LIMIT match_count;
$$;

-- Grant permissions (adjust as needed for your security requirements)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE users TO anon, authenticated;
GRANT ALL ON TABLE face_embeddings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_face_embeddings TO anon, authenticated;

-- Insert some sample data for testing (optional)
-- INSERT INTO users (user_id, name) VALUES 
-- ('test_user_1', 'John Doe'),
-- ('test_user_2', 'Jane Smith');

COMMENT ON TABLE users IS 'Registered users for face recognition system';
COMMENT ON TABLE face_embeddings IS 'Face embeddings extracted from user photos';
COMMENT ON FUNCTION match_face_embeddings IS 'Similarity search function for face recognition';