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
    
    async getChallenge(userId: string) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/webauthn_challenges?user_id=eq.${userId}`, {
        headers: {
          'Authorization': authHeader,
          'apikey': SUPABASE_ANON_KEY
        }
      })
      if (!response.ok) throw new Error('Challenge not found')
      const data = await response.json()
      return data[0]
    },
    
    async storeCredential(credentialData: any) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/webauthn_credentials`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(credentialData)
      })
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to store credential: ${error}`)
      }
      const data = await response.json()
      return data[0]
    },
    
    async deleteChallenge(userId: string) {
      await fetch(`${SUPABASE_URL}/rest/v1/webauthn_challenges?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
          'apikey': SUPABASE_ANON_KEY
        }
      })
    }
  }
}

function getDeviceName(userAgent: string): string {
  if (userAgent.includes('Win')) return 'Windows Hello'
  if (userAgent.includes('Mac')) return 'Touch ID'
  if (userAgent.includes('Linux')) return 'Fingerprint Reader'
  if (userAgent.includes('Android')) return 'Android Biometric'
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS Biometric'
  return 'Biometric Device'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 WebAuthn Registration Complete - Starting')
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = await createSupabaseClient(authHeader)
    const user = await supabase.getUser()
    
    const { userId, registrationResponse } = await req.json()
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Get stored challenge
    const challengeData = await supabase.getChallenge(user.id)
    if (!challengeData) {
      return new Response(JSON.stringify({ error: 'Challenge not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('✅ Challenge found, processing registration response')
    
    // Extract credential data from registration response
    const credentialId = registrationResponse.id
    const publicKeyBytes = new Uint8Array(registrationResponse.response.publicKey || 64) // Placeholder
    
    // Store credential in database
    const credential = await supabase.storeCredential({
      user_id: user.id,
      credential_id: credentialId,
      public_key: publicKeyBytes,
      counter: 0,
      device_type: 'platform',
      transports: registrationResponse.response?.transports || ['internal'],
      friendly_name: getDeviceName(req.headers.get('user-agent') || '')
    })
    
    // Clean up challenge
    await supabase.deleteChallenge(user.id)
    
    console.log('✅ Credential stored successfully')
    
    return new Response(JSON.stringify({
      success: true,
      credentialId: credential.credential_id,
      friendlyName: credential.friendly_name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Registration completion failed',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})