import { detectFaces } from './face-recognition-yunet.js'

// Liveness detection configuration
export const LIVENESS_CONFIG = {
  BLINK_THRESHOLD: 0.3, // Eye aspect ratio threshold for blink detection
  HEAD_TURN_THRESHOLD: 0.2, // Head pose change threshold
  SMILE_THRESHOLD: 0.1, // Mouth curve threshold for smile
  ACTION_TIMEOUT: 3000, // 3 seconds per action (faster for demo)
  REQUIRED_ACTIONS: ['blink', 'turn_left', 'smile']
}

/**
 * Liveness detection actions
 */
export const LIVENESS_ACTIONS = {
  BLINK: 'blink',
  TURN_LEFT: 'turn_left', 
  TURN_RIGHT: 'turn_right',
  SMILE: 'smile',
  NOD: 'nod'
}

/**
 * Generate randomized liveness challenge
 */
export function generateLivenessChallenge() {
  const actions = [
    LIVENESS_ACTIONS.BLINK,
    LIVENESS_ACTIONS.TURN_LEFT,
    LIVENESS_ACTIONS.SMILE
  ]
  
  // Shuffle actions for randomization
  for (let i = actions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[actions[i], actions[j]] = [actions[j], actions[i]]
  }
  
  return {
    id: `liveness-${Date.now()}`,
    actions,
    currentActionIndex: 0,
    startTime: Date.now(),
    completed: false,
    results: []
  }
}

/**
 * Get human-readable instruction for liveness action
 */
export function getLivenessInstruction(action) {
  switch (action) {
    case LIVENESS_ACTIONS.BLINK:
      return 'Blink your eyes'
    case LIVENESS_ACTIONS.TURN_LEFT:
      return 'Turn your head LEFT'
    case LIVENESS_ACTIONS.TURN_RIGHT:
      return 'Turn your head RIGHT'
    case LIVENESS_ACTIONS.SMILE:
      return 'Smile'
    case LIVENESS_ACTIONS.NOD:
      return 'Nod your head'
    default:
      return 'Follow the instruction'
  }
}

/**
 * Calculate eye aspect ratio for blink detection
 */
function calculateEyeAspectRatio(eyeLandmarks) {
  if (!eyeLandmarks || eyeLandmarks.length < 6) return 1
  
  // Eye landmarks order: [outer corner, top1, top2, inner corner, bottom2, bottom1]
  const vertical1 = Math.abs(eyeLandmarks[1].y - eyeLandmarks[5].y)
  const vertical2 = Math.abs(eyeLandmarks[2].y - eyeLandmarks[4].y)
  const horizontal = Math.abs(eyeLandmarks[0].x - eyeLandmarks[3].x)
  
  return horizontal > 0 ? (vertical1 + vertical2) / (2 * horizontal) : 1
}

/**
 * Calculate head pose from face landmarks
 */
function calculateHeadPose(landmarks) {
  if (!landmarks || landmarks.length === 0) return { yaw: 0, pitch: 0, roll: 0 }
  
  const keypoints = landmarks[0].keypoints
  if (!keypoints || keypoints.length < 468) return { yaw: 0, pitch: 0, roll: 0 }
  
  // Use key facial points for pose estimation
  const noseTip = keypoints[1] // Nose tip
  const leftEyeCorner = keypoints[33] // Left eye outer corner
  const rightEyeCorner = keypoints[362] // Right eye outer corner
  const leftMouthCorner = keypoints[61] // Left mouth corner
  const rightMouthCorner = keypoints[291] // Right mouth corner
  
  // Calculate yaw (horizontal head turn)
  const eyeCenter = {
    x: (leftEyeCorner.x + rightEyeCorner.x) / 2,
    y: (leftEyeCorner.y + rightEyeCorner.y) / 2
  }
  
  const noseToEyeCenterX = noseTip.x - eyeCenter.x
  const eyeDistance = Math.abs(rightEyeCorner.x - leftEyeCorner.x)
  const yaw = eyeDistance > 0 ? noseToEyeCenterX / eyeDistance : 0
  
  // Calculate pitch (vertical head tilt)
  const mouthCenter = {
    x: (leftMouthCorner.x + rightMouthCorner.x) / 2,
    y: (leftMouthCorner.y + rightMouthCorner.y) / 2
  }
  
  const eyeToMouthY = mouthCenter.y - eyeCenter.y
  const faceHeight = Math.abs(eyeToMouthY) * 2 // Approximate face height
  const pitch = faceHeight > 0 ? (noseTip.y - eyeCenter.y) / faceHeight : 0
  
  // Calculate roll (head rotation)
  const eyeAngle = Math.atan2(
    rightEyeCorner.y - leftEyeCorner.y,
    rightEyeCorner.x - leftEyeCorner.x
  )
  const roll = eyeAngle
  
  return { yaw, pitch, roll }
}

/**
 * Detect smile from mouth landmarks
 */
