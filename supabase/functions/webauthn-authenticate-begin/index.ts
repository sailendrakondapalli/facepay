import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// Simple Supabase client
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
      if (!response.ok) throw new Error(`Auth failed: ${response.status}`)
      return await response.json()
    },
    
    async getUserCredentials(userId: string) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/webauthn_credentials?user_id=eq.${userId}&select=credential_id,transports`, {
        headers: {
          'Authorization': authHeader,
          'apikey': SUPABASE_ANON_KEY
        }
      })
      if (!response.ok) throw new Error('Failed to get credentials')
      return await response.json()
    },
    
    async insertChallenge(userId: string, challenge: string, transactionData: any) {
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
          transaction_data: transactionData,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        })
      })
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Database error: ${error}`)
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
    console.log('🔄 WebAuthn Authentication Begin - Starting')
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = await createSupabaseClient(authHeader)
    const user = await supabase.getUser()
    
    const { userId, transactionData } = await req.json()
    
    // Get user's registered credentials
    const userCredentials = await supabase.getUserCredentials(userId)
    console.log('📊 Found credentials:', userCredentials.length)
    
    if (!userCredentials || userCredentials.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No biometric authenticators registered',
        message: 'Please register Windows Hello, Touch ID, or fingerprint first'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Generate authentication challenge
    const challengeArray = new Uint8Array(32)
    crypto.getRandomValues(challengeArray)
    const challenge = btoa(String.fromCharCode(...challengeArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    
    // Get RP ID
    const origin = req.headers.get('origin') || 'https://facepay-kappa.vercel.app'
    let rpId = 'facepay-kappa.vercel.app'
    try {
      rpId = new URL(origin).hostname
    } catch (e) {
      console.log('Using fallback RP ID')
    }
    
    // Create WebAuthn authentication options
    const options = {
      challenge,
      rpId,
      allowCredentials: userCredentials.map((cred: any) => ({
        id: cred.credential_id,
        type: 'public-key',
        transports: cred.transports || ['internal']
      })),
      userVerification: 'required',
      timeout: 300000
    }
    
    // Store challenge with transaction data
    await supabase.insertChallenge(userId, challenge, transactionData)
    console.log('✅ Challenge stored, returning authentication options')
    
    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Authentication failed',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})