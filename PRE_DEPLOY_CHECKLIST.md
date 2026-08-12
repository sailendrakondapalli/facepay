# ✅ Pre-Deployment Checklist

Before deploying to Render + Vercel, verify these items:

## 📁 Files Created ✅

- [x] `face-recognition-api/requirements.txt` - Python dependencies
- [x] `face-recognition-api/render.yaml` - Render configuration
- [x] `vercel.json` - Vercel configuration
- [x] `.env.production` - Production environment template
- [x] `DEPLOYMENT_GUIDE.md` - Complete deployment guide
- [x] `QUICK_DEPLOY.md` - Quick reference
- [x] `PRE_DEPLOY_CHECKLIST.md` - This file

## 🔧 Code Updates ✅

- [x] Flask app.py - Fixed model paths for deployment
- [x] Flask app.py - Added production CORS settings
- [x] face-recognition-yunet.js - Uses environment variable for API URL

## 📦 Model Files (Critical!)

Verify these files exist and will be committed:
- [ ] `face-recognition/models/face_detection_yunet_2023mar.onnx` (~1.9MB)
- [ ] `face-recognition/models/face_recognition_sface_2021dec.onnx` (~5.1MB)

**Check size:**
```bash
ls -lh face-recognition/models/*.onnx
```

## 🔑 Environment Variables Ready

### For Render (Backend):
```
SUPABASE_URL=________________
SUPABASE_ANON_KEY=________________
SUPABASE_SERVICE_ROLE_KEY=________________
PYTHON_VERSION=3.11.0
```

### For Vercel (Frontend):
```
VITE_SUPABASE_URL=________________
VITE_SUPABASE_ANON_KEY=________________
VITE_API_BASE_URL=https://facepay-api.onrender.com
```

**Get Supabase keys from:**
- Dashboard → Settings → API → Project URL & Keys

## 🧪 Local Testing (Before Deploy)

Test everything works locally:

1. **Start Flask API:**
```bash
cd face-recognition-api
py app.py
```
Visit: http://localhost:5000/health
Expected: `{"status": "healthy", "models_loaded": true}`

2. **Start React Frontend:**
```bash
npm run dev
```
Visit: http://localhost:5173

3. **Test Flow:**
   - [ ] Register customer
   - [ ] Login as merchant
   - [ ] Scan customer face
   - [ ] Complete payment

## 📝 Git Repository

- [ ] Repository created on GitHub
- [ ] Repository is Private (recommended)
- [ ] All files committed
- [ ] Model files committed (check with `git ls-files | grep .onnx`)

## 🚀 Ready to Deploy!

If all items above are checked, proceed to:
1. **QUICK_DEPLOY.md** for fast deployment
2. **DEPLOYMENT_GUIDE.md** for detailed instructions

## ⚠️ Common Mistakes to Avoid

1. ❌ Forgetting to add environment variables in Render/Vercel
2. ❌ Using wrong Supabase keys (anon vs service role)
3. ❌ Model files not committed to Git
4. ❌ VITE_API_BASE_URL pointing to localhost instead of Render URL
5. ❌ Not starting environment variable names with `VITE_` in Vercel

## 📊 Expected Build Times

- **Render** (first deploy): 8-12 minutes
  - Python install: 2-3 min
  - Dependencies install: 5-7 min
  - Service start: 1-2 min

- **Vercel** (first deploy): 2-4 minutes
  - npm install: 1 min
  - Build: 1-2 min
  - Deploy: 30 sec

## 💰 Cost Summary

- **Development (local)**: $0
- **Staging (free tiers)**: $0/month
  - Render Free: 750 hours, sleeps after 15min
  - Vercel Free: Unlimited hobby projects
  - Supabase Free: 500MB DB, 2GB bandwidth

- **Production (paid)**: $32/month minimum
  - Render Starter: $7/month (always-on)
  - Vercel Pro: $20/month (optional, if needed)
  - Supabase Pro: $25/month (if DB grows)

**Recommendation**: Start with free tier, upgrade Render to $7/month when ready for production.

## 🎯 Success Criteria

After deployment, verify:
- [ ] Frontend loads on Vercel URL
- [ ] Backend health endpoint returns success
- [ ] Customer registration works end-to-end
- [ ] Face detection works in browser
- [ ] Face data stores in Supabase
- [ ] Merchant can login and scan faces
- [ ] Payment transactions complete
- [ ] No errors in Render logs
- [ ] No errors in Vercel logs
- [ ] No errors in browser console

## 📞 Support Resources

- **Render Docs**: https://render.com/docs/deploy-flask
- **Vercel Docs**: https://vercel.com/docs/concepts/projects/environment-variables
- **Supabase Docs**: https://supabase.com/docs/guides/api

---

**Ready?** Go to `QUICK_DEPLOY.md` and start deploying! 🚀