function detectSmile(landmarks) {
  if (!landmarks || landmarks.length === 0) return false
  
  const keypoints = landmarks[0].keypoints
  if (!keypoints || keypoints.length < 468) return false
  
  const leftMouthCorner = keypoints[61]
  const rightMouthCorner = keypoints[291]
  const upperLip = keypoints[13] // Upper lip center
  const lowerLip = keypoints[14] // Lower lip center
  
  // Calculate mouth curvature
  const mouthWidth = Math.abs(rightMouthCorner.x - leftMouthCorner.x)
  const mouthHeight = Math.abs(upperLip.y - lowerLip.y)
  const mouthCenter = {
    x: (leftMouthCorner.x + rightMouthCorner.x) / 2,
    y: (upperLip.y + lowerLip.y) / 2
  }
  
  // Check if corners are raised (smile)
  const leftCornerRaise = mouthCenter.y - leftMouthCorner.y
  const rightCornerRaise = mouthCenter.y - rightMouthCorner.y
  const avgCornerRaise = (leftCornerRaise + rightCornerRaise) / 2
  
  // Normalize by mouth dimensions
  const smileIntensity = mouthHeight > 0 ? avgCornerRaise / mouthHeight : 0
  
  return smileIntensity > LIVENESS_CONFIG.SMILE_THRESHOLD
}

/**
 * Process frame for liveness detection
 */
export async function processLivenessFrame(videoElement, challenge, previousFrame = null) {
  try {
    // Generate timestamp for MediaPipe VIDEO mode
    const timestamp = performance.now()
    
    // Detect faces with timestamp
    const faces = await detectFaces(videoElement, timestamp)
    
    if (faces.length === 0) {
      return { success: false, error: 'No face detected', challenge }
    }
    
    if (faces.length > 1) {
      return { success: false, error: 'Multiple faces detected', challenge }
    }
    
    // Extract landmarks for liveness analysis
    const landmarks = await extractLandmarksForLiveness(videoElement, timestamp)
    
    if (!landmarks || landmarks.length === 0) {
      return { success: false, error: 'Could not extract face landmarks', challenge }
    }
    
    const currentAction = challenge.actions[challenge.currentActionIndex]
    const actionResult = await analyzeLivenessAction(currentAction, landmarks, previousFrame?.landmarks)
    
    let updatedChallenge = { ...challenge }
    
    if (actionResult.detected) {
      // Action successfully detected
      updatedChallenge.results.push({
        action: currentAction,
        detected: true,
        timestamp: Date.now(),
        confidence: actionResult.confidence
      })
      
      updatedChallenge.currentActionIndex++
      
      // Check if all actions completed
      if (updatedChallenge.currentActionIndex >= updatedChallenge.actions.length) {
        updatedChallenge.completed = true
      }
    }
    
    // Check for timeout
    const elapsed = Date.now() - challenge.startTime
    if (elapsed > LIVENESS_CONFIG.ACTION_TIMEOUT * challenge.actions.length) {
      return { 
        success: false, 
        error: 'Liveness check timeout', 
        challenge: updatedChallenge 
      }
    }
    
    // Create canvas to capture frame data
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = videoElement.videoWidth || 640
    canvas.height = videoElement.videoHeight || 480
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
    
    return {
      success: true,
      challenge: updatedChallenge,
      currentAction,
      actionResult,
      landmarks,
      frame: canvas.toDataURL('image/jpeg', 0.8)
    }
  } catch (error) {
    console.error('Liveness frame processing failed:', error)
    return { success: false, error: error.message, challenge }
  }
}

/**
 * Simplified landmark extraction for liveness (reuse face recognition)
 */
async function extractLandmarksForLiveness(videoElement, timestamp) {
  // Import here to avoid circular dependency
  const { extractFaceLandmarks } = await import('./face-recognition.js')
  return await extractFaceLandmarks(videoElement, timestamp)
}

/**
 * Analyze specific liveness action
 */
async function analyzeLivenessAction(action, currentLandmarks, previousLandmarks = null) {
  switch (action) {
    case LIVENESS_ACTIONS.BLINK:
      return analyzeBlink(currentLandmarks, previousLandmarks)
    
    case LIVENESS_ACTIONS.TURN_LEFT:
      return analyzeHeadTurn(currentLandmarks, 'left')
    
    case LIVENESS_ACTIONS.TURN_RIGHT:
      return analyzeHeadTurn(currentLandmarks, 'right')
    
    case LIVENESS_ACTIONS.SMILE:
      return analyzeSmile(currentLandmarks)
    
    default:
      return { detected: false, confidence: 0, reason: 'Unknown action' }
  }
}

/**
 * Analyze blink action using MediaPipe blendshapes
 */
