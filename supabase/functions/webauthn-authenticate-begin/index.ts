import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateAuthenticationOptions } from 'https://esm.sh/@simplewebauthn/server@10.0.0'

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
    
    const { userId, transactionData } = await req.json()
    
    // Get user's credentials
    const { data: userCredentials } = await supabase
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId)
    
    if (!userCredentials || userCredentials.length === 0) {
      return new Response(JSON.stringify({ error: 'No credentials registered' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
