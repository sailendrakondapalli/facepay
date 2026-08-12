import { supabase } from './supabase.js'
import { enrollFace as enrollFaceYuNet, verifyFace as verifyFaceYuNet } from './face-recognition-yunet.js'

/**
 * Get Supabase Edge Function URL
 */
function getEdgeFunctionUrl(functionName) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL environment variable not set')
  }
  return `${supabaseUrl}/functions/v1/${functionName}`
}

/**
 * Get authentication token for Edge Function requests
 */
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  return session.access_token
}

/**
 * Enroll customer face biometric data
 * Now uses the YuNet + SFace backend for production-grade face recognition
 * @param {Object} biometricData - Data from BiometricCamera onSuccess callback
 * @returns {Promise<Object>} Enrollment result
 */
export async function enrollFace(biometricData) {
  try {
    const token = await getAuthToken()
    
    // Get current user info
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User not authenticated')
    }

    // Call YuNet + SFace backend for enrollment
    const enrollmentResult = await enrollFaceYuNet(
      biometricData,
      user.id,
      user.email || user.user_metadata?.full_name || 'Customer'
    )
    
    if (!enrollmentResult.success) {
      throw new Error(enrollmentResult.error || 'Enrollment failed')
    }

    console.log('Face enrolled via YuNet + SFace:', enrollmentResult)
    
    return {
      success: true,
      enrollment_id: enrollmentResult.enrollment_id,
      quality_score: enrollmentResult.quality_score,
      message: enrollmentResult.message,
      metadata: {
        model: 'YuNet + SFace',
        backend: 'python-opencv'
      }
    }
  } catch (error) {
    console.error('enrollFace error:', error)
    throw error
  }
}

/**
 * Identify customer from face (1:N matching)
 * Now uses the YuNet + SFace backend for production-grade face recognition
 * @param {Object} biometricData - Data from BiometricCamera onSuccess callback
 * @param {number} [matchThreshold=0.5] - Similarity threshold for matching (adjusted for SFace)
 * @returns {Promise<Object>} Identification result with customer info
 */
export async function identifyFace(biometricData, matchThreshold = 0.5) {
  try {
    const token = await getAuthToken()
    
    // Call YuNet + SFace backend for verification/identification
    const verifyResult = await verifyFaceYuNet(biometricData, matchThreshold)
    
    if (!verifyResult.success) {
      throw new Error(verifyResult.error || 'Identification failed')
    }

    // Convert YuNet verification result to identification format
    if (verifyResult.verified && verifyResult.matched_user) {
      return {
        success: true,
        identified: true,
        customer: {
          id: verifyResult.matched_user.user_id,
          name: verifyResult.matched_user.user_name,
          similarity: verifyResult.similarity
        },
        similarity: verifyResult.similarity,
        threshold: verifyResult.metadata?.threshold || matchThreshold,
        metadata: {
          ...verifyResult.metadata,
          backend: 'yunet-sface',
          total_registered_users: verifyResult.metadata?.total_registered_users || 0
        }
      }
    } else {
      return {
        success: true,
        identified: false,
        similarity: verifyResult.similarity || 0,
        threshold: matchThreshold,
        metadata: {
          ...verifyResult.metadata,
          backend: 'yunet-sface'
        }
      }
    }
  } catch (error) {
    console.error('identifyFace error:', error)
    throw error
  }
}

/**
 * Verify customer face for transaction (1:1 matching)
 * Now uses the YuNet + SFace backend for production-grade face recognition
 * @param {Object} biometricData - Data from BiometricCamera onSuccess callback
 * @param {string} customerProfileId - Customer profile ID to verify against
 * @param {string} transactionNonce - Unique nonce for this transaction
 * @param {number} [verificationThreshold=0.6] - Similarity threshold for verification (adjusted for SFace)
 * @returns {Promise<Object>} Verification result with token
 */
export async function verifyFace(biometricData, customerProfileId, transactionNonce, verificationThreshold = 0.6) {
  try {
    const token = await getAuthToken()
    
    // Call YuNet + SFace backend for verification
    const verifyResult = await verifyFaceYuNet(biometricData, verificationThreshold)
    
    if (!verifyResult.success) {
      throw new Error(verifyResult.error || 'Verification failed')
    }

    // Check if the verified user matches the requested customer profile
    let matchesProfile = false
    if (verifyResult.verified && verifyResult.matched_user) {
      matchesProfile = verifyResult.matched_user.user_id === customerProfileId
    }

    return {
      success: true,
      verified: verifyResult.verified && matchesProfile,
      similarity: verifyResult.similarity,
      threshold: verificationThreshold,
      customer: verifyResult.matched_user,
      transactionNonce,
      metadata: {
        ...verifyResult.metadata,
        backend: 'yunet-sface',
        profile_match: matchesProfile,
        requested_profile: customerProfileId
      }
    }
  } catch (error) {
    console.error('verifyFace error:', error)
    throw error
  }
}

/**
 * Generate cryptographically secure transaction nonce
 * @returns {string} Unique transaction nonce
 */
export function generateTransactionNonce() {
  // Generate random bytes and convert to hex
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}
