/**
 * YuNet + SFace Face Recognition Client
 * Provides the same interface as the MediaPipe version but uses the production-grade Python backend
 */

// Face recognition configuration compatible with existing frontend
export const FACE_CONFIG = {
  EMBEDDING_DIMENSION: 128, // SFace produces 128D embeddings (vs 512D MediaPipe)
  MODEL_NAME: 'yunet-sface',
  MODEL_VERSION: 'v1.0',
  MATCH_THRESHOLD: 0.75,      // Tuned for SFace (was 0.5, raised for security but below 0.85)
  VERIFICATION_THRESHOLD: 0.75, // Lowered from 0.6 to 0.75 for better accuracy
  MIN_FACE_SIZE: 80,         // Adjusted for YuNet
  MAX_FACES: 1,
  QUALITY_THRESHOLD: 0.6     // Lowered for initial testing (was 0.8)
}

// API Configuration - use environment variable for production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL 
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : 'http://localhost:5000/api'

console.log('🔗 Face Recognition API URL:', API_BASE_URL.replace('/api', ''))

let apiInitialized = false

/**
 * Initialize the face recognition API
 * This replaces MediaPipe initialization with backend API check
 */
export async function initializeFaceModels() {
  if (apiInitialized) return

  try {
    console.log('Initializing YuNet + SFace face recognition API...')
    
    // Check if backend is available
    const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`)
    
    if (!response.ok) {
      throw new Error(`API health check failed: ${response.status}`)
    }
    
    const health = await response.json()
    
    if (!health.models_loaded) {
      throw new Error('Face recognition models not loaded on backend')
    }
    
    console.log('✅ YuNet + SFace API initialized successfully')
    console.log('📊 Backend stats:', {
      models_loaded: health.models_loaded,
      database_connected: health.database_connected
    })
    
    apiInitialized = true
    
  } catch (error) {
    console.error('❌ Failed to initialize YuNet + SFace API:', error)
    throw new Error('Face recognition initialization failed: ' + error.message)
  }
}

/**
 * Detect faces using YuNet backend
 * Compatible with existing MediaPipe detectFaces function
 */
export async function detectFaces(imageElement, timestamp = Date.now()) {
  if (!apiInitialized) {
    await initializeFaceModels()
  }

  try {
    // Convert image element to base64
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    // Set canvas size based on image
    if (imageElement instanceof HTMLVideoElement) {
      canvas.width = imageElement.videoWidth || 640
      canvas.height = imageElement.videoHeight || 480
    } else if (imageElement instanceof HTMLImageElement) {
      canvas.width = imageElement.width || imageElement.naturalWidth
      canvas.height = imageElement.height || imageElement.naturalHeight
    } else {
      throw new Error('Unsupported image element type')
    }
    
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height)
    const imageData = canvas.toDataURL('image/jpeg', 0.8)
    
    // Call backend API
    const response = await fetch(`${API_BASE_URL}/face/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageData })
    })
    
    const result = await response.json()
    
    if (!result.success) {
      console.warn('Face detection failed:', result.error)
      return []
    }
    
    // Convert backend response to MediaPipe-compatible format
    return [{
      landmarks: result.face.landmarks.map(([x, y]) => ({ x, y })),
      box: {
        topLeft: [result.face.box[0], result.face.box[1]],
        bottomRight: [result.face.box[0] + result.face.box[2], result.face.box[1] + result.face.box[3]]
      },
      confidence: result.confidence,
      quality: result.quality,
      embedding: result.embedding,
      aligned_face: result.aligned_face
    }]
    
  } catch (error) {
    console.error('YuNet face detection failed:', error)
    return []
  }
}

/**
 * Extract face landmarks from detected face using YuNet
 * Compatible with existing MediaPipe extractFaceLandmarks function  
 */
export async function extractFaceLandmarks(imageElement, timestamp = Date.now()) {
  const faces = await detectFaces(imageElement, timestamp)
  
  if (faces.length === 0) {
    return []
  }

  // Convert to MediaPipe-compatible format
  return faces.map(face => ({
    boundingBox: face.box,
    keypoints: face.landmarks,
    confidence: face.confidence,
    quality: face.quality
  }))
}

