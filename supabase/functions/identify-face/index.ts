import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface IdentifyRequest {
  embedding: number[]
  matchThreshold?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authenticated user (merchant)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase clients
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Verify merchant authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user is a merchant
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'merchant') {
      return new Response(
        JSON.stringify({ error: 'Only merchants can perform face identification' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { embedding, matchThreshold }: IdentifyRequest = await req.json()

    // Validate input
    if (!embedding || !Array.isArray(embedding) || embedding.length !== 512) {
      return new Response(
        JSON.stringify({ error: 'Invalid embedding: must be an array of 512 numbers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const threshold = matchThreshold ?? 0.85 // Default threshold from config

    // Call secure RPC function for 1:N face matching
    // Convert embedding array to pgvector format: [1,2,3,...] -> "[1,2,3,...]"
    const { data: matches, error: matchError } = await supabaseAdmin
      .rpc('match_face_embedding', {
        query_embedding: `[${embedding.join(',')}]`,
        match_threshold: threshold,
        match_count: 1
      })

    if (matchError) {
      console.error('Face matching error:', matchError)
      
      // Log failed identification
      await supabaseAdmin.from('biometric_audit_log').insert({
        user_id: user.id,
        action: 'identify',
        success: false,
        error_message: matchError.message,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown'
      })

      return new Response(
        JSON.stringify({ error: 'Face matching failed', details: matchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if match found
    if (!matches || matches.length === 0 || matches[0].match_status !== 'MATCH') {
      // Log failed match
      await supabaseAdmin.from('biometric_audit_log').insert({
        user_id: user.id,
        action: 'identify',
        success: false,
        similarity_score: matches?.[0]?.similarity_score || 0,
        error_message: 'No matching face found',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown'
      })

      return new Response(
        JSON.stringify({
          success: false,
          match: false,
          message: 'No matching customer found',
          similarity: matches?.[0]?.similarity_score || 0,
          threshold
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const matchedCustomer = matches[0]

    // Get customer details (but never return biometric embedding)
    const { data: customerProfile, error: customerError } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, facepay_id, facepay_enabled, transaction_limit, user_id')
      .eq('id', matchedCustomer.customer_profile_id)
      .single()

    if (customerError || !customerProfile) {
      return new Response(
        JSON.stringify({ error: 'Customer profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get customer name
    const { data: customerUser, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', customerProfile.user_id)
      .single()

    // Log successful identification
    await supabaseAdmin.from('biometric_audit_log').insert({
      user_id: matchedCustomer.customer_id,
      action: 'identify',
      success: true,
      similarity_score: matchedCustomer.similarity_score,
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown'
    })

    // Return match result (NO biometric data included)
    return new Response(
      JSON.stringify({
        success: true,
        match: true,
        customer: {
          id: customerProfile.id,
          userId: customerProfile.user_id,
          facepayId: customerProfile.facepay_id,
          fullName: customerUser?.full_name || 'Unknown',
          email: customerUser?.email,
          facepayEnabled: customerProfile.facepay_enabled,
          transactionLimit: customerProfile.transaction_limit
        },
        similarity: matchedCustomer.similarity_score,
        threshold,
        matchStatus: 'VERIFIED',
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Identification function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})