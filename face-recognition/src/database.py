"""
Database manager for face recognition system
Handles user registration and face embedding storage in Supabase/PostgreSQL
"""
import os
import logging
import json
import numpy as np
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class DatabaseManager:
    """Database manager for face recognition system"""
    
    def __init__(self):
        """Initialize database connection"""
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_ANON_KEY') or os.getenv('SUPABASE_KEY')
        self.supabase_service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not all([self.supabase_url, self.supabase_key]):
            raise ValueError("Missing Supabase configuration in environment variables")
        
        # Initialize Supabase client - supabase-py 2.x uses different initialization
        try:
            # Try the create_client factory function (recommended way)
            from supabase import create_client
            self.client = create_client(self.supabase_url, self.supabase_key)
            logging.info("Supabase client initialized successfully")
        except Exception as e:
            logging.error(f"Failed to initialize Supabase client: {e}")
            logging.warning("Continuing without database - face recognition will work but data won't persist")
            self.client = None
            self.admin_client = None
            return
        
        # Use service role for admin operations if available
        if self.supabase_service_key:
            try:
                self.admin_client = create_client(self.supabase_url, self.supabase_service_key)
                logging.info("Admin client initialized with service role key")
            except Exception as e:
                logging.warning(f"Admin client initialization failed: {e}")
                self.admin_client = self.client
        else:
            self.admin_client = self.client
            logging.warning("No service role key provided - using anon key for all operations")
        
        logging.info("Database manager initialized")
    
    def test_connection(self) -> bool:
        """Test database connection"""
        if not self.client:
            return False
        try:
            # Try a simple query
            result = self.client.table('users').select('count').execute()
            logging.info("Database connection successful")
            return True
        except Exception as e:
            logging.error(f"Database connection failed: {e}")
            return False
    
    def setup_database(self) -> bool:
        """
        Setup database schema for face recognition
        Creates tables if they don't exist
        """
        try:
            # Note: In Supabase, we typically create tables via the dashboard or SQL editor
            # This function documents the required schema
            
            schema_sql = """
            -- Enable pgvector extension
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
            
            -- Create index for vector similarity search
            CREATE INDEX IF NOT EXISTS face_embeddings_embedding_idx 
            ON face_embeddings USING ivfflat (embedding vector_cosine_ops) 
            WITH (lists = 100);
            
            -- Create index for user lookups
            CREATE INDEX IF NOT EXISTS face_embeddings_user_id_idx ON face_embeddings(user_id);
            CREATE INDEX IF NOT EXISTS users_user_id_idx ON users(user_id);
            
            -- Enable Row Level Security (optional)
            ALTER TABLE users ENABLE ROW LEVEL SECURITY;
            ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY;
            """
            
            logging.info("Database schema setup completed (run schema manually in Supabase SQL editor)")
            print("\n" + "="*60)
            print("IMPORTANT: Run this SQL in your Supabase SQL Editor:")
            print("="*60)
            print(schema_sql)
            print("="*60)
            
            return True
            
        except Exception as e:
            logging.error(f"Database setup failed: {e}")
            return False
    
    def register_user(self, user_id: str, name: str) -> Optional[str]:
        """
        Register a new user
        
        Args:
            user_id: Unique user identifier
            name: User's full name
            
        Returns:
            User UUID if successful, None if failed
        """
        try:
            # Check if user already exists
            existing = self.client.table('users').select('id').eq('user_id', user_id).execute()
            
            if existing.data:
                logging.warning(f"User {user_id} already exists")
                return existing.data[0]['id']
            
            # Insert new user
            result = self.client.table('users').insert({
                'user_id': user_id,
                'name': name,
                'created_at': datetime.now().isoformat(),
                'is_active': True
            }).execute()
            
            if result.data:
                user_uuid = result.data[0]['id']
                logging.info(f"User registered successfully: {user_id} -> {user_uuid}")
                return user_uuid
            
            return None
            
        except Exception as e:
            logging.error(f"User registration failed: {e}")
            return None
    
    def store_face_embedding(self, user_uuid: str, embedding: np.ndarray, 
                           quality_score: float, metadata: Dict = None) -> bool:
        """
        Store face embedding for a user
        
        Args:
            user_uuid: User's UUID from users table
            embedding: Face embedding vector (128-dimensional)
            quality_score: Quality score of the face image
            metadata: Additional metadata (processing info, etc.)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Validate embedding
            if not isinstance(embedding, np.ndarray) or embedding.size != 128:
                raise ValueError(f"Invalid embedding: expected 128-dimensional array, got {embedding.shape}")
            
            # Convert embedding to JSON string for storage
            import json
            embedding_json = json.dumps(embedding.flatten().astype(float).tolist())
            
            # Convert metadata to ensure JSON serializable types
            clean_metadata = self._clean_metadata_for_json(metadata or {})
            
            # Insert embedding
            result = self.client.table('face_embeddings').insert({
                'user_id': user_uuid,
                'embedding': embedding_json,
                'quality_score': float(quality_score),
                'created_at': datetime.now().isoformat(),
                'metadata': clean_metadata
            }).execute()
            
            if result.data:
                logging.info(f"Face embedding stored for user {user_uuid}")
                return True
            
            return False
            
        except Exception as e:
            logging.error(f"Failed to store face embedding: {e}")
            return False
    
    def _clean_metadata_for_json(self, metadata: dict) -> dict:
        """
        Clean metadata dictionary to ensure all values are JSON serializable
        
        Args:
            metadata: Original metadata dictionary
            
        Returns:
            Cleaned metadata dictionary with JSON-serializable types
        """
        def convert_value(value):
            """Convert a single value to JSON serializable type"""
            if isinstance(value, np.integer):
                return int(value)
            elif isinstance(value, np.floating):
                return float(value)
            elif isinstance(value, np.ndarray):
                return value.tolist()
            elif isinstance(value, list):
                return [convert_value(item) for item in value]
            elif isinstance(value, dict):
                return {k: convert_value(v) for k, v in value.items()}
            else:
                return value
        
        return {k: convert_value(v) for k, v in metadata.items()}
    
    def get_user_embeddings(self, user_id: str) -> List[Dict]:
        """
        Get all embeddings for a specific user
        
        Args:
            user_id: User identifier
            
        Returns:
            List of embedding records
        """
        try:
            # Join users and face_embeddings tables
            result = self.client.table('face_embeddings').select(
                'id, embedding, quality_score, created_at, metadata, users!inner(user_id, name)'
            ).eq('users.user_id', user_id).execute()
            
            if result.data:
                # Convert embedding lists back to numpy arrays
                for record in result.data:
                    record['embedding'] = np.array(record['embedding'], dtype=np.float32)
                
                return result.data
            
            return []
            
        except Exception as e:
            logging.error(f"Failed to get user embeddings: {e}")
            return []
    
    def get_all_embeddings(self) -> List[Dict]:
        """
        Get all embeddings from database for recognition
        
        Returns:
            List of all embedding records with user info
        """
        try:
            result = self.client.table('face_embeddings').select(
                'id, embedding, quality_score, created_at, metadata, users!inner(id, user_id, name)'
            ).execute()
            
            if result.data:
                # Convert embedding lists back to numpy arrays
                for record in result.data:
                    try:
                        # Handle both list format and string format
                        embedding_data = record['embedding']
                        if isinstance(embedding_data, str):
                            # Parse string representation of list
                            import json
                            embedding_list = json.loads(embedding_data)
                        else:
                            embedding_list = embedding_data
                        
                        record['embedding'] = np.array(embedding_list, dtype=np.float32)
                    except Exception as e:
                        logging.error(f"Failed to parse embedding for record {record.get('id')}: {e}")
                        continue
                
                logging.info(f"Retrieved {len(result.data)} embeddings from database")
                return result.data
            
            return []
            
        except Exception as e:
            logging.error(f"Failed to get all embeddings: {e}")
            return []
    
    def find_similar_embeddings(self, query_embedding: np.ndarray, 
                              threshold: float = 0.5, limit: int = 10) -> List[Dict]:
        """
        Find similar embeddings using vector similarity search
        
        Args:
            query_embedding: Query embedding to search for
            threshold: Similarity threshold (0.0 to 1.0)
            limit: Maximum number of results
            
        Returns:
            List of similar embedding records with similarity scores
        """
        try:
            # Convert embedding to list
            embedding_list = query_embedding.flatten().tolist()
            
            # Use pgvector similarity search
            # Note: This requires pgvector extension and proper indexing
            result = self.client.rpc('match_face_embeddings', {
                'query_embedding': embedding_list,
                'match_threshold': threshold,
                'match_count': limit
            }).execute()
            
            if result.data:
                # Convert embedding lists back to numpy arrays
                for record in result.data:
                    if 'embedding' in record:
                        record['embedding'] = np.array(record['embedding'], dtype=np.float32)
                
                return result.data
            
            return []
            
        except Exception as e:
            logging.error(f"Similarity search failed: {e}")
            # Fallback to getting all embeddings and computing similarity manually
            return self._fallback_similarity_search(query_embedding, threshold, limit)
    
    def _fallback_similarity_search(self, query_embedding: np.ndarray, 
                                   threshold: float, limit: int) -> List[Dict]:
        """Fallback similarity search using manual computation"""
        try:
            from recognizer import FaceRecognizer
            
            all_embeddings = self.get_all_embeddings()
            similarities = []
            
            # Create a temporary recognizer for similarity computation
            # (Note: This is not ideal, but works as fallback)
            for record in all_embeddings:
                stored_embedding = record['embedding']
                
                # Calculate cosine similarity manually
                query_norm = query_embedding / np.linalg.norm(query_embedding)
                stored_norm = stored_embedding / np.linalg.norm(stored_embedding)
                similarity = np.dot(query_norm, stored_norm)
                
                if similarity >= threshold:
                    record['similarity'] = float(similarity)
                    similarities.append(record)
            
            # Sort by similarity (highest first)
            similarities.sort(key=lambda x: x['similarity'], reverse=True)
            
            return similarities[:limit]
            
        except Exception as e:
            logging.error(f"Fallback similarity search failed: {e}")
            return []
    
    def get_user_count(self) -> int:
        """Get total number of registered users"""
        try:
            result = self.client.table('users').select('id', count='exact').execute()
            return result.count or 0
        except Exception as e:
            logging.error(f"Failed to get user count: {e}")
            return 0
    
    def get_embedding_count(self) -> int:
        """Get total number of stored embeddings"""
        try:
            result = self.client.table('face_embeddings').select('id', count='exact').execute()
            return result.count or 0
        except Exception as e:
            logging.error(f"Failed to get embedding count: {e}")
            return 0
    
    def delete_user(self, user_id: str) -> bool:
        """Delete user and all associated embeddings"""
        try:
            result = self.client.table('users').delete().eq('user_id', user_id).execute()
            if result.data:
                logging.info(f"User {user_id} deleted successfully")
                return True
            return False
        except Exception as e:
            logging.error(f"Failed to delete user: {e}")
            return False
    
    def get_database_stats(self) -> Dict:
        """Get comprehensive database statistics"""
        return {
            'total_users': self.get_user_count(),
            'total_embeddings': self.get_embedding_count(),
            'avg_embeddings_per_user': self.get_embedding_count() / max(self.get_user_count(), 1),
            'connection_status': self.test_connection()
        }


def create_vector_similarity_function():
    """
    SQL function for vector similarity search with pgvector
    Run this in Supabase SQL Editor after setting up the schema
    """
    return """
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
    """


def main():
    """Test database functionality"""
    logging.basicConfig(level=logging.INFO)
    
    print("Database Manager Test")
    
    # Check environment variables
    required_vars = ['SUPABASE_URL', 'SUPABASE_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print(f"ERROR: Missing environment variables: {missing_vars}")
        print("Please update your .env file with Supabase credentials")
        return
    
    try:
        # Initialize database manager
        db = DatabaseManager()
        
        # Test connection
        if not db.test_connection():
            print("Failed to connect to database")
            return
        
        print("✓ Database connection successful")
        
        # Show setup instructions
        db.setup_database()
        
        # Show database statistics
        stats = db.get_database_stats()
        print(f"\nDatabase Statistics:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        
        # Show SQL function for similarity search
        print("\n" + "="*60)
        print("ALSO RUN THIS SQL FUNCTION IN SUPABASE:")
        print("="*60)
        print(create_vector_similarity_function())
        print("="*60)
        
        print("\n✓ Database manager test completed")
        print("\nNext steps:")
        print("1. Run the SQL schema in Supabase SQL Editor")
        print("2. Run the similarity function in Supabase SQL Editor")
        print("3. Test user registration and embedding storage")
        
    except Exception as e:
        logging.error(f"Database test failed: {e}")
        print(f"Database test failed: {e}")


if __name__ == "__main__":
    main()