function analyzeBlink(landmarks, previousLandmarks) {
  if (!landmarks || landmarks.length === 0 || !landmarks[0].blendshapes) {
    return {
      detected: false,
      confidence: 0,
      reason: 'No blendshapes data available'
    }
  }
  
  const blendshapes = landmarks[0].blendshapes
  
  // MediaPipe provides eyeBlinkLeft and eyeBlinkRight blendshapes
  const eyeBlinkLeft = blendshapes.categories?.find(cat => cat.categoryName === 'eyeBlinkLeft')
  const eyeBlinkRight = blendshapes.categories?.find(cat => cat.categoryName === 'eyeBlinkRight')
  
  if (!eyeBlinkLeft || !eyeBlinkRight) {
    return {
      detected: false,
      confidence: 0,
      reason: 'Eye blink data not available'
    }
  }
  
  // Blink is detected when both eyes have high blink score
  const blinkScore = (eyeBlinkLeft.score + eyeBlinkRight.score) / 2
  const blinkDetected = blinkScore > 0.5 // Threshold for blink detection
  
  return {
    detected: blinkDetected,
    confidence: blinkScore,
    reason: blinkDetected ? `Blink detected (score: ${blinkScore.toFixed(2)})` : 'Eyes open',
    eyeBlinkLeft: eyeBlinkLeft.score,
    eyeBlinkRight: eyeBlinkRight.score
  }
}

/**
 * Analyze head turn action using real head pose
 */
function analyzeHeadTurn(landmarks, direction) {
  if (!landmarks || landmarks.length === 0) {
    return {
      detected: false,
      confidence: 0,
      reason: 'No landmarks available'
    }
  }
  
  const headPose = calculateHeadPose(landmarks)
  const yaw = headPose.yaw
  
  // Left turn: positive yaw, Right turn: negative yaw
  const requiredYaw = direction === 'left' ? 0.15 : -0.15
  const turnDetected = direction === 'left' ? yaw > 0.15 : yaw < -0.15
  const confidence = Math.min(Math.abs(yaw) / 0.3, 1) // Normalize to 0-1
  
  return {
    detected: turnDetected,
    confidence: turnDetected ? confidence : 0.2,
    reason: turnDetected ? `Head turned ${direction} (yaw: ${yaw.toFixed(2)})` : `Head not turned ${direction} enough (yaw: ${yaw.toFixed(2)})`,
    yaw: yaw
  }
}

/**
 * Analyze smile action using MediaPipe blendshapes
 */
function analyzeSmile(landmarks) {
  if (!landmarks || landmarks.length === 0) {
    console.log('❌ Smile check: No landmarks')
    return {
      detected: false,
      confidence: 0,
      reason: 'No landmarks available'
    }
  }
  
  if (!landmarks[0].blendshapes) {
    console.log('❌ Smile check: No blendshapes data')
    return {
      detected: false,
      confidence: 0,
      reason: 'No blendshapes data available'
    }
  }
  
  const blendshapes = landmarks[0].blendshapes
  
  // MediaPipe provides mouthSmileLeft and mouthSmileRight blendshapes
  const mouthSmileLeft = blendshapes.categories?.find(cat => cat.categoryName === 'mouthSmileLeft')
  const mouthSmileRight = blendshapes.categories?.find(cat => cat.categoryName === 'mouthSmileRight')
  
  console.log('🔍 Smile blendshapes:', {
    left: mouthSmileLeft?.score,
    right: mouthSmileRight?.score,
    hasCategories: !!blendshapes.categories,
    categoryCount: blendshapes.categories?.length
  })
  
  if (!mouthSmileLeft || !mouthSmileRight) {
    console.log('⚠️ Smile check: Missing smile blendshapes, using geometric fallback')
    // Fallback to geometric smile detection
    const geometricSmile = detectSmile(landmarks)
    return {
      detected: geometricSmile,
      confidence: geometricSmile ? 0.7 : 0.2,
      reason: geometricSmile ? 'Smile detected (geometric)' : 'No smile detected (geometric)'
    }
  }
  
  // Smile is detected when both corners are raised
  const smileScore = (mouthSmileLeft.score + mouthSmileRight.score) / 2
  const smileDetected = smileScore > 0.3 // LOWERED threshold from 0.4 to 0.3 for easier detection
  
  console.log(`${smileDetected ? '✅' : '❌'} Smile ${smileDetected ? 'DETECTED' : 'not detected'}: score ${smileScore.toFixed(2)}`)
  
  return {
    detected: smileDetected,
    confidence: smileScore,
    reason: smileDetected ? `Smile detected (score: ${smileScore.toFixed(2)})` : `Not smiling enough (score: ${smileScore.toFixed(2)}, need > 0.3)`,
    mouthSmileLeft: mouthSmileLeft.score,
    mouthSmileRight: mouthSmileRight.score
  }
}

/**
 * Validate liveness challenge completion
 */
export function validateLivenessChallenge(challenge) {
  if (!challenge || !challenge.completed) {
    return { valid: false, reason: 'Challenge not completed' }
  }
  
  if (challenge.results.length < challenge.actions.length) {
    return { valid: false, reason: 'Not all actions completed' }
  }
  
  const avgConfidence = challenge.results.reduce((sum, result) => sum + result.confidence, 0) / challenge.results.length
  
  if (avgConfidence < 0.5) {
    return { valid: false, reason: 'Low confidence in liveness detection' }
  }
  
  return { 
    valid: true, 
    confidence: avgConfidence,
    completedActions: challenge.results.length,
    duration: Date.now() - challenge.startTime
  }
}