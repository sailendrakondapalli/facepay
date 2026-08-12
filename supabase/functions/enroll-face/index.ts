import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface EnrollRequest {
  embedding: number[]
  quality: number
  imageData?: string
  metadata: {
    modelName: string
    modelVersion: string
    timestamp: string
    livenessVerified: boolean
  }
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

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role key for admin operations
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

    // Verify user authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { embedding, quality, imageData, metadata }: EnrollRequest = await req.json()

    // Validate input
    if (!embedding || !Array.isArray(embedding) || embedding.length !== 512) {
      return new Response(
        JSON.stringify({ error: 'Invalid embedding: must be an array of 512 numbers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (typeof quality !== 'number' || quality < 0 || quality > 1) {
      return new Response(
        JSON.stringify({ error: 'Invalid quality: must be a number between 0 and 1' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!metadata?.modelName || !metadata?.modelVersion) {
      return new Response(
        JSON.stringify({ error: 'Invalid metadata: modelName and modelVersion required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user is a customer
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'customer') {
      return new Response(
        JSON.stringify({ error: 'Only customers can enroll biometric data' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get customer profile
    const { data: customerProfile, error: customerError } = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (customerError || !customerProfile) {
      return new Response(
        JSON.stringify({ error: 'Customer profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store optional enrollment image
    let enrollmentImagePath = null
    if (imageData) {
      try {
        // Extract base64 data
        const base64Data = imageData.split(',')[1]
        if (base64Data) {
          const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
          const fileName = `enrollment/${user.id}-${Date.now()}.jpg`
          
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('biometric-images')
            .upload(fileName, imageBuffer, {
              contentType: 'image/jpeg',
              upsert: false
            })

          if (!uploadError && uploadData) {
            enrollmentImagePath = uploadData.path
          }
        }
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError)
        // Continue without image - embedding is more important
      }
    }

    // Upsert biometric data (update if exists, insert if new)
    // Store embedding as pgvector format: [1,2,3,...]
    const { data: biometricData, error: biometricError } = await supabaseAdmin
      .from('customer_biometrics')
      .upsert({
        user_id: user.id,
        customer_profile_id: customerProfile.id,
        face_embedding: `[${embedding.join(',')}]`, // pgvector format
        model_name: metadata.modelName,
        embedding_version: metadata.modelVersion,
        quality_score: quality,
        enrollment_image_path: enrollmentImagePath,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()

    if (biometricError) {
      console.error('Biometric enrollment error:', biometricError)
      return new Response(
        JSON.stringify({ error: 'Failed to store biometric data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log successful enrollment
    await supabaseAdmin.from('biometric_audit_log').insert({
      user_id: user.id,
      action: 'enroll',
      success: true,
      similarity_score: quality, // Use quality as a proxy for enrollment confidence
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown'
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Biometric enrollment successful',
        data: {
          id: biometricData[0]?.id,
          quality: quality,
          modelName: metadata.modelName,
          modelVersion: metadata.modelVersion,
          enrollmentImagePath,
          timestamp: metadata.timestamp
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Enrollment function error:', error)
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