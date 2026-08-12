# 🚀 FacePay Deployment Guide
## Render (Backend) + Vercel (Frontend)

This guide will help you deploy your FacePay biometric payment system to production.

---

## 📋 Prerequisites

- [x] GitHub account
- [x] Render account (free tier available)
- [x] Vercel account (free tier available)
- [x] Supabase project (already setup)
- [x] Git installed on your computer

---

## 🗂️ Project Structure

```
facelesspayment/
├── src/                          # React frontend (→ Vercel)
├── face-recognition-api/         # Flask backend (→ Render)
│   ├── app.py
│   ├── requirements.txt
│   └── render.yaml
├── face-recognition/
│   ├── models/                   # YuNet & SFace models
│   └── src/                      # Python modules
├── package.json
└── vercel.json
```

---

## 📦 Part 1: Deploy Flask API to Render

### Step 1: Push Code to GitHub

1. **Initialize Git** (if not already done):
```bash
cd C:\Users\saile\Desktop\Desktop\facelesspayment
git init
git add .
git commit -m "Initial commit - FacePay biometric system"
```

2. **Create GitHub Repository**:
   - Go to https://github.com/new
   - Name: `facepay-biometric`
   - Visibility: Private (recommended for security)
   - Click "Create repository"

3. **Push to GitHub**:
```bash
git remote add origin https://github.com/YOUR_USERNAME/facepay-biometric.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Render

1. **Sign up for Render**:
   - Go to https://render.com
   - Click "Get Started" or "Sign Up"
   - Sign up with GitHub (recommended)

2. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `facepay-biometric`
   - Click "Connect"

3. **Configure Service**:
   ```
   Name: facepay-api
   Region: Oregon (US West)
   Branch: main
   Root Directory: face-recognition-api
   Runtime: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: gunicorn --bind 0.0.0.0:$PORT --workers 2 --threads 2 --timeout 120 app:app
   ```

4. **Add Environment Variables** (click "Advanced"):
   ```
   SUPABASE_URL = https://your-project.supabase.co
   SUPABASE_ANON_KEY = your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY = your_service_role_key_here
   PYTHON_VERSION = 3.11.0
   ```

   **Where to find Supabase keys:**
   - Go to your Supabase dashboard
   - Click on your project
   - Settings → API
   - Copy "Project URL" and "anon public" key

5. **Select Plan**:
   - Free Plan: $0/month (✅ Recommended for testing)
     - ⚠️ Service sleeps after 15 min inactivity
     - ⚠️ 750 hours/month limit
   - Starter Plan: $7/month (for production)
     - Always-on service
     - Unlimited hours

6. **Deploy**:
   - Click "Create Web Service"
   - Wait 5-10 minutes for deployment
   - You'll get a URL like: `https://facepay-api.onrender.com`

7. **Test API**:
   - Visit: `https://facepay-api.onrender.com/health`
   - Should see: `{"status": "healthy", "models_loaded": true}`

### Step 3: Fix Model Paths (Important!)

Render needs absolute paths for ONNX models. Update `app.py`:

**Original:**
```python
yunet_model_path = "../face-recognition/models/face_detection_yunet_2023mar.onnx"
sface_model_path = "../face-recognition/models/face_recognition_sface_2021dec.onnx"
```

**Updated for Render:**
```python
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
yunet_model_path = os.path.join(BASE_DIR, "..", "face-recognition", "models", "face_detection_yunet_2023mar.onnx")
sface_model_path = os.path.join(BASE_DIR, "..", "face-recognition", "models", "face_recognition_sface_2021dec.onnx")
```

Push the update:
```bash
git add face-recognition-api/app.py
git commit -m "Fix model paths for Render deployment"
git push
```

Render will auto-redeploy.

---

## 🌐 Part 2: Deploy React Frontend to Vercel

### Step 1: Update API URL in Code

1. **Update face-recognition-yunet.js**:

Open `src/lib/face-recognition-yunet.js` and change:

```javascript
// OLD (localhost)
const API_BASE_URL = 'http://localhost:5000/api'

// NEW (production)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
```

2. **Commit changes**:
```bash
git add src/lib/face-recognition-yunet.js
git commit -m "Use environment variable for API URL"
git push
```

### Step 2: Deploy to Vercel

1. **Sign up for Vercel**:
   - Go to https://vercel.com
   - Click "Sign Up"
   - Sign up with GitHub (recommended)

2. **Import Project**:
   - Click "Add New..." → "Project"
   - Import your GitHub repo: `facepay-biometric`
   - Click "Import"

3. **Configure Project**:
   ```
   Framework Preset: Vite
   Root Directory: ./
   Build Command: npm run build
   Output Directory: dist
   Install Command: npm install
   ```

