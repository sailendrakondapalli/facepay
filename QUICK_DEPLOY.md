# ⚡ Quick Deploy Reference

## 🚀 Deploy in 3 Steps

### 1️⃣ Push to GitHub (5 min)
```bash
git init
git add .
git commit -m "FacePay biometric system"
git remote add origin https://github.com/YOUR_USERNAME/facepay-biometric.git
git push -u origin main
```

### 2️⃣ Deploy Backend to Render (10 min)
1. Go to https://render.com → Sign up with GitHub
2. Click "New +" → "Web Service"
3. Select `facepay-biometric` repo
4. Configure:
   - **Root Directory**: `face-recognition-api`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 app:app`
5. Add Environment Variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_key
   SUPABASE_SERVICE_ROLE_KEY=your_key
   ```
6. Click "Create Web Service"
7. Wait 5-10 minutes → Get URL: `https://facepay-api.onrender.com`

### 3️⃣ Deploy Frontend to Vercel (5 min)
1. Go to https://vercel.com → Sign up with GitHub
2. Click "Add New..." → "Project"
3. Select `facepay-biometric` repo
4. Add Environment Variables:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_key
   VITE_API_BASE_URL=https://facepay-api.onrender.com
   ```
5. Click "Deploy"
6. Wait 2-3 minutes → Get URL: `https://facepay-biometric.vercel.app`

## ✅ Test URLs

- **Frontend**: https://facepay-biometric.vercel.app
- **Backend Health**: https://facepay-api.onrender.com/health
- **Database**: Supabase dashboard

## 🔧 Update After Deploy

If you make changes:
```bash
git add .
git commit -m "Description of changes"
git push
```

Both Render and Vercel will auto-deploy!

## 💡 Important Notes

- **First request to Render (free tier)**: May take 30-60 seconds (cold start)
- **Environment variables**: Must start with `VITE_` for Vite/React
- **CORS**: Already configured for `*.vercel.app` and `*.onrender.com`
- **Model files**: Must be committed to Git (they are!)

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "Models not loading" | Check Render logs, verify model files committed |
| "API connection failed" | Check `VITE_API_BASE_URL` in Vercel |
| "Service unavailable" | Wait 60s for Render cold start (free tier) |
| "CORS error" | Check Flask CORS settings include your Vercel domain |

## 📞 Need Help?

Read full guide: `DEPLOYMENT_GUIDE.md`
