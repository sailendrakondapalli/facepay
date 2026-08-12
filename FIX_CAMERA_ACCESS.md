# 🎥 Fix Camera Access Denied Issue

## Problem
When you try to scan your face on the deployed Vercel site, you see:
- ❌ "Camera access denied"
- ❌ Camera permission blocked
- ❌ Red X icon on camera

## Root Cause
Modern browsers (Chrome, Firefox, Edge, Safari) **only allow camera access on secure HTTPS connections**. If your site is served over HTTP or the browser doesn't trust the certificate, camera access is automatically blocked.

---

## ✅ Solution 1: Verify HTTPS (Most Common)

### Step 1: Check Your URL
Open your Vercel deployment in a browser and look at the address bar:

**✅ CORRECT** (Camera will work):
```
https://facepay-abc123.vercel.app
```
Notice the padlock icon 🔒 and `https://`

**❌ WRONG** (Camera will be blocked):
```
http://facepay-abc123.vercel.app
```
No padlock, and `http://` instead of `https://`

### Step 2: Force HTTPS
If you see HTTP, manually change the URL to HTTPS:
1. Click on the address bar
2. Change `http://` to `https://`
3. Press Enter

Vercel automatically provides HTTPS, so this should work.

---

## ✅ Solution 2: Grant Browser Permissions

Even with HTTPS, you need to explicitly allow camera access.

### Chrome / Edge
1. Click the **padlock icon** (🔒) or **info icon** (ℹ️) in the address bar
2. Find **"Camera"** permission
3. Change from "Blocked" to **"Allow"**
4. **Refresh the page** (F5 or Ctrl+R)

**Alternative**:
1. Go to `chrome://settings/content/camera` (or `edge://settings/content/camera`)
2. Under "Allow", click **"Add"**
3. Enter your Vercel URL: `https://your-app.vercel.app`
4. Refresh your site

### Firefox
1. Click the **padlock icon** (🔒) in the address bar
2. Click the **arrow** next to "Connection Secure"
3. Find **"Permissions"** → **"Use the Camera"**
4. Select **"Allow"** (not "Temporarily Allow")
5. **Refresh the page**

**Alternative**:
1. Go to `about:preferences#privacy`
2. Scroll to **"Permissions"** → **"Camera"** → **"Settings"**
3. Find your Vercel URL
4. Change status to **"Allow"**
5. Refresh your site

### Safari (macOS)
1. Click **Safari** menu → **Settings** (or Preferences)
2. Go to **"Websites"** tab
3. Select **"Camera"** in the left sidebar
4. Find your Vercel URL in the list
5. Change to **"Allow"**
6. **Refresh the page**

---

## ✅ Solution 3: Clear Cached Permissions

Sometimes browsers cache old permission decisions.

### Chrome / Edge
1. Press **F12** to open DevTools
2. Right-click the **refresh button** in the browser toolbar
3. Select **"Empty Cache and Hard Reload"**
4. Close DevTools
5. Try camera access again

**Alternative**:
1. Go to `chrome://settings/content/siteDetails?site=https://your-app.vercel.app`
2. Click **"Clear data"**
3. Refresh your site and try again

### Firefox
1. Press **Ctrl+Shift+Delete** (Windows) or **Cmd+Shift+Delete** (Mac)
2. Select **"Last Hour"**
3. Check only **"Site Settings"** and **"Cache"**
4. Click **"Clear Now"**
5. Refresh your site

---

## ✅ Solution 4: Test in Incognito/Private Mode

This bypasses cached permissions and gives you a fresh start.

### Chrome / Edge
1. Press **Ctrl+Shift+N** (Windows) or **Cmd+Shift+N** (Mac)
2. Navigate to your Vercel URL
3. When prompted, click **"Allow"** for camera access
4. If it works here, your main browser has permission issues (use Solution 3)

### Firefox
1. Press **Ctrl+Shift+P** (Windows) or **Cmd+Shift+P** (Mac)
2. Navigate to your Vercel URL
3. Click **"Allow"** when prompted
4. If it works, clear site settings in your main browser

---

## ✅ Solution 5: Check Browser Console for Errors

This helps diagnose the exact issue.

1. Press **F12** to open DevTools
2. Go to **"Console"** tab
3. Try to enable camera on your site
4. Look for errors:

**Common Error Messages**:

### Error: "NotAllowedError: Permission denied"
**Cause**: Browser blocked camera access  
**Fix**: Use Solution 2 (Grant Browser Permissions)

### Error: "NotFoundError: No camera found"
**Cause**: No physical camera connected  
**Fix**: Connect a webcam or use a device with a built-in camera

### Error: "NotSecureError: Not HTTPS"
**Cause**: Site is served over HTTP  
**Fix**: Use Solution 1 (Force HTTPS)

### Error: "NotReadableError: Camera in use"
**Cause**: Another app is using the camera  
**Fix**: Close other apps (Zoom, Skype, OBS, etc.) and try again

---

## ✅ Solution 6: Verify Vercel HTTPS Configuration

Vercel automatically provides HTTPS, but let's verify:

1. Go to https://vercel.com/dashboard
2. Select your **facepay** project
3. Go to **Settings** → **Domains**
4. Verify your domain shows **"SSL Certificate: Active"**
5. If not, click **"Refresh Certificates"**

---

## ✅ Solution 7: Test with Different Browser

Try a different browser to isolate the issue:

1. **Chrome**: Best compatibility with WebRTC/MediaPipe
2. **Edge**: Uses same engine as Chrome, should work identically
3. **Firefox**: Good support but slightly different permission UI
4. **Safari**: Limited to macOS/iOS, good support on Apple devices

If it works in one browser but not another, the issue is browser-specific permissions (use Solution 2 or 3 for that browser).

---

## 🧪 Quick Test: Does Your Camera Work?

Test your camera directly in the browser:

1. Open a new tab
2. Go to: https://webcamtests.com
3. Click **"Test My Cam"**
4. If camera works here but not on your site, it's a permission issue (use Solution 2)
5. If camera doesn't work anywhere, check physical camera connection

---

## 📋 Checklist

Go through these in order:

- [ ] URL starts with `https://` (not `http://`)
- [ ] Padlock icon 🔒 appears in address bar
- [ ] Camera permission set to "Allow" in browser settings
- [ ] No other apps are using the camera (Zoom, Skype, etc.)
- [ ] Tried refreshing the page (F5)
- [ ] Tried clearing cache and hard reload (Ctrl+Shift+R)
- [ ] Tested in incognito/private mode
- [ ] Checked browser console (F12) for error messages
- [ ] Camera works on other websites (webcamtests.com)
- [ ] Tried a different browser

---

## 🚨 Still Not Working?

If none of the above solutions work:

1. **Share the exact error message** from browser console (F12 → Console)
2. **Share your Vercel URL** so we can verify HTTPS configuration
3. **Share which browser/OS** you're using (Chrome 120 on Windows 11, etc.)
4. **Share screenshot** of the permission settings

Common blockers:
- Corporate firewall blocking camera access
- Antivirus software blocking camera
- Windows Privacy settings blocking camera
- macOS System Preferences blocking camera
- Camera driver issues (update drivers)

---

## 🎉 Success!

Once camera access works:
- Green checkmark ✅ will appear
- Camera preview will show your face
- You can proceed with face registration/verification

---

**Last Updated**: ${new Date().toISOString()}