/**
 * Calculate face quality score
 * Uses YuNet backend quality assessment instead of MediaPipe landmarks
 */
export function calculateFaceQuality(face, imageWidth, imageHeight) {
  if (!face || !face.quality) return 0
  
  // YuNet backend provides comprehensive quality scores
  if (typeof face.quality === 'object') {
    const scores = Object.values(face.quality)
    const validScores = scores.filter(s => typeof s === 'object' && s.ok !== undefined)
    
    if (validScores.length > 0) {
      return validScores.reduce((sum, s) => sum + (s.ok ? 1 : 0), 0) / validScores.length
    }
  }
  
  return face.quality || 0.5
}

/**
 * Generate face embedding using SFace backend
 * Compatible with existing MediaPipe generateFaceEmbedding function
 */
export async function generateFaceEmbedding(landmarks, imageData = null) {
  try {
    if (!apiInitialized) {
      await initializeFaceModels()
    }
    
    // If we have image data from previous detection, use it
    if (imageData) {
      const response = await fetch(`${API_BASE_URL}/face/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ imageData })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      return result.embedding
    }
    
    // If we only have landmarks, we need to reconstruct from stored data
    // This is a fallback - ideally we should store embeddings from detection
    throw new Error('Cannot generate embedding from landmarks alone - need image data')
    
  } catch (error) {
    console.error('SFace embedding generation failed:', error)
    throw new Error('Face embedding generation failed: ' + error.message)
  }
}

/**
 * Process face from video element for real-time analysis
 * This is the main function called by BiometricCamera
 * Compatible with existing MediaPipe processFaceFromVideo function
 */
export async function processFaceFromVideo(videoElement) {
  try {
    if (!apiInitialized) {
      await initializeFaceModels()
    }

    // Convert video frame to base64
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = videoElement.videoWidth || 640
    canvas.height = videoElement.videoHeight || 480
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
    const imageData = canvas.toDataURL('image/jpeg', 0.8)

    // Call YuNet + SFace backend
    const response = await fetch(`${API_BASE_URL}/face/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageData })
    })

    const result = await response.json()
    
    // Debug logging
    console.log('YuNet API Response:', {
      success: result.success,
      error: result.error,
      hasEmbedding: !!result.embedding,
      embeddingLength: result.embedding?.length,
      embeddingType: typeof result.embedding,
      embeddingFirst3: result.embedding?.slice(0, 3)
    })
    
    if (!result.success) {
      return { success: false, error: result.error }
    }
    
    // Calculate quality score from backend data
    let quality = 0.5 // Default
    if (result.quality && typeof result.quality === 'object') {
      const qualityScores = Object.values(result.quality)
      const validScores = qualityScores.filter(s => typeof s === 'object' && s.ok !== undefined)
      
      if (validScores.length > 0) {
        quality = validScores.reduce((sum, s) => sum + (s.ok ? 1 : 0), 0) / validScores.length
      }
    }
    
    if (quality < FACE_CONFIG.QUALITY_THRESHOLD) {
      return { 
        success: false, 
        error: 'Face quality too low - please move closer and face the camera directly',
        quality 
      }
    }
    
    // Convert landmarks to MediaPipe-compatible format
    const landmarks = [{
      keypoints: result.face.landmarks.map(([x, y]) => ({ x: x / canvas.width, y: y / canvas.height })),
      boundingBox: {
        topLeft: [result.face.box[0] / canvas.width, result.face.box[1] / canvas.height],
        bottomRight: [(result.face.box[0] + result.face.box[2]) / canvas.width, (result.face.box[1] + result.face.box[3]) / canvas.height]
      }
    }]
    
    return {
      success: true,
      face: {
        box: {
          topLeft: [result.face.box[0], result.face.box[1]],
          bottomRight: [result.face.box[0] + result.face.box[2], result.face.box[1] + result.face.box[3]]
        },
        landmarks: result.face.landmarks.map(([x, y]) => ({ x, y }))
      },
      landmarks,
      embedding: Array.isArray(result.embedding[0]) ? result.embedding[0] : result.embedding, // Flatten if nested
      quality,
      imageData: result.aligned_face || imageData // Use aligned face if available
    }
    
  } catch (error) {
    console.error('YuNet + SFace face processing failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * Compatible with existing MediaPipe calculateSimilarity function
 */
export function calculateSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0
  }
  
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i]
    norm1 += embedding1[i] * embedding1[i]
    norm2 += embedding2[i] * embedding2[i]
  }
  
  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}

