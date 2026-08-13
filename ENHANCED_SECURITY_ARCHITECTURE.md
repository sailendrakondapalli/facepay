# 🔐 Enhanced Security Architecture - Multi-Factor Biometric Payment

## Overview

Separate **Identification** from **Authorization** using multiple biometric factors.

---

## 🎯 Core Principle

**Face = WHO you are** (Identification)  
**Fingerprint/Device Biometric = Authorization** (Proof you approve this payment)

---

## 📱 Platform-Specific Implementations

### 🤖 Android App

```
Flow:
1. Camera → YuNet + SFace → Identify user (WHO)
2. BiometricPrompt → Device fingerprint/face → Authorize payment (PROOF)
3. Supabase → User account
4. Backend → Process payment

Tech Stack:
- Camera: CameraX / Camera2 API
- Face Recognition: YuNet + SFace (your existing backend)
- Device Biometric: BiometricPrompt API
- Database: Supabase
- Backend: Your Flask API on Render
```

**Key Point**: App NEVER receives actual fingerprint data. Android returns:
```kotlin
// ✅ What you get
onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult)

// ❌ What you DON'T get
actualFingerprintImage
fingerprintPattern
```

---

### 🍎 iPhone App

```
Flow:
1. Camera → YuNet + SFace → Identify user (WHO)
2. LocalAuthentication → Touch ID / Face ID → Authorize payment (PROOF)
3. Supabase → User account
4. Backend → Process payment

Tech Stack:
- Camera: AVFoundation
- Face Recognition: YuNet + SFace (your existing backend)
- Device Biometric: LocalAuthentication framework
- Database: Supabase
- Backend: Your Flask API on Render
```

**Key Point**: Same as Android - you only get authentication success/failure.

---

### 💻 Laptop Website (Enhanced Current System)

```
Flow:
1. Camera → YuNet + SFace → Identify user (WHO)
2. WebAuthn/Passkeys → Device biometric → Authorize payment (PROOF)
3. Backend verifies both → Process payment

Tech Stack:
- Camera: getUserMedia (existing)
- Face Recognition: YuNet + SFace (existing)
- Device Biometric: WebAuthn API
- Supports:
  - Windows Hello Fingerprint
  - Windows Hello Face
  - Mac Touch ID
  - Security Keys (YubiKey, etc.)
  - Phone/Passkey
```

**Key Point**: You receive cryptographic proof, not biometric data.

---

## 🗄️ Database Schema Changes

### ❌ Current (INSECURE - Don't Store)
```sql
-- BAD: Never store these
fingerprint_image
fingerprint_pattern
raw_biometric_data
```

### ✅ New (SECURE Schema)

```sql
-- Users table (unchanged)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Face embeddings (existing - keep this)
CREATE TABLE customer_biometrics (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  face_embedding VECTOR(128),  -- YuNet + SFace embedding
  quality_score DECIMAL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- WebAuthn credentials (NEW - for laptop/web)
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  credential_id TEXT UNIQUE NOT NULL,  -- Public key credential ID
  public_key BYTEA NOT NULL,            -- User's public key
  counter BIGINT DEFAULT 0,             -- Signature counter (anti-replay)
  transports TEXT[],                    -- ['usb', 'nfc', 'ble', 'internal']
  device_type TEXT,                     -- 'platform' or 'cross-platform'
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

-- Device biometric sessions (NEW - for mobile)
CREATE TABLE device_biometric_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_id TEXT NOT NULL,              -- Unique device identifier
  platform TEXT NOT NULL,               -- 'android', 'ios', 'web'
  biometric_type TEXT NOT NULL,         -- 'fingerprint', 'face', 'iris'
  session_token TEXT UNIQUE NOT NULL,   -- Encrypted session token
  challenge TEXT NOT NULL,              -- Challenge for this session
  verified_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment authorizations (NEW - track both factors)
CREATE TABLE payment_authorizations (
  id UUID PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id),
  user_id UUID REFERENCES users(id),
  
  -- Identification factor (WHO)
  face_similarity DECIMAL,
  face_embedding_id UUID REFERENCES customer_biometrics(id),
  
  -- Authorization factor (PROOF)
  device_biometric_verified BOOLEAN,
  webauthn_credential_id UUID REFERENCES webauthn_credentials(id),
  challenge TEXT NOT NULL,
  signature TEXT,
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  geolocation JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Enhanced Payment Flow

### Current Flow (Web Only - Single Factor)
```
1. Face scan → Identify → Verify same person → Pay
```

### New Flow (Multi-Factor)

#### Step 1: Identification (WHO)
```
User → Merchant terminal
  ↓
Camera captures face
  ↓
YuNet detects face
  ↓
