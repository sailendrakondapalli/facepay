# FacePay Setup Checklist

## ✅ Completed Steps

1. ✅ Environment variables fixed (`.env.local` with `VITE_` prefix)
2. ✅ Edge Functions deployed and ACTIVE
3. ✅ Development server restarted on port 5174
4. ✅ Registration order fixed (customer profile created before biometric enrollment)
5. ✅ **pgvector format bug fixed** - Edge Functions now use correct `[1,2,3,...]` format
6. ✅ All Edge Functions redeployed with fix (enroll-face, identify-face, verify-face)

---

## 🔴 CRITICAL: Database Setup Required

### Step 1: Enable pgvector Extension

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste the following SQL:

```sql
-- Enable pgvector extension for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Test that pgvector is working
SELECT '1'::vector <-> '2'::vector AS distance_test;
```

5. Click **Run** (or press Ctrl+Enter)
6. You should see result: `distance_test: 1`

### Step 2: Run Complete Database Schema

1. Stay in **SQL Editor**
2. Click **New Query**
3. Open the file: `src/lib/schema.sql` in your project
4. Copy the **ENTIRE CONTENT** from `schema.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)
7. Wait for all queries to complete (you should see multiple success messages)

**Important**: The schema includes:
- All tables (profiles, customer_profiles, merchant_profiles, customer_biometrics, transactions, biometric_audit_log)
- pgvector column type `vector(512)` for face embeddings
- RPC functions: `match_face_embedding()` and `verify_face_embedding()`
- Vector similarity index (HNSW) for fast face matching

---

## 🔴 CRITICAL: Storage Bucket Setup

### Create Biometric Images Bucket

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd
2. Navigate to **Storage** (left sidebar)
3. Click **Create a new bucket**
4. Enter bucket name: `biometric-images`
5. Set **Public bucket**: ❌ **OFF** (keep it PRIVATE)
6. Set **File size limit**: `5 MB`
7. Set **Allowed MIME types**: `image/jpeg, image/png`
8. Click **Create bucket**

---

## 🟡 Verification Steps

After completing the above steps, test the complete flow:

### Test 1: Customer Registration with Biometric Enrollment

1. Open browser: http://localhost:5174
2. Click "Register as Customer"
3. Fill in Step 1: Name, phone, email, password
4. Step 2: Capture biometric data
   - Allow camera permissions
   - Position your face in the frame
   - Wait for quality meter to show "Good" or "Excellent"
   - Let it auto-capture
5. Step 3: Enter payment ID (e.g., `test@upi`)
6. Step 4: Review and submit

**Expected Result**: 
- Registration completes successfully
- Biometric enrollment succeeds (check browser console for "Biometric enrollment successful")
- Redirects to Customer Dashboard

**If it fails**, check browser console (F12) for errors.

### Test 2: Merchant Face Identification (1:N)

1. Login as Merchant or register new merchant account
2. Go to Merchant Dashboard
3. Click "SCAN CUSTOMER"
4. Allow camera permissions
5. The registered customer should position their face
6. System should identify the customer and show their name

**Expected Result**:
- Customer identified with name, FacePay ID, and similarity score
- Can proceed to enter amount

### Test 3: Complete Payment Transaction (1:1 Verification)

1. After customer is identified, enter amount (e.g., 100)
2. Click "Continue"
3. Second biometric scan (verification)
4. Same customer positions face again
5. System verifies identity

**Expected Result**:
- Verification succeeds
- Payment completes
- Transaction appears in merchant history

---

## 🐛 Troubleshooting

### Issue: "Customer profile not found" during registration

**Cause**: Database schema not applied or customer_profiles table doesn't exist

**Fix**: Run the complete schema from `src/lib/schema.sql` in Supabase SQL Editor

### Issue: 404 or 406 errors when calling Edge Functions

**Cause**: 
- Edge Functions not deployed
- Environment variables missing `VITE_` prefix
- CORS issues

**Fix**: 
- ✅ Already fixed: `.env.local` now has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- ✅ Dev server restarted to pick up new variables
- ✅ Edge Functions are deployed and ACTIVE

### Issue: "pgvector" error or "type vector does not exist"

**Cause**: pgvector extension not enabled in Supabase

**Fix**: Run `enable-pgvector.sql` in Supabase SQL Editor (Step 1 above)

### Issue: Image upload fails in Edge Function

**Cause**: `biometric-images` storage bucket doesn't exist

**Fix**: Create the bucket in Supabase Dashboard Storage (see "Storage Bucket Setup" above)

### Issue: Face not scanning or "No matching customer found"

**Possible Causes**:
1. Customer not enrolled properly (check database: `customer_biometrics` table should have a record)
2. Embedding format incorrect (should be 512-dimensional array stored as JSON string)
3. pgvector similarity search not working (check extension is enabled)
4. Quality threshold too high

**Debug Steps**:
1. Check browser console for errors
2. Check Supabase Edge Function logs: https://supabase.com/dashboard/project/elepidjpvuywldsnaetd/functions
3. Verify data in SQL Editor:
```sql
-- Check if customer has biometric data
SELECT cb.*, cp.facepay_id, p.full_name
FROM customer_biometrics cb
JOIN customer_profiles cp ON cb.customer_profile_id = cp.id
JOIN profiles p ON cb.user_id = p.id;
```

---

## 📋 Post-Setup Verification SQL Queries

After completing all steps, run these queries in Supabase SQL Editor to verify:

```sql
-- 1. Check pgvector is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 2. Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'customer_profiles', 'merchant_profiles', 'customer_biometrics', 'transactions', 'biometric_audit_log');

-- 3. Check RPC functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('match_face_embedding', 'verify_face_embedding');

-- 4. Check vector index exists
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'customer_biometrics' 
AND indexname = 'customer_biometrics_embedding_idx';

-- 5. Check storage bucket (if created via SQL)
SELECT * FROM storage.buckets WHERE name = 'biometric-images';
```

---

## 🎯 Next Steps After Setup

Once everything is working:

1. **Test with multiple customers**: Register 2-3 test customers with different faces
2. **Test identification accuracy**: Merchant should correctly identify each customer
3. **Test false rejection**: Try scanning with a different person's face (should fail)
4. **Monitor Edge Function logs**: Check for any errors or warnings
5. **Review biometric audit log**: Check `biometric_audit_log` table for all operations

---

## 🔒 Security Notes

- ✅ Biometric embeddings never exposed to client (stored server-side only)
- ✅ Face matching happens in Edge Functions with service role key
- ✅ pgvector similarity search is secure and fast
- ✅ Transaction nonces prevent replay attacks
- ⚠️ RLS is currently DISABLED for development (enable in production!)
- ⚠️ Storage bucket is PRIVATE (only Edge Functions can access)

---

## 📞 Support

If you encounter issues:
1. Check browser console (F12 → Console tab)
2. Check Supabase Edge Function logs
3. Check Supabase database logs
4. Verify all environment variables are set correctly
5. Ensure dev server is running on the correct port

**Current Status**:
- Dev Server: http://localhost:5174
- Edge Functions: ACTIVE
- Database: Needs schema applied
- Storage: Needs bucket created
