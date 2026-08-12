import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

let faceLandmarker = null
let isInitialized = false
let lastTimestamp = 0 // Track last used timestamp to ensure monotonic increase

// Face recognition configuration
export const FACE_CONFIG = {
  EMBEDDING_DIMENSION: 512,
  MODEL_NAME: 'mediapipe-facemesh',
  MODEL_VERSION: 'v1.0',
  MATCH_THRESHOLD: 0.85,
  VERIFICATION_THRESHOLD: 0.90,
  MIN_FACE_SIZE: 100,
  MAX_FACES: 1,
  QUALITY_THRESHOLD: 0.7
}

/**
 * Initialize MediaPipe Face Landmarker
 */
export async function initializeFaceModels() {
  if (isInitialized && faceLandmarker) return

  try {
    console.log('Initializing MediaPipe FaceLandmarker...')
    
    // Initialize TensorFlow.js backend
    await tf.ready()
    console.log('TensorFlow.js backend ready')
    
    // Load MediaPipe Vision tasks
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )
    
    // Create FaceLandmarker with face detection
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    })
    
    isInitialized = true
    console.log('MediaPipe FaceLandmarker initialized successfully')
  } catch (error) {
    console.error('Failed to initialize MediaPipe FaceLandmarker:', error)
    throw new Error('Face recognition initialization failed: ' + error.message)
  }
}

/**
 * Detect faces using MediaPipe FaceLandmarker
 */
export async function detectFaces(imageElement, timestamp = Date.now()) {
  if (!faceLandmarker) {
    await initializeFaceModels()
  }

  try {
    // Ensure timestamp is strictly monotonically increasing
    if (timestamp <= lastTimestamp) {
      timestamp = lastTimestamp + 1
    }
    lastTimestamp = timestamp
    
    // For video elements, use detectForVideo with timestamp
    // For image elements, this will still work
    const results = faceLandmarker.detectForVideo(imageElement, timestamp)
    
    if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
      return []
    }

    // Convert MediaPipe results to our format
    return results.faceLandmarks.map((landmarks, index) => {
      const boundingBox = calculateBoundingBox(landmarks)
      return {
        landmarks,
        box: boundingBox,
        blendshapes: results.faceBlendshapes?.[index],
        facialTransformationMatrixes: results.facialTransformationMatrixes?.[index]
      }
    })
  } catch (error) {
    console.error('Face detection failed:', error)
    return []
  }
}

/**
 * Calculate bounding box from landmarks
 */
function calculateBoundingBox(landmarks) {
  if (!landmarks || landmarks.length === 0) {
    return {
      topLeft: [0, 0],
      bottomRight: [0, 0]
    }
  }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  landmarks.forEach(landmark => {
    minX = Math.min(minX, landmark.x)
    minY = Math.min(minY, landmark.y)
    maxX = Math.max(maxX, landmark.x)
    maxY = Math.max(maxY, landmark.y)
  })

  return {
    topLeft: [minX, minY],
    bottomRight: [maxX, maxY]
  }
}

/**
 * Extract face landmarks from detected face using MediaPipe
 */
export async function extractFaceLandmarks(imageElement, timestamp = Date.now()) {
  if (!faceLandmarker) {
    await initializeFaceModels()
  }

  // Detect faces with MediaPipe
  const faces = await detectFaces(imageElement, timestamp)
  
  if (faces.length === 0) {
    return []
  }

  // Convert to our landmark format
  return faces.map(face => ({
    boundingBox: face.box,
    keypoints: face.landmarks,
    blendshapes: face.blendshapes,
    facialTransformationMatrixes: face.facialTransformationMatrixes
  }))
}

/**
 * Calculate face quality score based on MediaPipe landmarks and face size
 */
export function calculateFaceQuality(face, imageWidth, imageHeight) {
  if (!face || !face.box) return 0

  const { topLeft, bottomRight } = face.box
  const faceWidth = (bottomRight[0] - topLeft[0]) * imageWidth
  const faceHeight = (bottomRight[1] - topLeft[1]) * imageHeight
  const faceSize = Math.min(faceWidth, faceHeight)
  
  // Quality factors
  const sizeScore = Math.min(faceSize / FACE_CONFIG.MIN_FACE_SIZE, 1)
  const aspectRatio = faceWidth / faceHeight
  const aspectScore = 1 - Math.abs(aspectRatio - 1) // Prefer square-ish faces
  const positionScore = calculateCenteringScore(face.box, 1, 1) // Normalized coordinates
  
  // Check if face is frontal (using landmarks if available)
  let frontalScore = 1.0
  if (face.landmarks && face.landmarks.length > 0) {
    frontalScore = calculateFrontalScore(face.landmarks)
  }
  
  // Overall quality (weighted average)
  const quality = (sizeScore * 0.3) + (aspectScore * 0.2) + (positionScore * 0.2) + (frontalScore * 0.3)
  
  return Math.max(0, Math.min(1, quality))
}

