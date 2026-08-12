# 🗄️ Database Setup Guide

## Quick Decision: Which Script Should You Run?

### ✅ **Run `migrate-existing-database.sql`** if:
- You already have `profiles`, `customer_profiles`, `merchant_profiles`, and `transactions` tables
- You have existing data (customers, merchants, transactions) that you want to keep
- You just need to add the new biometric columns and tables

### ✅ **Run `src/lib/schema.sql`** if:
- This is a fresh Supabase project
- You want to start completely from scratch
- You don't mind losing existing test data

---

## Option A: Migrate Existing Database (Recommended)

This is the **safest option** if you have any existing data.

### Step 1: Run the Migration Script

1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd/sql
2. Click **New Query**
3. Open the file: `migrate-existing-database.sql`
4. Copy the **ENTIRE CONTENT**
5. Paste into SQL Editor
6. Click **Run** (or press Ctrl+Enter)

### Step 2: Verify Success

You should see output like:
```
✅ Added biometric_similarity column
✅ Added transaction_nonce column
✅ Added first_scan_timestamp column
✅ Added verification_timestamp column
✅ customer_biometrics table created
✅ biometric_audit_log table created
✅ HNSW index created
✅ RPC functions created
✅ Migration completed successfully!
```

### Step 3: Create Storage Bucket

1. Go to Storage: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd/storage
2. Click **Create a new bucket**
3. Name: `biometric-images`
4. Public: **OFF** (keep private)
5. File size limit: `5 MB`
6. Allowed MIME types: `image/jpeg, image/png`
7. Click **Create bucket**

---

## Option B: Fresh Install (Clean Slate)

Use this if you want to completely reset the database.

### ⚠️ Warning: This will DELETE all existing data!

### Step 1: (Optional) Backup Existing Data

If you want to backup first:
```sql
-- Copy these results and save them somewhere
SELECT * FROM profiles;
SELECT * FROM customer_profiles;
SELECT * FROM merchant_profiles;
SELECT * FROM transactions;
```

### Step 2: Drop Existing Tables

```sql
DROP TABLE IF EXISTS biometric_audit_log CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS customer_biometrics CASCADE;
DROP TABLE IF EXISTS merchant_profiles CASCADE;
DROP TABLE IF EXISTS customer_profiles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
```

### Step 3: Run Complete Schema

1. Go to Supabase SQL Editor
2. Open file: `src/lib/schema.sql`
3. Copy the **ENTIRE CONTENT**
4. Paste into SQL Editor
5. Click **Run**

### Step 4: Create Storage Bucket

(Same as Option A, Step 3 above)

---

## Verification

After running either option, verify your setup:

### Run Verification Script

1. Go to Supabase SQL Editor
2. Open file: `verify-setup.sql`
3. Copy and paste into SQL Editor
4. Run it

### Expected Results:

```
✅ pgvector extension is enabled
✅ All 6 tables exist
✅ Vector column configured correctly
✅ Both RPC functions exist
✅ HNSW index exists for fast similarity search
✅ RLS disabled (development mode)
✅ Storage bucket exists
```

---

## What Each Script Does

### `migrate-existing-database.sql`
- ✅ Enables pgvector extension
- ✅ Adds missing columns to `transactions` table
- ✅ Creates `customer_biometrics` table
- ✅ Creates `biometric_audit_log` table
- ✅ Creates HNSW vector index
- ✅ Creates RPC functions for face matching
- ✅ Disables RLS for development
- ✅ **Preserves all existing data**

### `src/lib/schema.sql`
- ✅ Enables pgvector extension
- ✅ Creates ALL tables from scratch
- ✅ Creates HNSW vector index
- ✅ Creates RPC functions
- ✅ Disables RLS for development
- ❌ **Requires empty database or will conflict**

---

## After Database Setup

### Clear Old Test Data (If Any)

If you registered any customers before the pgvector fix, their embeddings are in the wrong format. Clear them:

```sql
-- Option 1: Clear everything
DELETE FROM biometric_audit_log;
DELETE FROM customer_biometrics;
DELETE FROM customer_profiles WHERE user_id IN (SELECT id FROM profiles WHERE role = 'customer');
DELETE FROM profiles WHERE role = 'customer';

-- Option 2: Just clear biometrics (keeps profiles)
DELETE FROM customer_biometrics;
DELETE FROM biometric_audit_log WHERE action IN ('enroll', 'identify', 'verify');
```

### Test Complete Flow

1. **Register Customer**:
   - Go to http://localhost:5174
   - Click "Register as Customer"
   - Complete all 4 steps including biometric capture
   - Check browser console: Should see "Biometric enrollment successful"

2. **Verify in Database**:
   ```sql
   SELECT 
     p.full_name,
     cp.facepay_id,
     cb.quality_score,
     cb.face_embedding::text LIKE '[%' as format_correct
   FROM customer_biometrics cb
   JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
   JOIN profiles p ON cb.user_id = p.id;
   ```
   `format_correct` should be `true`

3. **Test Merchant Flow**:
   - Register/login as merchant
   - Click "SCAN CUSTOMER"
   - Should identify the customer by face
   - Enter amount and complete transaction

---

## Troubleshooting

### Error: "column already exists"
**Solution**: You're trying to add a column that already exists. This is normal if you ran the migration multiple times. The script handles this gracefully.

### Error: "table already exists"
**Solution**: Your database already has tables. Use `migrate-existing-database.sql` instead of `schema.sql`.

### Error: "type vector does not exist"
**Solution**: pgvector extension not enabled. Run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Error: "relation customer_biometrics does not exist"
**Solution**: Table not created yet. Run the migration or schema script.

### Error: "function match_face_embedding does not exist"
**Solution**: RPC functions not created. Run the migration or schema script.

---

## Summary

| Situation | Script to Run | Will It Delete Data? |
|-----------|---------------|---------------------|
| Existing database with data | `migrate-existing-database.sql` | ❌ No - Adds columns & tables |
| Fresh database | `src/lib/schema.sql` | N/A - Nothing to delete |
| Want to start over | Drop tables + `src/lib/schema.sql` | ✅ Yes - Intentional reset |

**Recommended for most users**: Run `migrate-existing-database.sql` - it's safe and won't delete anything!