SFace generates embedding (128D vector)
  ↓
Backend searches database (1:N matching)
  ↓
User identified: "John Doe" (Similarity: 85%)
  ↓
Display: "Hello John! Ready to pay ₹500?"
```

#### Step 2: Authorization (PROOF)
```
User confirms amount
  ↓
Backend generates challenge (random nonce)
  ↓
Frontend requests device biometric
  ↓
[PLATFORM SPECIFIC]

Android:
  ├── BiometricPrompt.authenticate()
  ├── User places finger on sensor
  └── ✅ Authentication succeeded

iOS:
  ├── LAContext.evaluatePolicy()
  ├── User uses Touch ID / Face ID
  └── ✅ Authentication succeeded

Web/Laptop:
  ├── navigator.credentials.get() [WebAuthn]
  ├── User uses Windows Hello / Touch ID
  └── ✅ Signature verified

  ↓
Frontend sends: {
  challenge,
  signature (WebAuthn) OR session_token (mobile),
  face_embedding_id
}
  ↓
Backend verifies BOTH:
  ✅ Face identified (WHO)
  ✅ Device biometric verified (PROOF)
  ↓
Payment authorized ✅
  ↓
Money transferred
```

---

## 💻 Web Implementation (WebAuthn)

### Registration Flow

```javascript
// 1. User enrolls face (existing)
await enrollFace(biometricData)

// 2. User registers WebAuthn credential (NEW)
async function registerWebAuthn(userId) {
  // Get challenge from backend
  const { challenge, user } = await fetch('/api/webauthn/register/begin', {
    method: 'POST',
    body: JSON.stringify({ userId })
  }).then(r => r.json())
  
  // Create credential
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: Uint8Array.from(challenge, c => c.charCodeAt(0)),
      rp: {
        name: "FacePay",
        id: window.location.hostname
      },
      user: {
        id: Uint8Array.from(user.id, c => c.charCodeAt(0)),
        name: user.email,
        displayName: user.name
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },  // ES256
        { type: "public-key", alg: -257 } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Prefer built-in biometric
        userVerification: "required"
      },
      timeout: 60000,
      attestation: "direct"
    }
  })
  
  // Send credential to backend
  await fetch('/api/webauthn/register/complete', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      credentialId: credential.id,
      publicKey: Array.from(new Uint8Array(credential.response.attestationObject)),
      clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON))
    })
  })
}
```

### Payment Authorization Flow

```javascript
// Enhanced payment flow with WebAuthn
async function authorizePayment(identifiedUserId, amount) {
  // 1. User already identified via face (existing)
  
  // 2. Get WebAuthn challenge from backend
  const { challenge, allowCredentials } = await fetch('/api/webauthn/authenticate/begin', {
    method: 'POST',
    body: JSON.stringify({ userId: identifiedUserId, amount })
  }).then(r => r.json())
  
  // 3. Request device biometric authentication
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: Uint8Array.from(challenge, c => c.charCodeAt(0)),
      allowCredentials: allowCredentials.map(cred => ({
        type: "public-key",
        id: Uint8Array.from(cred.id, c => c.charCodeAt(0))
      })),
      userVerification: "required",
      timeout: 60000
    }
  })
  
  // 4. Send assertion to backend for verification
  const result = await fetch('/api/webauthn/authenticate/complete', {
    method: 'POST',
    body: JSON.stringify({
      userId: identifiedUserId,
      amount,
      credentialId: assertion.id,
      authenticatorData: Array.from(new Uint8Array(assertion.response.authenticatorData)),
      clientDataJSON: Array.from(new Uint8Array(assertion.response.clientDataJSON)),
      signature: Array.from(new Uint8Array(assertion.response.signature))
    })
  })
  
  return result
}
```

---

## 📱 Mobile Implementation Examples

### Android (Kotlin)

```kotlin
// BiometricPrompt setup
class PaymentActivity : AppCompatActivity() {
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Setup biometric prompt
        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    super.onAuthenticationSucceeded(result)
                    // ✅ Device biometric verified
                    processPayment()
                }
                
                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    // ❌ Authentication failed
                    showError("Fingerprint not recognized")
                }
            }
        )
        
        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authorize Payment")
            .setSubtitle("Pay ₹${amount} to ${merchantName}")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()
    }
    
    fun authorizePayment() {
        // Step 1: Face already identified user
        // Step 2: Request device biometric
        biometricPrompt.authenticate(promptInfo)
    }
    
    private fun processPayment() {
        // Send to backend with session token
        api.authorizePayment(
            userId = identifiedUserId,
            amount = amount,
            challenge = challenge,
            sessionToken = generateSecureToken()
        )
    }
}
```

### iOS (Swift)

```swift
import LocalAuthentication

