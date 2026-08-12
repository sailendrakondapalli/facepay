# 🐛 Debugging "Face matching failed" 500 Error

## Step-by-Step Debugging Process

### Step 1: Run Database Diagnostics

1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd/sql
2. Open file: `diagnose-biometric-issue.sql`
3. Copy and paste into SQL Editor
4. Click "Run"

This will show you:
- ✅ If customers are enrolled with biometric data
- ✅ If embeddings are in correct format `[1,2,3,...]`
- ✅ If RPC functions exist and work
- ✅ If vector index is created
- ✅ Recent audit log errors

**Look for any ❌ marks** in the results and follow the recommendations.

---

### Step 2: Check Browser Console (Enhanced Logging)

I've added better error logging to the API. Now when you try to identify a face:

1. Open browser (http://localhost:5174)
2. Open Developer Tools (F12)
3. Go to Console tab
4. Try merchant face identification
5. Look for detailed error message like:

```javascript
identifyFace API error: {
  status: 500,
  statusText: "Internal Server Error",
  error: {
    error: "Face matching failed",
    details: "actual error message here"
  },
  url: "https://elepidjpvuywldsnaetd.supabase.co/functions/v1/identify-face"
}
```

The `details` field will tell you the exact problem.

---

### Step 3: Check Edge Function Logs

1. Go to Edge Function Logs: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd/functions/identify-face/logs
2. Look for recent errors
3. Check what the actual server error is

Common errors you might see:

#### Error: "function match_face_embedding does not exist"
**Cause**: RPC functions not created  
**Fix**: Run `migrate-existing-database.sql`

#### Error: "type vector does not exist"
**Cause**: pgvector extension not enabled  
**Fix**: Run `CREATE EXTENSION IF NOT EXISTS vector;`

#### Error: "column face_embedding does not exist"
**Cause**: customer_biometrics table not created  
**Fix**: Run `migrate-existing-database.sql`

#### Error: "No rows returned" or empty result
**Cause**: No customers enrolled OR embeddings in wrong format  
**Fix**: Register a customer or clear and re-register

#### Error: "invalid input syntax for type vector"
**Cause**: Embedding stored in wrong format  
**Fix**: Delete and re-enroll customer

---

### Step 4: Common Issues & Fixes

#### Issue A: No Customer Enrolled

**Symptom**: Diagnostic shows "No embeddings found"

**Fix**:
1. Go to http://localhost:5174
2. Register as customer
3. Complete biometric capture step
4. Check browser console for "Biometric enrollment successful"
5. Verify in database:
```sql
SELECT COUNT(*) FROM customer_biometrics;
```
Should return 1 or more.

---

#### Issue B: Embedding in Wrong Format

**Symptom**: Diagnostic shows "Wrong format" or embedding looks like `"[1,2,3]"` with quotes

**Fix**:
```sql
-- Clear bad embeddings
DELETE FROM customer_biometrics;

-- Then register again through UI
```

---

#### Issue C: Customer Not FacePay Enabled

**Symptom**: Diagnostic shows "❌ Disabled" in FacePay status

**Fix**:
```sql
UPDATE customer_profiles 
SET facepay_enabled = true 
WHERE facepay_enabled = false;
```

---

#### Issue D: RPC Function Fails

**Symptom**: Diagnostic shows RPC test failed with error message

**Common Causes**:

1. **pgvector not enabled**:
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
-- If empty, run:
CREATE EXTENSION IF NOT EXISTS vector;
```

2. **Wrong embedding format in database**:
```sql
-- Check format
SELECT 
  face_embedding::text LIKE '[%' AND face_embedding::text LIKE '%]' as correct_format
FROM customer_biometrics;

-- If false, delete and re-enroll
DELETE FROM customer_biometrics;
```

3. **customer_profile_id mismatch**:
```sql
-- Verify foreign keys are correct
SELECT 
  cb.id,
  cb.user_id,
  cb.customer_profile_id,
  cp.id as actual_profile_id,
  CASE 
    WHEN cb.customer_profile_id = cp.id THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as fk_status
FROM customer_biometrics cb
LEFT JOIN customer_profiles cp ON cb.customer_profile_id = cp.id;
```

---

### Step 5: Test RPC Functions Manually

After fixing issues, test the RPC functions directly in SQL Editor:

```sql
-- Get a test embedding from database
DO $$
DECLARE
  test_embedding vector(512);
BEGIN
  SELECT face_embedding INTO test_embedding 
  FROM customer_biometrics 
  LIMIT 1;
  
  IF test_embedding IS NOT NULL THEN
    -- Test match function
    RAISE NOTICE 'Testing match_face_embedding...';
    
    -- This should return the customer
    PERFORM * FROM match_face_embedding(test_embedding, 0.85, 1);
    
    RAISE NOTICE 'RPC function works!';
  END IF;
END $$;
```

If this works in SQL Editor but fails from Edge Function, the problem is in the Edge Function itself.

---

### Step 6: Verify Edge Function Deployment

Check if Edge Functions are deployed correctly:

```bash
supabase functions list
```

Should show all 3 functions as ACTIVE.

If not, redeploy:
```bash
supabase functions deploy enroll-face
supabase functions deploy identify-face
supabase functions deploy verify-face
```

---

### Step 7: Check Storage Bucket

If enrollment fails, check if storage bucket exists:

1. Go to: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd/storage
2. Verify `biometric-images` bucket exists
3. Should be **Private** (not public)

If missing, create it:
- Name: `biometric-images`
- Public: OFF
- File size limit: 5 MB

---

## Quick Fixes Checklist

Run these in order:

### ✅ 1. Verify Database Setup
```sql
-- Run diagnose-biometric-issue.sql
-- Look for ❌ marks
```

### ✅ 2. Ensure pgvector Enabled
```sql
CREATE EXTENSION IF NOT EXISTS vector;
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### ✅ 3. Run Migration if Needed
```sql
-- If tables/columns missing, run migrate-existing-database.sql
```

### ✅ 4. Clear Bad Data
```sql
DELETE FROM customer_biometrics;
DELETE FROM biometric_audit_log;
```

### ✅ 5. Re-register Customer
- Go to http://localhost:5174
- Register new customer with biometric capture
- Check console for success message

### ✅ 6. Test Identification
- Login as merchant
- Click "SCAN CUSTOMER"
- Should work now

---

## Still Having Issues?

### Check All These:

1. ✅ pgvector extension enabled
2. ✅ customer_biometrics table exists with vector(512) column
3. ✅ RPC functions (match_face_embedding, verify_face_embedding) exist
4. ✅ HNSW index created on face_embedding column
5. ✅ At least one customer enrolled
6. ✅ Embedding in correct format `[1,2,3,...]`
7. ✅ Customer has facepay_enabled = true
8. ✅ Edge Functions deployed and ACTIVE
9. ✅ Storage bucket created (biometric-images)
10. ✅ Environment variables set with VITE_ prefix

Run this comprehensive check:
```sql
-- Copy and run verify-setup.sql
-- Should show all ✅
```

---

## Last Resort: Complete Reset

If nothing works, do a complete reset:

```sql
-- 1. Drop everything
DROP TABLE IF EXISTS biometric_audit_log CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS customer_biometrics CASCADE;
DROP TABLE IF EXISTS merchant_profiles CASCADE;
DROP TABLE IF EXISTS customer_profiles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. Drop functions
DROP FUNCTION IF EXISTS match_face_embedding CASCADE;
DROP FUNCTION IF EXISTS verify_face_embedding CASCADE;

-- 3. Run complete schema
-- Copy and run src/lib/schema.sql

-- 4. Redeploy Edge Functions
-- supabase functions deploy enroll-face
-- supabase functions deploy identify-face
-- supabase functions deploy verify-face

-- 5. Register new customer and test
```

---

## Success Indicators

When everything works correctly, you should see:

✅ **Registration**:
- Browser console: "Biometric enrollment successful"
- No errors in console

✅ **Database**:
```sql
SELECT face_embedding::text LIKE '[%' as correct_format 
FROM customer_biometrics;
-- Returns: true
```

✅ **Identification**:
- Merchant scans face
- Customer identified within 1-2 seconds
- Shows name, FacePay ID, similarity score (>85%)

✅ **Edge Function Logs**:
- No errors in Supabase function logs
- Shows successful identification events

✅ **Audit Log**:
```sql
SELECT * FROM biometric_audit_log 
WHERE action = 'identify' AND success = true
ORDER BY created_at DESC LIMIT 1;
-- Returns: recent successful identification
```