/**
 * Calculate if face is looking straight at camera
 */
function calculateFrontalScore(landmarks) {
  // Use nose tip (index 1) and check if it's centered between eyes
  const noseTip = landmarks[1]
  const leftEye = landmarks[33]  // Left eye outer corner
  const rightEye = landmarks[263] // Right eye outer corner
  
  if (!noseTip || !leftEye || !rightEye) return 0.5
  
  const eyeCenter = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2
  }
  
  const noseOffset = Math.abs(noseTip.x - eyeCenter.x)
  const eyeDistance = Math.abs(rightEye.x - leftEye.x)
  
  // Nose should be centered between eyes
  const frontalScore = 1 - Math.min(noseOffset / (eyeDistance * 0.5), 1)
  
  return frontalScore
}

/**
 * Calculate face quality from MediaPipe FaceMesh landmarks
 */
function calculateFaceQualityFromLandmarks(face, imageWidth, imageHeight) {
  if (!face || !face.boundingBox) return 0

  const { topLeft, bottomRight } = face.boundingBox
  const faceWidth = bottomRight[0] - topLeft[0]
  const faceHeight = bottomRight[1] - topLeft[1]
  const faceSize = Math.min(faceWidth, faceHeight)
  
  // Quality factors
  const sizeScore = Math.min(faceSize / FACE_CONFIG.MIN_FACE_SIZE, 1)
  const aspectRatio = faceWidth / faceHeight
  const aspectScore = 1 - Math.abs(aspectRatio - 1) // Prefer square-ish faces
  
  // Calculate face center from bounding box
  const faceCenterX = (topLeft[0] + bottomRight[0]) / 2
  const faceCenterY = (topLeft[1] + bottomRight[1]) / 2
  const imageCenterX = imageWidth / 2
  const imageCenterY = imageHeight / 2
  
  const distanceFromCenter = Math.sqrt(
    Math.pow(faceCenterX - imageCenterX, 2) + 
    Math.pow(faceCenterY - imageCenterY, 2)
  )
  
  const maxDistance = Math.sqrt(Math.pow(imageWidth / 2, 2) + Math.pow(imageHeight / 2, 2))
  const positionScore = 1 - (distanceFromCenter / maxDistance)
  
  // Overall quality (weighted average)
  const quality = (sizeScore * 0.4) + (aspectScore * 0.3) + (Math.max(0, Math.min(1, positionScore)) * 0.3)
  
  return Math.max(0, Math.min(1, quality))
}

/**
 * Calculate how centered the face is in the image
 */
function calculateCenteringScore(box, imageWidth, imageHeight) {
  const { topLeft, bottomRight } = box
  const faceCenterX = (topLeft[0] + bottomRight[0]) / 2
  const faceCenterY = (topLeft[1] + bottomRight[1]) / 2
  const imageCenterX = imageWidth / 2
  const imageCenterY = imageHeight / 2
  
  const distanceFromCenter = Math.sqrt(
    Math.pow(faceCenterX - imageCenterX, 2) + 
    Math.pow(faceCenterY - imageCenterY, 2)
  )
  
  const maxDistance = Math.sqrt(Math.pow(imageWidth / 2, 2) + Math.pow(imageHeight / 2, 2))
  const centeringScore = 1 - (distanceFromCenter / maxDistance)
  
  return Math.max(0, Math.min(1, centeringScore))
}

/**
 * Generate face embedding from MediaPipe landmarks
 * This creates a 512-dimensional feature vector based on real facial geometry
 */
