import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// Simple Supabase client without external imports
async function createSupabaseClient(authHeader: string) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  
  return {
    async getUser() {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': authHeader,
          'apikey': SUPABASE_ANON_KEY
        }
      })
      
      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`)
      }
      
      return await response.json()
    },
    
    async insertChallenge(userId: string, challenge: string) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/webauthn_challenges`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: userId,
          challenge,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        })
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Database error: ${response.status} - ${error}`)
      }
      
      return true
    }
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 WebAuthn Registration - Starting')
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get user
    const supabase = await createSupabaseClient(authHeader)
    const user = await supabase.getUser()
    
    console.log('✅ User authenticated:', user.id)
    
    // Parse request
    const { userId } = await req.json()
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Generate WebAuthn challenge
    const challengeArray = new Uint8Array(32)
    crypto.getRandomValues(challengeArray)
    // Convert to base64url (WebAuthn standard)
    const challenge = btoa(String.fromCharCode(...challengeArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    
    // Get origin and RP ID
    const origin = req.headers.get('origin') || 'https://facepay-kappa.vercel.app'
    let rpId = 'facepay-kappa.vercel.app'
    try {
      rpId = new URL(origin).hostname
    } catch (e) {
      console.log('Using fallback RP ID')
    }
    
    // Create WebAuthn registration options
    const options = {
      challenge,
      rp: {
        name: "FacePay - Biometric Payment System",
        id: rpId
      },
      user: {
        id: btoa(user.id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        name: user.email || user.id,
        displayName: user.user_metadata?.full_name || user.email || 'FacePay User'
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256 (Elliptic Curve)
        { alg: -257, type: "public-key" }  // RS256 (RSA)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",     // Built-in biometric (Windows Hello, Touch ID, etc.)
        userVerification: "required",           // MUST verify user identity
        residentKey: "discouraged"              // Don't store credential on device
      },
      timeout: 300000,  // 5 minutes
      attestation: "none"  // No attestation needed for our use case
    }
    
    // Store challenge in database
    await supabase.insertChallenge(user.id, challenge)
    console.log('✅ Challenge stored, returning options')
    
    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Registration failed',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})