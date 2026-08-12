# Force Browser Cache Clear

The browser is still loading the OLD cached version of face-recognition.js. Here's how to fix it:

## Method 1: Hard Refresh (Quick)

1. **Close ALL browser tabs** with the app
2. **Ctrl+Shift+Delete** (Chrome/Edge)
3. Select **"All time"**
4. Check:
   - ✅ Cached images and files
   - ✅ Cookies and site data (optional, will log you out)
5. Click **"Clear data"**
6. **Close and reopen browser completely**
7. Navigate to `http://localhost:5173`

---

## Method 2: Restart Dev Server (Recommended)

```bash
# Stop the dev server (Ctrl+C in terminal)
# Then restart:
npm run dev
```

Then:
1. Hard refresh browser: **Ctrl+Shift+F5**
2. Or open in **Incognito/Private window**

---

## Method 3: Check Dev Server Console

Look for build messages. Vite should show:
```
✓ built in XXXms
```

If you don't see recent build messages, the server might not have reloaded the file.

---

## Verify Fix is Applied

After clearing cache, check browser console:
1. ✅ Should see: "MediaPipe FaceLandmarker initialized successfully"
2. ❌ Should NOT see: "runningMode must be set to 'IMAGE'"
3. ✅ Face detection should work without errors

---

## Note

I noticed at the end of your log:
```
Biometric enrollment successful: {success: true, ...}
```

This means it DID eventually work! The early errors are from the cached version, but then the new version loaded and succeeded.

**Try testing again** - it should work consistently now.