/**
 * Validate embedding format and dimensions
 * Updated for SFace 128D embeddings
 */
export function validateEmbedding(embedding) {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array')
  }
  
  if (embedding.length !== FACE_CONFIG.EMBEDDING_DIMENSION) {
    throw new Error(`Embedding must have ${FACE_CONFIG.EMBEDDING_DIMENSION} dimensions (SFace format)`)
  }
  
  if (embedding.some(val => typeof val !== 'number' || isNaN(val))) {
    throw new Error('Embedding must contain only valid numbers')
  }
  
  return true
}

/**
 * Enroll a face (register new user)
 * Modified to use pre-captured embedding instead of re-processing
 */
export async function enrollFace(biometricData, userId, userName) {
  try {
    if (!apiInitialized) {
      await initializeFaceModels()
    }
    
    // Use the already-validated embedding from biometric capture
    // This avoids re-processing and quality re-validation
    const response = await fetch(`${API_BASE_URL}/face/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        userName,
        embedding: biometricData.embedding, // Send pre-extracted embedding
        quality_score: biometricData.quality || 1.0,
        imageData: biometricData.imageData // Still send image for storage
      })
    })
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return {
      success: true,
      enrollment_id: result.enrollment_id,
      quality_score: result.quality_score,
      message: result.message
    }
    
  } catch (error) {
    console.error('Face enrollment failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Verify a face against enrolled users
 * Modified to use pre-captured embedding instead of re-processing
 */
export async function verifyFace(biometricData, threshold = FACE_CONFIG.VERIFICATION_THRESHOLD) {
  try {
    if (!apiInitialized) {
      await initializeFaceModels()
    }
    
    const response = await fetch(`${API_BASE_URL}/face/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embedding: biometricData.embedding, // Send pre-extracted embedding
        imageData: biometricData.imageData, // Still send image for optional re-processing
        threshold
      })
    })
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return {
      success: true,
      verified: result.verified,
      similarity: result.similarity,
      matched_user: result.matched_user,
      top_matches: result.top_matches,
      metadata: result.metadata
    }
    
  } catch (error) {
    console.error('Face verification failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Get system statistics
 * New function to check backend status
 */
export async function getSystemStats() {
  try {
    if (!apiInitialized) {
      await initializeFaceModels()
    }
    
    const response = await fetch(`${API_BASE_URL}/system/stats`)
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return result.stats
    
  } catch (error) {
    console.error('Failed to get system stats:', error)
    return null
  }
}

/**
 * Compare two embeddings directly
 * New function for direct embedding comparison
 */
export async function compareEmbeddings(embedding1, embedding2, threshold = FACE_CONFIG.MATCH_THRESHOLD) {
  try {
    if (!apiInitialized) {
      await initializeFaceModels()
    }
    
    const response = await fetch(`${API_BASE_URL}/face/compare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embedding1,
        embedding2,
        threshold
      })
    })
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return {
      similarity: result.similarity,
      match: result.match,
      threshold: result.threshold
    }
    
  } catch (error) {
    console.error('Embedding comparison failed:', error)
    return null
  }
}

// Export default configuration for easy migration
export default {
  initializeFaceModels,
  detectFaces,
  extractFaceLandmarks,
  calculateFaceQuality,
  generateFaceEmbedding,
  processFaceFromVideo,
  calculateSimilarity,
  validateEmbedding,
  enrollFace,
  verifyFace,
  getSystemStats,
  compareEmbeddings,
  FACE_CONFIG
}