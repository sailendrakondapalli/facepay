# 🚨 Critical Production Issues - Fix Plan

## Issues Reported

1. **Camera not loading sometimes** 
2. **Payment deducts multiple times**
3. **Detection too slow**
4. **False success (unregistered users show captured/tick)**

---

## Root Causes & Solutions

### Issue 1: Camera Not Loading Sometimes

**Root Cause**: 
- No retry logic when camera initialization fails
- Browser permissions not properly handled
- MediaDevices API errors not caught properly

**Solution**:
1. Add automatic retry with exponential backoff
2. Better permission request flow
3. Clearer error messages
4. Fallback to lower quality if HD fails

---

### Issue 2: Payment Deducts Multiple Times

**Root Cause**:
- No payment lock/guard to prevent duplicate submissions
- User can click verify/pay multiple times while processing
- No transaction deduplication check

**Solution**:
1. Add payment processing lock (prevent concurrent payments)
2. Disable buttons during processing
3. Add transaction nonce validation
4. Check for duplicate transactions in last 60 seconds

---

### Issue 3: Detection Too Slow

**Root Cause**:
- Frame processing interval too frequent (every 200ms)
- API calls to Render backend have latency (free tier cold starts)
- No local caching of detection results

**Solution**:
1. Reduce API calls - only send when quality is good
2. Increase frame processing interval to 500ms
3. Add local face detection before API call
4. Cache embeddings locally for faster re-verification

---

### Issue 4: False Success (Unregistered Users)

**Root Cause**:
- Threshold too low (0.75 = 75% match)
- Success shown even when `identified: false`
- Quality check bypassed in some flows

**Solution**:
1. Raise threshold to 0.85 (85% match minimum)
2. Add strict validation: must have `identified: true` AND `similarity >= threshold`
3. Show clear "NOT REGISTERED" message for unregistered users
4. Add visual feedback (red X for failed, green check only for success)

---

## Implementation

### File 1: BiometricCamera.jsx

**Changes**:
1. Camera retry logic
2. Slower frame processing (500ms instead of 200ms)
3. Better success/failure states
4. Clear error messages

### File 2: MerchantDashboard.jsx

**Changes**:
1. Payment lock guard
2. Stricter identification validation
3. Duplicate transaction check
4. Button disable during processing
5. Raise threshold to 0.85

### File 3: biometric-api.js

**Changes**:
1. Add timeout handling
2. Better error messages
3. Retry failed API calls

---

## Priority Order

1. **CRITICAL**: Fix false success (security issue!)
2. **HIGH**: Fix multiple payments (money issue!)
3. **MEDIUM**: Fix slow detection (UX issue)
4. **LOW**: Fix camera loading (rare issue)

---

## Testing Checklist

After fixes:
- [ ] Unregistered face shows "NOT REGISTERED" (not success)
- [ ] Clicking pay button multiple times only processes once
- [ ] Detection feels faster (<2 seconds)
- [ ] Camera recovers gracefully from errors
- [ ] Payment only deducts once
- [ ] Threshold at 85% prevents false matches

---

**Created**: ${new Date().toISOString()}
