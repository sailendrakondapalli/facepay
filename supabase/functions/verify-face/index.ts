import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface VerifyRequest {
  embedding: number[]
  customerProfileId: string
  transactionNonce: string
  verificationThreshold?: number
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
        JSON.stringify({ error: 'Only merchants can perform face verification' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { embedding, customerProfileId, transactionNonce, verificationThreshold }: VerifyRequest = await req.json()

    // Validate input
    if (!embedding || !Array.isArray(embedding) || embedding.length !== 512) {
      return new Response(
        JSON.stringify({ error: 'Invalid embedding: must be an array of 512 numbers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!customerProfileId || typeof customerProfileId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid customer profile ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!transactionNonce || typeof transactionNonce !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid transaction nonce' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const threshold = verificationThreshold ?? 0.90 // Higher threshold for 1:1 verification

    // Call secure RPC function for 1:1 face verification
    // Convert embedding array to pgvector format
    const { data: verificationResult, error: verifyError } = await supabaseAdmin
      .rpc('verify_face_embedding', {
        customer_profile_id_param: customerProfileId,
        query_embedding: `[${embedding.join(',')}]`,
        verification_threshold: threshold
      })

    if (verifyError) {
      console.error('Face verification error:', verifyError)
      
      // Log failed verification
      await supabaseAdmin.from('biometric_audit_log').insert({
        user_id: user.id,
        action: 'verify',
        success: false,
        error_message: verifyError.message,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown'
      })

      return new Response(
        JSON.stringify({ error: 'Face verification failed', details: verifyError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check verification result
    if (!verificationResult || verificationResult.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No biometric data found for customer' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = verificationResult[0]
    const verified = result.verification_status === 'VERIFIED'
    const similarity = result.similarity_score

    // Get customer details
    const { data: customerProfile, error: customerError } = await supabaseAdmin
      .from('customer_profiles')
      .select('user_id, facepay_id')
      .eq('id', customerProfileId)
      .single()

    // Log verification attempt
    await supabaseAdmin.from('biometric_audit_log').insert({
      user_id: customerProfile?.user_id || null,
      action: 'verify',
      success: verified,
      similarity_score: similarity,
      error_message: verified ? null : 'Verification threshold not met',
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown'
    })

    if (!verified) {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          message: 'Face verification failed - similarity below threshold',
          similarity,
          threshold,
          status: 'FAILED'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verification successful - return authorization token
    // Generate a cryptographically secure verification token
    const verificationToken = crypto.randomUUID()
    
    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        message: 'Face verification successful',
        similarity,
        threshold,
        status: 'VERIFIED',
        verificationToken, // Use this to authorize the transaction
        customerProfileId,
        facepayId: customerProfile?.facepay_id,
        transactionNonce,
        timestamp: new Date().toISOString(),
        expiresIn: 300 // Token valid for 5 minutes
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Verification function error:', error)
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