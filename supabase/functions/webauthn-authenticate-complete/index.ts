import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuthenticationResponse } from 'https://esm.sh/@simplewebauthn/server@10.0.0'

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
