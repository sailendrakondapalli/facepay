import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 Starting WebAuthn registration...')
    
    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.log('❌ Missing environment variables')
      return new Response(JSON.stringify({ 
        error: 'Server configuration error',
        details: 'Missing environment variables'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Get auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('❌ No authorization header')
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create Supabase client
    console.log('🔗 Creating Supabase client...')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    
    // Get user
    console.log('👤 Getting user...')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError) {
      console.log('❌ User error:', userError)
      return new Response(JSON.stringify({ 
        error: 'Authentication failed', 
        details: userError.message 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (!user) {
      console.log('❌ No user found')
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ User authenticated:', user.id)
    
    // Parse request body
    let requestBody
    try {
      const bodyText = await req.text()
      requestBody = JSON.parse(bodyText)
      console.log('📄 Request body parsed successfully')
    } catch (e) {
      console.log('❌ Invalid JSON:', e)
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { userId } = requestBody
    if (userId !== user.id) {
      console.log('❌ User ID mismatch')
      return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Generate challenge
    console.log('🎲 Generating challenge...')
    const challengeArray = new Uint8Array(32)
    crypto.getRandomValues(challengeArray)
    const challenge = btoa(String.fromCharCode.apply(null, Array.from(challengeArray)))
    
    // Get origin
    const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://facepay-kappa.vercel.app'
    let rpId = 'facepay-kappa.vercel.app' // Default fallback
    
    try {
      const url = new URL(origin)
      rpId = url.hostname
      console.log('🌐 RP ID:', rpId)
    } catch (e) {
      console.log('⚠️ Using fallback RP ID:', rpId)
    }
    
    // Create WebAuthn options
    const options = {
      challenge,
      rp: {
        name: "FacePay",
        id: rpId
      },
      user: {
        id: user.id,
        name: user.email || user.id,
        displayName: user.user_metadata?.full_name || user.email || 'User'
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256
        { alg: -257, type: "public-key" }  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged"
      },
      timeout: 300000,
      attestation: "none"
    }
    
    console.log('📋 WebAuthn options created')
    
    // Store challenge in database
    console.log('💾 Storing challenge in database...')
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    
    const { error: insertError } = await supabase
      .from('webauthn_challenges')
      .insert({
        user_id: user.id,
        challenge,
        expires_at: expiresAt
      })
    
    if (insertError) {
      console.log('❌ Database error:', insertError)
      return new Response(JSON.stringify({ 
        error: 'Database error', 
        details: insertError.message,
        code: insertError.code
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ Challenge stored successfully')
    
    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('💥 Unexpected error:', error)
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message,
      name: error.name
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})