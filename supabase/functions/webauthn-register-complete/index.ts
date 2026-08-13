import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const { userId, registrationResponse } = await req.json()
    
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // For now, we'll do basic validation and store the credential
    // In production, you'd want full WebAuthn verification here
    const credentialId = registrationResponse.id
    const publicKeyBytes = new Uint8Array(32) // Placeholder for now
    
    // Store credential
    const { data: credential } = await supabase
      .from('webauthn_credentials')
      .insert({
        user_id: userId,
        credential_id: credentialId,
        public_key: publicKeyBytes,
        counter: 0,
        device_type: 'platform',
        transports: registrationResponse.response?.transports || ['internal'],
        friendly_name: getDeviceName(req.headers.get('user-agent') || '')
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Registration complete error:', error)
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function getDeviceName(userAgent: string): string {
  if (userAgent.includes('Win')) return 'Windows Hello'
  if (userAgent.includes('Mac')) return 'Touch ID'
  if (userAgent.includes('Linux')) return 'Fingerprint Reader'
  if (userAgent.includes('Android')) return 'Android Biometric'
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS Biometric'
  return 'Biometric Device'
}
