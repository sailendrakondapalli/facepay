#!/usr/bin/env python3
"""
Setup basic database tables for face recognition system
"""
import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

def setup_basic_tables():
    """Setup basic tables without pgvector dependency"""
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
    
    if not url or not key:
        print("ERROR: Missing Supabase credentials")
        return False
    
    try:
        client = create_client(url, key)
        
        # Create users table
        print("Creating users table...")
        users_sql = """
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            is_active BOOLEAN DEFAULT TRUE
        )
        """
        
        result = client.rpc('exec_sql', {'sql': users_sql}).execute()
        print("✓ Users table created")
        
        # Create face_embeddings table (using TEXT for embeddings initially)
        print("Creating face_embeddings table...")
        embeddings_sql = """
        CREATE TABLE IF NOT EXISTS face_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            embedding TEXT NOT NULL,  -- Store as JSON text for now
            quality_score FLOAT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            metadata TEXT DEFAULT '{}'
        )
        """
        
        result = client.rpc('exec_sql', {'sql': embeddings_sql}).execute()
        print("✓ Face embeddings table created")
        
        # Create indexes
        print("Creating indexes...")
        indexes_sql = """
        CREATE INDEX IF NOT EXISTS face_embeddings_user_id_idx ON face_embeddings(user_id);
        CREATE INDEX IF NOT EXISTS users_user_id_idx ON users(user_id);
        """
        
        result = client.rpc('exec_sql', {'sql': indexes_sql}).execute()
        print("✓ Indexes created")
        
        print("\n✓ Basic database setup completed successfully!")
        return True
        
    except Exception as e:
        print(f"Error during database setup: {e}")
        
        # Try using direct table creation via Supabase (fallback)
        print("Trying fallback method...")
        try:
            # Just try to create a simple test table to verify permissions
            client.table('users').select('*').limit(1).execute()
            print("Database accessible - manual setup may be required")
            print("Please create tables manually in Supabase dashboard or SQL editor")
            return False
        except Exception as e2:
            print(f"Fallback also failed: {e2}")
            return False

if __name__ == "__main__":
    print("=== Face Recognition Database Setup ===\n")
    
    success = setup_basic_tables()
    
    if success:
        print("\nNext steps:")
        print("1. ✓ Database tables created")
        print("2. Run 'py database.py' to test the connection")
        print("3. Continue with face recognition integration")
    else:
        print("\nManual setup required:")
        print("1. Go to your Supabase project dashboard")
        print("2. Open the SQL Editor")  
        print("3. Run the SQL in 'setup_database.sql'")
        print("4. Then run 'py database.py' to test")