export async function generateFaceEmbedding(landmarks) {
  try {
    if (!landmarks || landmarks.length === 0) {
      throw new Error('No face landmarks provided')
    }

    const faceMesh = landmarks[0]
    if (!faceMesh.keypoints || faceMesh.keypoints.length < 478) {
      throw new Error('Invalid face landmarks - expected 478 points from MediaPipe')
    }

    const keypoints = faceMesh.keypoints
    
    // Extract facial features with geometric relationships
    // MediaPipe provides 478 3D facial landmarks
    const features = []
    
    // 1. Key facial regions (normalized coordinates)
    const leftEyeRegion = getRegionFeatures(keypoints, [33, 160, 158, 133, 153, 144, 163, 7])
    const rightEyeRegion = getRegionFeatures(keypoints, [263, 387, 385, 362, 380, 373, 390, 249])
    const noseRegion = getRegionFeatures(keypoints, [1, 2, 98, 327, 122, 351, 129, 358])
    const mouthRegion = getRegionFeatures(keypoints, [61, 291, 0, 17, 269, 405, 181, 84, 314])
    const jawRegion = getRegionFeatures(keypoints, [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361])
    const foreheadRegion = getRegionFeatures(keypoints, [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109])
    
    // 2. Geometric measurements (distances and angles)
    const eyeDistance = calculateDistance(keypoints[33], keypoints[263])
    const eyeToNoseDistance = calculateDistance(getAveragePoint([keypoints[33], keypoints[263]]), keypoints[1])
    const noseToMouthDistance = calculateDistance(keypoints[1], keypoints[13])
    const faceWidth = calculateDistance(keypoints[234], keypoints[454])
    const faceHeight = calculateDistance(keypoints[10], keypoints[152])
    
    // 3. Angular measurements
    const noseAngle = calculateAngle(keypoints[1], keypoints[2])
    const jawAngle = calculateAngle(keypoints[172], keypoints[397])
    const eyeAngle = calculateAngle(keypoints[33], keypoints[263])
    
    // 4. Symmetry measurements
    const leftRightSymmetry = calculateSymmetry(keypoints)
    
    // Build feature vector
    features.push(
      ...leftEyeRegion,
      ...rightEyeRegion,
      ...noseRegion,
      ...mouthRegion,
      ...jawRegion,
      ...foreheadRegion,
      eyeDistance,
      eyeToNoseDistance,
      noseToMouthDistance,
      faceWidth,
      faceHeight,
      noseAngle,
      jawAngle,
      eyeAngle,
      leftRightSymmetry
    )
    
    // 5. Add pairwise distances between key landmarks for more uniqueness
    const keyLandmarkIndices = [1, 33, 263, 61, 291, 199, 152, 10, 172, 397]
    for (let i = 0; i < keyLandmarkIndices.length; i++) {
      for (let j = i + 1; j < keyLandmarkIndices.length; j++) {
        const dist = calculateDistance(keypoints[keyLandmarkIndices[i]], keypoints[keyLandmarkIndices[j]])
        features.push(dist)
      }
    }
    
    // 6. Add relative positions of all landmarks (normalized)
    const center = getAveragePoint(keypoints)
    const scale = faceWidth + faceHeight
    
    for (let i = 0; i < Math.min(keypoints.length, 150); i++) {
      const relativeX = (keypoints[i].x - center.x) / scale
      const relativeY = (keypoints[i].y - center.y) / scale
      const relativeZ = (keypoints[i].z || 0) / scale
      features.push(relativeX, relativeY, relativeZ)
    }
    
    // Ensure exactly 512 dimensions
    while (features.length < 512) {
      features.push(0)
    }
    
    if (features.length > 512) {
      features.length = 512
    }
    
    // Normalize the feature vector (L2 normalization)
    const tensor = tf.tensor1d(features)
    const normalized = tf.div(tensor, tf.norm(tensor).add(1e-10)) // Add epsilon to avoid division by zero
    const embedding = await normalized.data()
    
    // Cleanup
    tensor.dispose()
    normalized.dispose()
    
    return Array.from(embedding)
  } catch (error) {
    console.error('Face embedding generation failed:', error)
    throw new Error('Face embedding generation failed: ' + error.message)
  }
}

/**
 * Extract features from a facial region
 */
function getRegionFeatures(keypoints, indices) {
  const regionPoints = indices.map(i => keypoints[i]).filter(p => p)
  if (regionPoints.length === 0) return [0, 0, 0]
  
  const center = getAveragePoint(regionPoints)
  const spread = calculateRegionSpread(regionPoints, center)
  
  return [center.x, center.y, spread]
}

/**
 * Calculate spread of points around center
 */
function calculateRegionSpread(points, center) {
  if (points.length === 0) return 0
  
  const distances = points.map(p => calculateDistance(p, center))
  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length
  
  return avgDistance
}

