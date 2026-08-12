# 🚀 Deploy to Existing GitHub Repository

Your repo: **https://github.com/sailendrakondapalli/facepay.git**

---

## 📦 Step 1: Push Latest Changes to GitHub

### 1.1 Check Git Status
```bash
cd C:\Users\saile\Desktop\Desktop\facelesspayment
git status
```

### 1.2 Add All New Files
```bash
git add .
```

This will add:
- ✅ `face-recognition-api/requirements.txt`
- ✅ `face-recognition-api/render.yaml`
- ✅ `vercel.json`
- ✅ Updated `app.py` with production config
- ✅ Updated `face-recognition-yunet.js` with env variables
- ✅ All deployment guides

### 1.3 Commit Changes
```bash
git commit -m "Add production deployment configuration for Render and Vercel"
```

### 1.4 Push to GitHub
```bash
git remote set-url origin https://github.com/sailendrakondapalli/facepay.git
git branch -M main
git push -u origin main
```

**If this is a new local repo:**
```bash
git init
git add .
git commit -m "FacePay biometric payment system with YuNet+SFace"
git remote add origin https://github.com/sailendrakondapalli/facepay.git
git branch -M main
git push -u origin main --force
```

---

## 🐍 Step 2: Deploy Flask API to Render (10 minutes)

### 2.1 Sign Up for Render
1. Go to: https://render.com
2. Click **"Get Started"**
3. Sign up with **GitHub** (recommended)
4. Authorize Render to access your GitHub

### 2.2 Create New Web Service
1. Click **"New +"** → **"Web Service"**
2. Click **"Connect account"** if needed
3. Find and select: **`sailendrakondapalli/facepay`**
4. Click **"Connect"**

### 2.3 Configure Service
Fill in these settings:

```
Name: facepay-api
Region: Oregon (US West) or closest to your users
Branch: main
Root Directory: face-recognition-api
Runtime: Python 3
Build Command: pip install -r requirements.txt
Start Command: gunicorn --bind 0.0.0.0:$PORT --workers 2 --threads 2 --timeout 120 app:app
```

### 2.4 Add Environment Variables
Click **"Advanced"** → **"Add Environment Variable"**

Add these **4 variables**:

```
Key: SUPABASE_URL
Value: https://elepidjpvuywldsnaetd.supabase.co

Key: SUPABASE_ANON_KEY
Value: [Get from Supabase Dashboard → Settings → API]

Key: SUPABASE_SERVICE_ROLE_KEY
Value: [Get from Supabase Dashboard → Settings → API → service_role key]

Key: PYTHON_VERSION
Value: 3.11.0
```

**Where to find Supabase keys:**
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (gear icon) → **API**
4. Copy **"Project URL"** → Paste as `SUPABASE_URL`
5. Copy **"anon public"** → Paste as `SUPABASE_ANON_KEY`
6. Copy **"service_role"** → Paste as `SUPABASE_SERVICE_ROLE_KEY`

### 2.5 Select Plan
- **Free Plan**: Select this to start
  - ✅ $0/month
  - ⚠️ Sleeps after 15 min inactivity
  - ⚠️ 750 hours/month limit
  - ⚠️ First request takes 30-60 seconds

**For production later, upgrade to:**
- **Starter Plan**: $7/month
  - ✅ Always-on (no sleep)
  - ✅ Unlimited hours
  - ✅ Fast response times

### 2.6 Deploy
1. Click **"Create Web Service"**
2. Wait **8-12 minutes** for first deployment
3. Watch the logs - you'll see:
   ```
   Installing Python dependencies...
   Installing opencv-python-headless...
   Starting gunicorn...
   Face recognition system initialized successfully
   ```
4. When complete, you'll get a URL like:
   ```
   https://facepay-api.onrender.com
   ```

### 2.7 Test Backend
Visit: `https://facepay-api.onrender.com/health`

**Expected response:**
```json
{
  "status": "healthy",
  "models_loaded": true,
  "database_connected": true
}
```

**If you see this, backend is working! ✅**

---

## 🌐 Step 3: Deploy React Frontend to Vercel (5 minutes)

### 3.1 Sign Up for Vercel
1. Go to: https://vercel.com
2. Click **"Sign Up"**
3. Sign up with **GitHub**
4. Authorize Vercel to access your GitHub

### 3.2 Import Project
1. Click **"Add New..."** → **"Project"**
2. Find and select: **`sailendrakondapalli/facepay`**
3. Click **"Import"**

### 3.3 Configure Project
Vercel will auto-detect Vite. Verify these settings:

```
Framework Preset: Vite
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Node.js Version: 18.x (default)
```

### 3.4 Add Environment Variables
Click **"Environment Variables"** tab and add these **3 variables**:

```
Name: VITE_SUPABASE_URL
Value: https://elepidjpvuywldsnaetd.supabase.co

Name: VITE_SUPABASE_ANON_KEY
Value: [Same anon key from Render step]

Name: VITE_API_BASE_URL
Value: https://facepay-api.onrender.com
```

**⚠️ IMPORTANT**: Use your **actual Render URL** from Step 2.6!

**⚠️ CRITICAL**: All frontend variables **MUST** start with `VITE_`