class PaymentViewController: UIViewController {
    func authorizePayment(amount: Decimal, merchantName: String) {
        let context = LAContext()
        var error: NSError?
        
        // Check if biometric authentication is available
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            showError("Biometric authentication not available")
            return
        }
        
        // Request authentication
        let reason = "Authorize payment of ₹\(amount) to \(merchantName)"
        
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            DispatchQueue.main.async {
                if success {
                    // ✅ Device biometric verified
                    self.processPayment()
                } else {
                    // ❌ Authentication failed
                    self.showError("Authentication failed: \(error?.localizedDescription ?? "Unknown error")")
                }
            }
        }
    }
    
    private func processPayment() {
        // Send to backend with session token
        api.authorizePayment(
            userId: identifiedUserId,
            amount: amount,
            challenge: challenge,
            sessionToken: generateSecureToken()
        )
    }
}
```

---

## 🔒 Backend Verification

```python
# Flask endpoint for WebAuthn verification
from webauthn import verify_authentication_response

@app.route('/api/webauthn/authenticate/complete', methods=['POST'])
def verify_webauthn():
    data = request.json
    
    # 1. Verify face identification happened
    face_auth = get_face_authorization(data['userId'])
    if not face_auth or face_auth['similarity'] < 0.75:
        return jsonify({'error': 'Face not identified'}), 401
    
    # 2. Get stored credential
    credential = get_webauthn_credential(data['credentialId'])
    if not credential or credential['user_id'] != data['userId']:
        return jsonify({'error': 'Invalid credential'}), 401
    
    # 3. Verify WebAuthn signature
    try:
        verification = verify_authentication_response(
            credential=credential['public_key'],
            authenticator_data=bytes(data['authenticatorData']),
            client_data_json=bytes(data['clientDataJSON']),
            signature=bytes(data['signature']),
            challenge=get_challenge(data['userId']),
            origin=request.origin,
            rp_id=request.host
        )
        
        # 4. Both factors verified ✅
        if verification.verified:
            # Process payment
            transaction_id = process_payment(
                user_id=data['userId'],
                amount=data['amount']
            )
            
            # Log authorization
            log_payment_authorization(
                transaction_id=transaction_id,
                user_id=data['userId'],
                face_similarity=face_auth['similarity'],
                webauthn_verified=True
            )
            
            return jsonify({
                'success': True,
                'transaction_id': transaction_id
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 401
```

---

## 🎯 Migration Plan

### Phase 1: Current System (✅ Complete)
- Face identification only
- Threshold: 75%
- Working on web

### Phase 2: Add WebAuthn (Web - Recommended Next)
- Keep existing face recognition
- Add WebAuthn authorization layer
- Users can use Windows Hello, Touch ID, etc.
- **Estimated time**: 2-3 days

### Phase 3: Mobile Apps (Future)
- Android app with BiometricPrompt
- iOS app with LocalAuthentication
- Same face recognition backend
- **Estimated time**: 2-3 weeks per platform

---

## 🔐 Security Benefits

| Factor | Current (Single) | Enhanced (Multi) |
|--------|------------------|------------------|
| Face spoofing attack | ❌ Vulnerable | ✅ Blocked (needs device biometric too) |
| Stolen photo | ❌ Might work | ✅ Blocked (needs device access) |
| Unauthorized device | ⚠️ Risk | ✅ Blocked (device biometric required) |
| Replay attack | ⚠️ Risk | ✅ Blocked (challenge-response) |
| Security level | Medium | High ✅ |

---

## 📊 Comparison

### Single Factor (Current)
```
Face scan (75% match) → ✅ Payment approved
```
**Risk**: Stolen photo might work

### Multi-Factor (Enhanced)
```
Face scan (75% match) → WHO you are ✅
    +
Device biometric → PROOF you approve ✅
    =
Payment approved ✅
```
**Security**: Both factors required

---

## ✅ Recommended Implementation Order

1. **Now**: Fix threshold to 75% (✅ Done)
2. **This Week**: Test and stabilize face recognition
3. **Next Week**: Add WebAuthn to web app
4. **Month 1**: Build Android app
5. **Month 2**: Build iOS app
6. **Month 3**: Production launch all platforms

---

## 📝 Summary

**Key Changes**:
- ✅ Never store raw biometric data (fingerprints, etc.)
- ✅ Store only: face embeddings, WebAuthn public keys, session tokens
- ✅ Separate identification (face) from authorization (device biometric)
- ✅ Use platform APIs (never receive raw biometrics)
- ✅ Implement challenge-response for anti-replay

**Security Level**: 🔒🔒🔒 High (Multi-factor biometric)

**Next Step**: Implement WebAuthn for web app (2-3 days)

