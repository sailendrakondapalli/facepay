# 🔐 WebAuthn Implementation Guide

## What Was Created

✅ Frontend WebAuthn library (`src/lib/webauthn.js`)  
✅ WebAuthn setup component (`src/components/WebAuthnSetup.jsx`)  
✅ Database schema (`webauthn-schema.sql`)  
✅ Package dependency added (`@simplewebauthn/browser`)

## 🚀 Implementation Steps

### Step 1: Install Dependencies

```bash
npm install
```

This will install `@simplewebauthn/browser` for WebAuthn support.

---

### Step 2: Run Database Migration

Execute the SQL schema in your Supabase database:

```bash
# Option 1: Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Open your project
3. Go to SQL Editor
4. Paste contents of webauthn-schema.sql
5. Click "Run"

# Option 2: psql (if you have direct access)
psql -h <your-supabase-host> -U postgres -d postgres -f webauthn-schema.sql
```

---

### Step 3: Create Supabase Edge Functions

You need to create 4 Edge Functions for WebAuthn. These run on Supabase's Deno runtime.

#### Install Supabase CLI

```bash
npm install -g supabase
```

#### Initialize Functions Directory

```bash
cd facelesspayment
supabase functions new webauthn-register-begin
supabase functions new webauthn-register-complete
supabase functions new webauthn-authenticate-begin
supabase functions new webauthn-authenticate-complete
```

---

### Step 4: Edge Function Implementations

#### A. `webauthn-register-begin`

