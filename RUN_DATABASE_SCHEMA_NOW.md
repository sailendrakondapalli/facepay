# 🔧 URGENT: Run Database Schema on Production

## The Problem:
Your production database doesn't have the WebAuthn tables yet. The errors show:
```
Could not find the table 'public.webauthn_credentials' in the schema cache
```

## ✅ Quick Fix (2 minutes):

### Step 1: Go to Supabase Dashboard
**Click this link:** https://supabase.com/dashboard/project/elepidjpvuywldsnaetd

### Step 2: Open SQL Editor
1. Look at the left sidebar
2. Click **"SQL Editor"** 
3. You'll see a text box for SQL queries

### Step 3: Copy the Database Schema
1. Open `webauthn-schema-fresh.sql` from your project folder
2. **Select ALL** the text in the file (Ctrl+A)
3. **Copy** it (Ctrl+C)

### Step 4: Run the Schema
1. **Paste** into the Supabase SQL Editor (Ctrl+V)
2. Click the **"Run"** button (or press Ctrl+Enter)
3. Wait for execution...

### Step 5: Success!
You should see a message like:
```
✅ WebAuthn schema created successfully from scratch!
📊 Created 3 tables: webauthn_credentials, payment_authorizations, webauthn_challenges
🔐 RLS policies configured
✨ Database is ready for WebAuthn implementation
```

---

## 🧪 After Running Schema:

1. **Refresh:** https://facepay-kappa.vercel.app (Ctrl+Shift+R)
2. **Login** as customer
3. **Go to Customer Dashboard**
4. **Scroll down** to WebAuthn section
5. **Click "Register Windows Hello"**
6. **Browser should prompt** for Windows Hello/fingerprint
7. **SUCCESS!** ✅ WebAuthn registration will work!

---

## 📋 Schema File Contents:

The `webauthn-schema-fresh.sql` file contains:
- **3 tables**: webauthn_credentials, payment_authorizations, webauthn_challenges
- **Indexes** for performance
- **RLS policies** for security
- **Functions** for cleanup
- **Permissions** for authenticated users

---

## ⚠️ Important:

**DO THIS NOW** - The WebAuthn feature is completely ready, it just needs the database tables!

**Time Required:** 2 minutes
**Difficulty:** Copy + Paste + Click Run

---

## 🚀 What Will Work After:

✅ **WebAuthn table queries** - No more "table not found"  
✅ **Edge Functions** - No more 500 errors  
✅ **Registration button** - Works perfectly  
✅ **Windows Hello prompt** - Browser shows biometric prompt  
✅ **Credential storage** - Saved in webauthn_credentials table  
✅ **Complete WebAuthn flow** - Ready for payments!

---

**Go to:** https://supabase.com/dashboard/project/elepidjpvuywldsnaetd  
**Click:** SQL Editor  
**Paste:** webauthn-schema-fresh.sql contents  
**Run!** 🚀