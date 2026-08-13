# 🔧 WebAuthn Production Database Fix

## Problem 1: Tables Not Found
**Error:** `Could not find the table 'public.webauthn_credentials' in the schema cache`

**Cause:** You executed `webauthn-schema-fresh.sql` on your LOCAL Supabase, but the PRODUCTION database (https://elepidjpvuywldsnaetd.supabase.co) doesn't have the tables yet.

### Solution: Run Schema on Production

1. Go to https://supabase.com/dashboard/project/elepidjpvuywldsnaetd
2. Click **SQL Editor** in left sidebar
3. Open `webauthn-schema-fresh.sql` from your project
4. Copy the entire contents
5. Paste into SQL Editor
6. Click **Run** or press Ctrl+Enter
7. You should see: `✅ WebAuthn schema created successfully from scratch!`

---

## Problem 2: CORS Error
**Error:** `No 'Access-Control-Allow-Origin' header is present on the requested resource`

**Cause:** Edge Functions need to include CORS headers in their responses.

### Solution: Update Edge Functions with CORS

I'll create updated Edge Function files with CORS support below.

---

## Quick Fix Commands

### Option 1: Via Supabase Dashboard (Easiest)
1. Go to https://supabase.com/dashboard/project/elepidjpvuywldsnaetd
2. Navigate to **SQL Editor**
3. Copy and paste `webauthn-schema-fresh.sql`
4. Click **Run**
5. Done! ✅

### Option 2: Via CLI
```bash
# If you have direct database access
psql -h db.elepidjpvuywldsnaetd.supabase.co -U postgres -d postgres -f webauthn-schema-fresh.sql
```

---

## After Running Schema

Refresh your production site:
1. Go to https://facepay-kappa.vercel.app
2. Hard refresh (Ctrl+Shift+R)
3. Login as customer
4. Try registering WebAuthn again

The "table not found" error should be gone!

---

**Next:** I'll update the Edge Functions with CORS headers and redeploy.