### 3.5 Deploy
1. Click **"Deploy"**
2. Wait **2-4 minutes** for deployment
3. When complete, you'll get a URL like:
   ```
   https://facepay-biometric.vercel.app
   ```
   or
   ```
   https://facepay.vercel.app
   ```

### 3.6 Test Frontend
1. Visit your Vercel URL
2. You should see the FacePay login page
3. Open browser console (F12) - check for errors

**Expected in console:**
```
🔗 Face Recognition API URL: https://facepay-api.onrender.com
```

---

## ✅ Step 4: Test Complete System

### 4.1 Test Customer Registration
1. Go to your Vercel URL
2. Click **"Register as Customer"**
3. Fill in details and register
4. Allow camera access
5. Position face in the oval
6. Wait for automatic capture
7. Should see: **"Registration successful"**

### 4.2 Test Merchant Flow
1. Click **"Login"** → Select **"Merchant"**
2. Use merchant credentials
3. Click **"SCAN CUSTOMER"**
4. Allow camera access
5. Customer's face should be identified
6. Should show customer name and details
7. Enter amount (e.g., 100)
8. Click **"Proceed to Verification"**
9. Second face scan for verification
10. Should see: **"Payment Successful"** ✅

---

## 🔧 Step 5: Update CORS (If Needed)

If you get CORS errors, update your Render environment variable:

### Option A: Via Render Dashboard
1. Go to Render Dashboard
2. Click on **"facepay-api"** service
3. Go to **"Environment"** tab
4. Add new variable:
   ```
   Key: ALLOWED_ORIGINS
   Value: https://facepay.vercel.app,https://facepay-biometric.vercel.app
   ```
5. Save and redeploy

### Option B: Update app.py (Already done!)
The CORS is already configured to accept all `*.vercel.app` domains.

---

## 🎯 Your Live URLs

After deployment, you'll have:

```
🌐 Frontend: https://facepay-XXX.vercel.app
🐍 Backend:  https://facepay-api.onrender.com
💾 Database: https://elepidjpvuywldsnaetd.supabase.co
```

**Save these URLs!** Share the frontend URL with users.

---

## 🐛 Troubleshooting

### Problem: "Models not loading" on Render
**Solution:**
1. Check Render logs for errors
2. Verify model files are in the repo:
   ```bash
   git ls-files | grep .onnx
   ```
   Should show:
   ```
   face-recognition/models/face_detection_yunet_2023mar.onnx
   face-recognition/models/face_recognition_sface_2021dec.onnx
   ```
3. If missing, add them:
   ```bash
   git add face-recognition/models/*.onnx
   git commit -m "Add ONNX model files"
   git push
   ```

### Problem: "API connection failed" in browser
**Solutions:**
1. Check `VITE_API_BASE_URL` in Vercel matches your Render URL
2. Test backend health: `https://your-render-url.onrender.com/health`
3. Check browser console for actual error
4. Verify Render service is running (not sleeping)

### Problem: "Service unavailable" (Render free tier)
**Cause:** Service went to sleep after 15 minutes of inactivity

**Solution:** 
- Wait 30-60 seconds for service to wake up
- First request will be slow, subsequent requests will be fast
- **To avoid:** Upgrade to Starter plan ($7/month) for always-on

### Problem: Frontend builds but shows blank page
**Solutions:**
1. Check browser console (F12) for errors
2. Verify all environment variables start with `VITE_`
3. Check Vercel deployment logs
4. Redeploy: Vercel Dashboard → Deployments → Click "Redeploy"

### Problem: Face detection not working
**Solutions:**
1. Open browser console - check for errors
2. Verify camera permissions granted
3. Test backend API health endpoint
4. Check if HTTPS is being used (required for camera)
5. Try on different browser (Chrome recommended)

---

## 🔄 Making Updates

After deployment, when you make changes:

```bash
# Make your code changes
git add .
git commit -m "Description of what you changed"
git push
```

**Both Render and Vercel will automatically redeploy!** 🎉

- **Render**: Redeploys in ~5 minutes
- **Vercel**: Redeploys in ~2 minutes

---

## 💰 Cost Summary

| Service | Free Tier | Paid Option |
|---------|-----------|-------------|
| **Render** | $0/month (sleeps) | $7/month (always-on) |
| **Vercel** | $0/month (unlimited hobby) | $20/month (pro, optional) |
| **Supabase** | $0/month (500MB DB) | $25/month (8GB DB) |
| **Total** | **$0/month** | **$7-52/month** |

**Recommendation**: 
- Start with **FREE** for testing
- Upgrade Render to **$7/month** when you have real users
- Supabase free tier is usually enough for small apps

---

## 📞 Need Help?

**Render logs**: Render Dashboard → Your Service → Logs
**Vercel logs**: Vercel Dashboard → Your Project → Deployments → Latest → View Function Logs
**Supabase logs**: Supabase Dashboard → Logs

**Documentation:**
- Render: https://render.com/docs
- Vercel: https://vercel.com/docs
- Supabase: https://supabase.com/docs

---

## 🎉 You're Done!

Your FacePay biometric payment system is now **LIVE IN PRODUCTION**! 🚀

Share your Vercel URL with users to let them access the system.

**Next steps:**
1. Test all features thoroughly
2. Monitor Render and Vercel logs
3. Check Supabase database for transactions
4. Share with friends/testers
5. Upgrade to paid plans when ready for production traffic

**Congratulations!** 🎊
