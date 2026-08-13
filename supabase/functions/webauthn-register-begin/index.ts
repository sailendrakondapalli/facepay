// Import map for Deno
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('WebAuthn Register Begin - Starting')
    
    // Simple success response for now
    const response = {
      success: true,
      message: 'WebAuthn register begin endpoint is working',
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries())
    }
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Error in webauthn-register-begin:', error)
    
    return new Response(JSON.stringify({ 
      error: 'Server error',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})