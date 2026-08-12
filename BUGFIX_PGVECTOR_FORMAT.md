# 🐛 Bug Fix: pgvector Format Issue

## Issue Identified

**Error**: `500 Internal Server Error` when calling `identify-face` Edge Function

**Root Cause**: Edge Functions were storing and querying embeddings in incorrect format for pgvector.

- ❌ **Wrong**: `JSON.stringify(embedding)` → `"[1,2,3,...]"` (JSON string)
- ✅ **Correct**: `` `[${embedding.join(',')}]` `` → `[1,2,3,...]` (pgvector array format)

PostgreSQL's pgvector extension requires vectors to be in the format `[1,2,3,...]` without quotes around the brackets.

---

## Fixes Applied

### 1. **enroll-face/index.ts**
Changed embedding storage from:
```typescript
face_embedding: JSON.stringify(embedding)  // ❌ Wrong
```

To:
```typescript
face_embedding: `[${embedding.join(',')}]`  // ✅ Correct
```

### 2. **identify-face/index.ts** 
Changed RPC call from:
```typescript
query_embedding: JSON.stringify(embedding)  // ❌ Wrong
```

To:
```typescript
query_embedding: `[${embedding.join(',')}]`  // ✅ Correct
```

### 3. **verify-face/index.ts**
Changed RPC call from:
```typescript
query_embedding: JSON.stringify(embedding)  // ❌ Wrong
```

To:
```typescript
query_embedding: `[${embedding.join(',')}]`  // ✅ Correct
```

---

## Deployment Status

✅ All three Edge Functions redeployed successfully:

1. **enroll-face** - Fixed pgvector storage format
2. **identify-face** - Fixed pgvector query format
3. **verify-face** - Fixed pgvector query format

---

## Testing Instructions

### Test 1: Re-register Customer (if needed)

If you already registered a customer with the broken format, you may need to:

**Option A: Delete and re-register** (Recommended if you have test data only)
```sql
-- Run in Supabase SQL Editor to clear test data
DELETE FROM customer_biometrics;
DELETE FROM customer_profiles;
DELETE FROM profiles WHERE role = 'customer';
```

Then register again through the UI.

**Option B: Update existing customer** (If you want to keep profile)

Just go through the biometric enrollment step again - the `upsert` will update the existing record with correct format.

### Test 2: Complete Flow Test

1. **Register Customer**:
   - Go to http://localhost:5174
   - Register as customer with biometric capture
   - Should succeed without 500 errors

2. **Verify Database**:
```sql
-- Check embedding is stored correctly (should see [1.234,5.678,...])
SELECT 
  p.full_name,
  cp.facepay_id,
  cb.face_embedding::text LIKE '[%]%' AS embedding_format_correct,
  cb.quality_score
FROM customer_biometrics cb
JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
JOIN profiles p ON cb.user_id = p.id;
```

3. **Test Merchant Identification**:
   - Login as merchant
   - Click "SCAN CUSTOMER"
   - Should identify customer without 500 error
   - Should show customer name, FacePay ID, similarity score

4. **Test Transaction Verification**:
   - After identification, enter amount
   - Second biometric scan for verification
   - Should complete transaction successfully

---

## Verification Queries

Run these in Supabase SQL Editor to verify everything is working:

```sql
-- 1. Check pgvector extension is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 2. Check embeddings are in correct format
SELECT 
  id,
  user_id,
  face_embedding::text LIKE '[%' AS starts_with_bracket,
  face_embedding::text LIKE '%]' AS ends_with_bracket,
  quality_score,
  created_at
FROM customer_biometrics;

-- 3. Test RPC function manually
-- First, get an embedding from the database
DO $$
DECLARE
  test_embedding vector(512);
BEGIN
  SELECT face_embedding INTO test_embedding 
  FROM customer_biometrics 
  LIMIT 1;
  
  IF test_embedding IS NOT NULL THEN
    RAISE NOTICE 'Testing match_face_embedding with stored embedding...';
    PERFORM * FROM match_face_embedding(test_embedding, 0.85, 1);
    RAISE NOTICE 'RPC function executed successfully';
  ELSE
    RAISE NOTICE 'No embeddings found in database';
  END IF;
END $$;

-- 4. Check audit log for recent operations
SELECT 
  action,
  success,
  similarity_score,
  error_message,
  created_at
FROM biometric_audit_log
ORDER BY created_at DESC
LIMIT 10;
```

---

## Expected Results

### ✅ Success Indicators:

1. **Registration**: 
   - Browser console: "Biometric enrollment successful"
   - No 500 errors
   - Embedding stored in database

2. **Identification**:
   - Merchant scans face
   - System identifies customer within 1-2 seconds
   - Shows name, FacePay ID, similarity % (should be >85%)

3. **Verification**:
   - Second scan after amount entered
   - Verification succeeds (similarity >90%)
   - Transaction created in database

4. **Database**:
   - `customer_biometrics.face_embedding` shows `[1.234,...]` format
   - `biometric_audit_log` shows successful operations
   - `transactions` table has completed payments

### ❌ Failure Indicators:

- Still getting 500 errors → Check Edge Function logs in Supabase Dashboard
- "No matching customer found" → Check similarity threshold or re-enroll
- Database shows `"[1,2,3]"` with quotes → Clear and re-register

---

## Technical Details

### Why This Matters

PostgreSQL's pgvector extension stores vectors as a native PostgreSQL type `vector(n)` where n is the dimension.

**pgvector expects**:
```
[1.0, 2.0, 3.0]  ← No quotes, just the array
```

**What JSON.stringify() produces**:
```
"[1.0, 2.0, 3.0]"  ← String with quotes, not a vector!
```

When you try to cast `"[1.0, 2.0, 3.0]"` to `vector(512)`, PostgreSQL fails because it's trying to parse a string that contains quotes.

### Correct Conversion

```typescript
const embedding = [1.0, 2.0, 3.0, ...] // 512 numbers

// ❌ Wrong - creates JSON string
const wrong = JSON.stringify(embedding) 
// Result: "[1,2,3,...]"  (string with quotes)

// ✅ Correct - creates pgvector format
const correct = `[${embedding.join(',')}]`
// Result: [1,2,3,...]  (vector array, no quotes)
```

---

## Rollback (if needed)

If something goes wrong, you can rollback to previous Edge Function versions:

```bash
# List function versions
supabase functions list

# Rollback to previous version (not needed, new version is correct)
# This is just for reference
```

---

## Summary

✅ **Fixed**: pgvector format issue in all 3 Edge Functions  
✅ **Deployed**: All functions now use correct `[1,2,3,...]` format  
✅ **Ready**: System should now work end-to-end  

**Next Step**: Test the complete flow (register → identify → verify → transact)
