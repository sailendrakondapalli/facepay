#!/usr/bin/env python3
"""
Simple database connection test
"""
import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

print("=== Database Connection Test ===")

# Print environment variables (masked for security)
url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_KEY')

print(f"SUPABASE_URL: {url[:30] + '...' if url else 'NOT SET'}")
print(f"SUPABASE_KEY: {key[:20] + '...' if key else 'NOT SET'}")

if not url or not key:
    print("ERROR: Missing Supabase credentials in .env file")
    print("Required variables: SUPABASE_URL, SUPABASE_KEY")
    exit(1)

try:
    # Try to create client
    print("\nTrying to create Supabase client...")
    client = create_client(url, key)
    print("✓ Supabase client created successfully")
    
    # Try a simple query
    print("\nTrying to query users table...")
    result = client.table('users').select('*').limit(1).execute()
    print(f"✓ Query successful: {len(result.data)} records returned")
    
    print("\n✓ Database connection test PASSED")
    
except Exception as e:
    print(f"\n✗ Database connection test FAILED: {e}")
    print(f"Error type: {type(e).__name__}")
    
    # Additional debugging
    if "Invalid URL" in str(e):
        print(f"The URL '{url}' appears to be invalid")
        print("Make sure it follows the format: https://xxxxx.supabase.co")
    
    exit(1)