/**
 * Calculate left-right facial symmetry
 */
function calculateSymmetry(keypoints) {
  // Compare left and right sides of face
  const leftSideIndices = [33, 160, 158, 133, 153, 144]
  const rightSideIndices = [263, 387, 385, 362, 380, 373]
  
  const center = keypoints[1] // Nose tip as center reference
  
  let symmetryScore = 0
  for (let i = 0; i < leftSideIndices.length; i++) {
    const leftPoint = keypoints[leftSideIndices[i]]
    const rightPoint = keypoints[rightSideIndices[i]]
    
    if (leftPoint && rightPoint && center) {
      const leftDist = Math.abs(leftPoint.x - center.x)
      const rightDist = Math.abs(rightPoint.x - center.x)
      symmetryScore += Math.abs(leftDist - rightDist)
    }
  }
  
  return 1 - Math.min(symmetryScore, 1) // Higher score = more symmetric
}

/**
 * Helper function to get average point from array of keypoints
 */
function getAveragePoint(keypoints) {
  if (!keypoints || keypoints.length === 0) return { x: 0, y: 0, z: 0 }
  
  const sum = keypoints.reduce((acc, point) => ({
    x: acc.x + (point?.x || 0),
    y: acc.y + (point?.y || 0),
    z: acc.z + ((point?.z || 0))
  }), { x: 0, y: 0, z: 0 })
  
  return {
    x: sum.x / keypoints.length,
    y: sum.y / keypoints.length,
    z: sum.z / keypoints.length
  }
}

/**
 * Calculate Euclidean distance between two points
 */
function calculateDistance(point1, point2) {
  if (!point1 || !point2) return 0
  const dx = (point1.x || 0) - (point2.x || 0)
  const dy = (point1.y || 0) - (point2.y || 0)
  const dz = (point1.z || 0) - (point2.z || 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Calculate angle between two points
 */
function calculateAngle(point1, point2) {
  if (!point1 || !point2) return 0
  const dx = (point2.x || 0) - (point1.x || 0)
  const dy = (point2.y || 0) - (point1.y || 0)
  return Math.atan2(dy, dx)
}

/**
 * Process face from video element for real-time analysis
 * This is the main function called by BiometricCamera
 */
export async function processFaceFromVideo(videoElement) {
  try {
    if (!faceLandmarker) {
      await initializeFaceModels()
    }

    // Generate timestamp for video frame (required by MediaPipe VIDEO mode)
    const timestamp = performance.now()

    // Detect faces directly from video element with timestamp
    const faces = await detectFaces(videoElement, timestamp)
    
    if (!faces || faces.length === 0) {
      return { success: false, error: 'No face detected' }
    }
    
    if (faces.length > 1) {
      return { success: false, error: 'Multiple faces detected - please ensure only one person is in frame' }
    }
    
    const face = faces[0]
    
    // Calculate quality
    const quality = calculateFaceQuality(face, videoElement.videoWidth || 640, videoElement.videoHeight || 480)
    
    if (quality < FACE_CONFIG.QUALITY_THRESHOLD) {
      return { success: false, error: 'Face quality too low - please move closer and face the camera directly', quality }
    }
    
    // Convert face data to landmark format for embedding generation
    const landmarksForEmbedding = [{
      keypoints: face.landmarks,
      boundingBox: face.box,
      blendshapes: face.blendshapes
    }]
    
    // Generate embedding from real facial features
    const embedding = await generateFaceEmbedding(landmarksForEmbedding)
    
    // Create canvas to capture image data
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = videoElement.videoWidth || 640
    canvas.height = videoElement.videoHeight || 480
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
    
    return {
      success: true,
      face: {
        box: face.box,
        landmarks: face.landmarks
      },
      landmarks: landmarksForEmbedding,
      embedding,
      quality,
      imageData: canvas.toDataURL('image/jpeg', 0.8)
    }
  } catch (error) {
    console.error('Face processing failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Calculate cosine similarity between two embeddings
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
 */
export function validateEmbedding(embedding) {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array')
  }
  
  if (embedding.length !== FACE_CONFIG.EMBEDDING_DIMENSION) {
    throw new Error(`Embedding must have ${FACE_CONFIG.EMBEDDING_DIMENSION} dimensions`)
  }
  
  if (embedding.some(val => typeof val !== 'number' || isNaN(val))) {
    throw new Error('Embedding must contain only valid numbers')
  }
  
  return true
}