Create file: `supabase/functions/webauthn-register-begin/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateRegistrationOptions } from 'https://esm.sh/@simplewebauthn/server@10.0.0'

serve(async (req) => {
  try {
    // Get user from auth
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Get request body
    const { userId } = await req.json()
    
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Get user's existing credentials
    const { data: existingCredentials } = await supabase
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId)
    
    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName: 'FacePay',
      rpID: new URL(req.headers.get('origin') || '').hostname,
      userID: userId,
      userName: user.email || user.id,
      userDisplayName: user.user_metadata?.full_name || user.email || 'User',
      attestationType: 'none',
      excludeCredentials: existingCredentials?.map(cred => ({
        id: cred.credential_id,
        type: 'public-key',
        transports: cred.transports || []
      })) || [],
      authenticatorSelection: {
        residentKey: 'discouraged',
        userVerification: 'required',
        authenticatorAttachment: 'platform' // Prefer built-in biometrics
      }
    })
    
    // Store challenge temporarily
    await supabase
      .from('webauthn_challenges')
      .insert({
        user_id: userId,
        challenge: options.challenge,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
      })
    
    return new Response(JSON.stringify(options), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

#### B. `webauthn-register-complete`

Create file: `supabase/functions/webauthn-register-complete/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyRegistrationResponse } from 'https://esm.sh/@simplewebauthn/server@10.0.0'

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const { userId, registrationResponse } = await req.json()
    
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Get stored challenge
    const { data: challengeData } = await supabase
      .from('webauthn_challenges')
      .select('challenge')
      .eq('user_id', userId)
      .single()
    
    if (!challengeData) {
      return new Response(JSON.stringify({ error: 'Challenge not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Verify registration
    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: req.headers.get('origin') || '',
      expectedRPID: new URL(req.headers.get('origin') || '').hostname
    })
    
    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Store credential
    const { credentialPublicKey, credentialID, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    
    const { data: credential } = await supabase
      .from('webauthn_credentials')
      .insert({
        user_id: userId,
        credential_id: Buffer.from(credentialID).toString('base64url'),
        public_key: credentialPublicKey,
        counter: counter,
        device_type: credentialDeviceType || 'platform',
        transports: registrationResponse.response.transports || ['internal'],
        friendly_name: await getDeviceName(req.headers.get('user-agent') || '')
      })
      .select()
      .single()
    
    // Clean up challenge
    await supabase
      .from('webauthn_challenges')
      .delete()
      .eq('user_id', userId)
    
    return new Response(JSON.stringify({
      success: true,
      credentialId: credential.credential_id
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function getDeviceName(userAgent: string): Promise<string> {
  if (userAgent.includes('Win')) return 'Windows Hello'
  if (userAgent.includes('Mac')) return 'Touch ID'
  if (userAgent.includes('Linux')) return 'Fingerprint Reader'
  if (userAgent.includes('Android')) return 'Android Biometric'
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS Biometric'
  return 'Biometric Device'
}
```

#### C. `webauthn-authenticate-begin`

Create file: `supabase/functions/webauthn-authenticate-begin/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateAuthenticationOptions } from 'https://esm.sh/@simplewebauthn/server@10.0.0'

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const { userId, transactionData } = await req.json()
    
    // Get user's credentials
    const { data: userCredentials } = await supabase
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId)
    
    if (!userCredentials || userCredentials.length === 0) {
      return new Response(JSON.stringify({ error: 'No credentials registered' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID: new URL(req.headers.get('origin') || '').hostname,
      allowCredentials: userCredentials.map(cred => ({
        id: Buffer.from(cred.credential_id, 'base64url'),
        type: 'public-key',
        transports: cred.transports || []
      })),
      userVerification: 'required'
    })
    
    // Store challenge with transaction data
    await supabase
      .from('webauthn_challenges')
      .insert({
        user_id: userId,
        challenge: options.challenge,
        transaction_data: transactionData,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      })
    
    return new Response(JSON.stringify(options), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

#### D. `webauthn-authenticate-complete`

Create file: `supabase/functions/webauthn-authenticate-complete/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuthenticationResponse } from 'https://esm.sh/@simplewebauthn/server@10.0.0'

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const { userId, transactionData, authenticationResponse } = await req.json()
    
    // Get stored challenge
    const { data: challengeData } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (!challengeData) {
      return new Response(JSON.stringify({ error: 'Challenge not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Get credential
    const credentialID = Buffer.from(authenticationResponse.id, 'base64url').toString('base64url')
    const { data: credential } = await supabase
      .from('webauthn_credentials')
      .select('*')
      .eq('credential_id', credentialID)
      .single()
    
    if (!credential) {
      return new Response(JSON.stringify({ error: 'Credential not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Verify authentication
    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: req.headers.get('origin') || '',
      expectedRPID: new URL(req.headers.get('origin') || '').hostname,
      authenticator: {
        credentialID: Buffer.from(credential.credential_id, 'base64url'),
        credentialPublicKey: credential.public_key,
        counter: credential.counter || 0
      }
    })
    
    if (!verification.verified) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Update counter
    await supabase
      .from('webauthn_credentials')
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString()
      })
      .eq('id', credential.id)
    
    // Generate authorization token
    const authorizationToken = crypto.randomUUID()
    
    // Clean up challenge
    await supabase
      .from('webauthn_challenges')
      .delete()
      .eq('user_id', userId)
    
    return new Response(JSON.stringify({
      success: true,
      verified: true,
      authorizationToken
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

---

### Step 5: Deploy Edge Functions

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy all functions
supabase functions deploy webauthn-register-begin
supabase functions deploy webauthn-register-complete
supabase functions deploy webauthn-authenticate-begin
supabase functions deploy webauthn-authenticate-complete
```

---

### Step 6: Integration with Payment Flow

Update `MerchantDashboard.jsx` to require WebAuthn authorization:

```javascript
// After face identification succeeds
async function handleVerificationCapture(biometricData) {
  // ... existing face verification code ...
  
  // Add WebAuthn authorization
  try {
    const webauthnResult = await authenticateWebAuthn(selectedCustomer.userId, {
      amount: parseFloat(amount),
      merchantId: merchantProfile.id,
      timestamp: new Date().toISOString()
    })
    
    if (!webauthnResult.verified) {
      setVerificationError('Device biometric authorization failed')
      return
    }
    
    // Both factors verified - process payment
    await processPayment(webauthnResult.authorizationToken)
  } catch (error) {
    setVerificationError(`Authorization failed: ${error.message}`)
  }
}
```

---

## 🧪 Testing

### Test Registration

1. Open Customer Dashboard
2. Navigate to "Security Settings"
3. Click "Register Biometric"
4. System prompts for Windows Hello / Touch ID
5. Authenticate
6. Credential saved ✅

### Test Payment Authorization

1. Merchant scans customer face → Identified ✅
2. Enter payment amount
3. Click "Authorize Payment"
4. System prompts for Windows Hello / Touch ID
5. Authenticate
6. Payment processed ✅

---

## 🔒 Security Benefits

| Attack Vector | Before WebAuthn | After WebAuthn |
|---------------|-----------------|----------------|
| Stolen Photo | ❌ Vulnerable | ✅ Blocked |
| Unauthorized Device | ⚠️ Risk | ✅ Blocked |
| Replay Attack | ⚠️ Risk | ✅ Blocked (challenge-response) |
| Phishing | ⚠️ Risk | ✅ Blocked (origin-bound) |

---

## 📱 Platform Support

| Platform | Authenticator | Support |
|----------|---------------|---------|
| Windows 10/11 | Windows Hello | ✅ |
| macOS | Touch ID | ✅ |
| Linux | Fingerprint Reader | ✅ |
| Android | Biometric | ✅ (Chrome) |
| iOS/iPadOS | Touch ID / Face ID | ✅ (Safari) |

---

## 🚀 Next Steps

1. ✅ Install npm dependencies
2. ✅ Run database migration
3. ⏳ Create Edge Functions
4. ⏳ Deploy Edge Functions
5. ⏳ Integrate with payment flow
6. ⏳ Test end-to-end

**Estimated Time**: 2-3 hours for full implementation

---

## 📚 Resources

- [WebAuthn Spec](https://www.w3.org/TR/webauthn-2/)
- [SimpleWebAuthn Docs](https://simplewebauthn.dev/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Windows Hello Guide](https://support.microsoft.com/windows/hello)
- [Touch ID Guide](https://support.apple.com/en-us/HT201371)