4. **Add Environment Variables**:
   Click "Environment Variables" and add:
   ```
   VITE_SUPABASE_URL = https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY = your_anon_key_here
   VITE_API_BASE_URL = https://facepay-api.onrender.com/api
   ```

   **Important**: Use your actual Render URL from Part 1!

5. **Deploy**:
   - Click "Deploy"
   - Wait 2-3 minutes
   - You'll get a URL like: `https://facepay-biometric.vercel.app`

---

## 🔧 Part 3: Configure CORS

Your Flask API needs to accept requests from Vercel domain.

Update `face-recognition-api/app.py`:

```python
from flask_cors import CORS

app = Flask(__name__)

# Allow requests from Vercel domain
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:5173",  # Local development
            "https://facepay-biometric.vercel.app",  # Your Vercel domain
            "https://*.vercel.app"  # All Vercel preview deployments
        ]
    }
})
```

Push changes:
```bash
git add face-recognition-api/app.py
git commit -m "Update CORS for Vercel domain"
git push
```

---

## ✅ Part 4: Testing

### Test Backend (Render):
1. Visit: `https://facepay-api.onrender.com/health`
2. Should return: `{"status": "healthy", "models_loaded": true}`

### Test Frontend (Vercel):
1. Visit: `https://facepay-biometric.vercel.app`
2. Try customer registration
3. Try merchant login and face scanning

### Test Full Integration:
1. **Register a customer** on Vercel frontend
2. **Check console** - should see successful API calls to Render
3. **Login as merchant** and scan the customer face
4. **Complete a payment** transaction

---

## 🐛 Troubleshooting

### Render Issues

**Problem**: "Models not loading"
- **Solution**: Check model file paths in `app.py`
- **Solution**: Verify models are committed to Git (check `.gitignore`)

**Problem**: "Service unavailable" (free tier)
- **Cause**: Service went to sleep after 15 minutes
- **Solution**: Wait 30-60 seconds for cold start
- **Solution**: Upgrade to Starter plan ($7/month) for always-on

**Problem**: "Database connection failed"
- **Solution**: Check Supabase environment variables in Render
- **Solution**: Verify Supabase URL and keys are correct

### Vercel Issues

**Problem**: "API connection failed"
- **Solution**: Check `VITE_API_BASE_URL` environment variable
- **Solution**: Verify CORS settings in Flask app
- **Solution**: Check Render service is running

**Problem**: "Environment variables not working"
- **Solution**: Vercel variables must start with `VITE_`
- **Solution**: Redeploy after adding variables

**Problem**: "Build failed"
- **Solution**: Check `package.json` has correct build script
- **Solution**: Verify all dependencies are in `package.json`

---

## 🎯 Post-Deployment Checklist

- [ ] Flask API health check returns success
- [ ] Vercel frontend loads correctly
- [ ] Customer registration works
- [ ] Face enrollment stores in Supabase
- [ ] Merchant login works
- [ ] Face identification works on merchant dashboard
- [ ] Payment transactions complete successfully
- [ ] Check Render logs for errors
- [ ] Check Vercel logs for errors
- [ ] Test on mobile device
- [ ] Test on different browsers

---

## 💰 Cost Breakdown

| Service | Free Tier | Paid Plan |
|---------|-----------|-----------|
| **Render** | $0/month (750 hrs, sleeps) | $7/month (always-on) |
| **Vercel** | $0/month (unlimited hobby) | $20/month (pro) |
| **Supabase** | $0/month (500MB DB, 2GB bandwidth) | $25/month (8GB DB) |
| **Total** | **$0/month** | **$52/month** |

**Recommendation**: Start with free tier for testing, upgrade Render to $7/month for production.

---

## 🔐 Security Best Practices

1. **Never commit .env files to Git**
   - Already in `.gitignore`
   - Use platform environment variables

2. **Use HTTPS only in production**
   - Render and Vercel provide HTTPS automatically

3. **Rotate Supabase keys periodically**
   - Generate new keys every 3-6 months

4. **Enable Render auto-deploy**
   - Automatically deploys on `git push`

5. **Monitor logs**
   - Render: Dashboard → Logs
   - Vercel: Project → Deployments → Logs

---

## 📞 Support

**Render Documentation**: https://render.com/docs
**Vercel Documentation**: https://vercel.com/docs
**Supabase Documentation**: https://supabase.com/docs

---

## 🎉 You're Done!

Your FacePay biometric payment system is now live in production!

**Frontend URL**: `https://facepay-biometric.vercel.app`
**Backend API**: `https://facepay-api.onrender.com`
**Database**: Supabase (already configured)

Share your frontend URL to let users access the system!
