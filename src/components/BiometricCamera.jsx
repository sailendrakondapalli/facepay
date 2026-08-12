import { useState, useRef, useEffect, useCallback } from 'react'
import { processFaceFromVideo, initializeFaceModels, FACE_CONFIG } from '../lib/face-recognition-yunet.js'
import { 
  generateLivenessChallenge, 
  processLivenessFrame, 
  getLivenessInstruction,
  validateLivenessChallenge,
  LIVENESS_CONFIG 
} from '../lib/liveness.js'
import './BiometricCamera.css'

export function BiometricCamera({ 
  onSuccess, 
  onCancel, 
  mode = 'enroll', // 'enroll', 'identify', 'verify'
  requireLiveness = true,
  showInstructions = true 
}) {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('initializing') // 'initializing', 'ready', 'detecting', 'liveness', 'processing', 'success', 'error'
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceQuality, setFaceQuality] = useState(0)
  const [livenessChallenge, setLivenessChallenge] = useState(null)
  const [currentInstruction, setCurrentInstruction] = useState('')
  const [processingMessage, setProcessingMessage] = useState('')
  
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const previousFrameRef = useRef(null)

  useEffect(() => {
    initializeCamera()
    return () => cleanup()
  }, [])

  useEffect(() => {
    if (status === 'ready' || status === 'detecting' || status === 'liveness') {
      startFaceDetection()
    } else {
      stopFaceDetection()
    }
  }, [status])

  async function initializeCamera() {
    let retryCount = 0
    const maxRetries = 3
    
    while (retryCount < maxRetries) {
      try {
        setStatus('initializing')
        setProcessingMessage(`Initializing face recognition...${retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : ''}`)
        
        // Initialize face models
        await initializeFaceModels()
        
        setProcessingMessage('Starting camera...')
        
        // Start camera with retry logic
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user', 
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          }
        })
        
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
        
        setStatus('ready')
        setProcessingMessage('')
        
        // Note: Liveness detection temporarily disabled for YuNet integration
        // YuNet + SFace doesn't provide MediaPipe blendshapes required for current liveness system
        // TODO: Implement YuNet-compatible liveness detection using face landmarks
        if (requireLiveness) {
          console.log('⚠️ Liveness detection temporarily disabled for YuNet + SFace backend')
          console.log('ℹ️ Proceeding with face detection only')
        }
        
        setStatus('detecting') // Skip liveness, go straight to detection
        return // Success - exit retry loop
        
      } catch (err) {
        console.error(`Camera initialization failed (attempt ${retryCount + 1}/${maxRetries}):`, err)
        retryCount++
        
        if (retryCount >= maxRetries) {
          // All retries failed
          setError('Camera access denied or not available. Please check permissions and try again.')
          setStatus('error')
          return
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
      }
    }
  }

  function cleanup() {
    stopFaceDetection()
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
  }

  function startFaceDetection() {
    if (intervalRef.current) return
    
    // Reduced from 200ms to 500ms for better performance on free-tier Render
    intervalRef.current = setInterval(async () => {
      await processFrame()
    }, 500) // Process every 500ms for better performance
  }

  function stopFaceDetection() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const handleLivenessFrame = useCallback(async () => {
    console.log('Processing liveness frame...', { 
      challenge: livenessChallenge, 
      currentAction: livenessChallenge?.actions?.[livenessChallenge.currentActionIndex] 
    })
    
    const result = await processLivenessFrame(
      videoRef.current, 
      livenessChallenge, 
      previousFrameRef.current
    )
    
    console.log('Liveness frame result:', result)
    
    previousFrameRef.current = result.success ? { landmarks: result.landmarks } : null
    
    if (!result.success) {
      if (result.error === 'No face detected' || result.error === 'Multiple faces detected') {
        setFaceDetected(false)
        setCurrentInstruction(result.error === 'Multiple faces detected' 
          ? 'Please ensure only one person is visible'
          : 'Please position your face in the camera'
        )
      }
      return
    }
    
    setFaceDetected(true)
    setLivenessChallenge(result.challenge)
    
    if (result.challenge.completed) {
      const validation = validateLivenessChallenge(result.challenge)
      console.log('Liveness challenge completed:', validation)
      if (validation.valid) {
        setStatus('detecting')
        setCurrentInstruction('Liveness verified! Capturing biometric data...')
      } else {
        setError(`Liveness check failed: ${validation.reason}`)
        setStatus('error')
      }
    } else {
      const nextAction = result.challenge.actions[result.challenge.currentActionIndex]
      console.log('Next liveness action:', nextAction)
      setCurrentInstruction(getLivenessInstruction(nextAction))
    }
  }, [livenessChallenge])

  const processDetectionFrame = useCallback(async () => {
    const result = await processFaceFromVideo(videoRef.current)
    
    if (!result.success) {
      setFaceDetected(false)
      setFaceQuality(0)
      return
    }
    
    setFaceDetected(true)
    setFaceQuality(result.quality)
    
    // Auto-capture when high quality face is detected
    if (result.quality >= FACE_CONFIG.QUALITY_THRESHOLD) {
      await handleCapture(result)
    }
  }, [])

  const processFrame = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4) return
    
    try {
      if (status === 'liveness' && livenessChallenge) {
        await handleLivenessFrame()
      } else if (status === 'detecting') {
        await processDetectionFrame()
      }
    } catch (error) {
      console.error('Frame processing error:', error)
    }
  }, [status, livenessChallenge, handleLivenessFrame, processDetectionFrame])

  async function handleCapture(faceResult = null) {
    try {
      setStatus('processing')
      setProcessingMessage('Processing biometric data...')
      
      let result = faceResult
      
      if (!result) {
        result = await processFaceFromVideo(videoRef.current)
        if (!result.success) {
          throw new Error(result.error)
        }
      }
      
      // Validate embedding
      if (!result.embedding || result.embedding.length !== FACE_CONFIG.EMBEDDING_DIMENSION) {
        throw new Error('Invalid face embedding generated')
      }
      
      setProcessingMessage('Biometric capture successful!')
      setStatus('success')
      
      // Return comprehensive biometric data
      const biometricData = {
        embedding: result.embedding,
        quality: result.quality,
        imageData: result.imageData,
        metadata: {
          modelName: FACE_CONFIG.MODEL_NAME,
          modelVersion: FACE_CONFIG.MODEL_VERSION,
          timestamp: new Date().toISOString(),
          livenessVerified: false, // Temporarily disabled for YuNet backend
          livenessChallenge: null,
          backend: 'yunet-sface',
          note: 'Liveness detection temporarily disabled - YuNet backend active'
        }
      }
      
      setTimeout(() => {
        cleanup()
        onSuccess(biometricData)
      }, 1000)
      
    } catch (error) {
      console.error('Capture failed:', error)
      setError(error.message)
      setStatus('error')
    }
  }

  function handleCancel() {
    cleanup()
    onCancel()
  }

  function getStatusMessage() {
    switch (status) {
      case 'initializing':
        return processingMessage || 'Initializing...'
      case 'ready':
        return 'Camera ready'
      case 'liveness':
        return currentInstruction || 'Follow the instructions'
      case 'detecting':
        return faceDetected 
          ? `Face detected (Quality: ${Math.round(faceQuality * 100)}%)` 
          : 'Position your face in the frame'
      case 'processing':
        return processingMessage || 'Processing...'
      case 'success':
        return '✓ Biometric capture successful!'
      case 'error':
        return error || 'An error occurred'
      default:
        return 'Ready'
    }
  }

  function getStatusColor() {
    switch (status) {
      case 'success':
        return 'var(--success)'
      case 'error':
        return 'var(--danger)'
      case 'liveness':
        return 'var(--accent)'
      case 'detecting':
        return faceDetected && faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD 
          ? 'var(--success)' 
          : 'var(--warning)'
      default:
        return 'var(--text-muted)'
    }
  }

  return (
    <div className="biometric-camera">
      <div className="camera-container">
        {error ? (
          <div className="camera-error">
            <div className="error-icon">⚠</div>
            <p>{error}</p>
            <button onClick={handleCancel} className="btn btn-outline btn-sm">Close</button>
          </div>
        ) : (
          <>
            <div className="camera-view">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="camera-video"
                style={{ 
                  transform: 'scaleX(-1)', // Mirror for user
                  opacity: status === 'processing' || status === 'success' ? 0.5 : 1
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              <div className="camera-overlay">
                <div className={`face-outline ${faceDetected ? 'detected' : ''} ${status === 'processing' ? 'processing' : ''} ${status === 'success' ? 'success' : ''}`}>
                  
                  {/* Face Detection Indicator */}
                  {status === 'detecting' && !faceDetected && (
                    <div className="detection-hint">
                      <div className="hint-icon">👤</div>
                      <div className="hint-text">Position your face here</div>
                    </div>
                  )}
                  
                  {/* Quality Feedback */}
                  {faceDetected && status === 'detecting' && (
                    <div className="face-feedback">
                      <div className={`feedback-icon ${faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD ? 'good' : 'poor'}`}>
                        {faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD ? '✓' : '⚠'}
                      </div>
                      <div className="feedback-text">
                        {faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD 
                          ? 'Perfect! Hold steady...' 
                          : 'Adjusting quality...'}
                      </div>
                    </div>
                  )}
                  
                  {status === 'liveness' && (
                    <div className="liveness-indicator">
                      {livenessChallenge && livenessChallenge.currentActionIndex < livenessChallenge.actions.length && (
                        <div className="action-progress">
                          {livenessChallenge.currentActionIndex + 1} / {livenessChallenge.actions.length}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {(status === 'detecting' || status === 'processing') && faceDetected && (
                    <div className="scan-animation" />
                  )}
                  
                  {status === 'processing' && (
                    <div className="processing-overlay">
                      <div className="processing-spinner-large" />
                      <div className="processing-text">Analyzing face...</div>
                    </div>
                  )}
                  
                  {status === 'success' && (
                    <div className="success-indicator">
                      <div className="success-icon">✓</div>
                      <div className="success-text">Captured!</div>
                    </div>
                  )}
                </div>
                
                {/* Real-time Quality Meter */}
                {faceDetected && status === 'detecting' && (
                  <div className="quality-meter">
                    <div className="quality-label">Face Quality</div>
                    <div className="quality-bar-container">
                      <div className="quality-bar">
                        <div 
                          className="quality-fill" 
                          style={{ 
                            width: `${faceQuality * 100}%`,
                            backgroundColor: faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD 
                              ? '#00d4aa' 
                              : faceQuality >= 0.5
                              ? '#ffc107'
                              : '#ff5252'
                          }} 
                        />
                      </div>
                      <span className="quality-percentage">
                        {Math.round(faceQuality * 100)}%
                      </span>
                    </div>
                    <div className="quality-status">
                      {faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD 
                        ? '✓ Excellent quality' 
                        : faceQuality >= 0.5
                        ? '⚠ Improving...'
                        : '✗ Too low'}
                    </div>
                  </div>
                )}
                
                {/* Detection Status Badges */}
                <div className="status-badges">
                  <div className={`status-badge ${faceDetected ? 'active' : 'inactive'}`}>
                    <span className="badge-icon">{faceDetected ? '✓' : '○'}</span>
                    <span className="badge-label">Face Detected</span>
                  </div>
                  {faceDetected && (
                    <div className={`status-badge ${faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD ? 'active' : 'inactive'}`}>
                      <span className="badge-icon">{faceQuality >= FACE_CONFIG.QUALITY_THRESHOLD ? '✓' : '○'}</span>
                      <span className="badge-label">Quality OK</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="camera-status">
              <div 
                className="status-message"
                style={{ color: getStatusColor() }}
              >
                {getStatusMessage()}
              </div>
              
              {showInstructions && (
                <div className="instructions">
                  {status === 'liveness' && (
                    <div className="liveness-instructions">
                      <div className="instruction-text">{currentInstruction}</div>
                    </div>
                  )}
                  
                  {status === 'detecting' && (
                    <div className="detection-instructions">
                      <div style={{ 
                        background: 'rgba(255, 193, 7, 0.1)', 
                        border: '1px solid #ffc107', 
                        borderRadius: '5px', 
                        padding: '10px', 
                        marginBottom: '10px',
                        fontSize: '0.9em'
                      }}>
                        <strong>🔄 YuNet + SFace Backend Active</strong><br/>
                        Advanced liveness detection temporarily bypassed for integration testing.
                      </div>
                      • Keep your face centered in the frame<br />
                      • Ensure good lighting<br />
                      • Remove sunglasses or masks<br />
                      • Hold still for automatic capture
                    </div>
                  )}
                </div>
              )}
              
              {status === 'processing' && (
                <div className="processing-indicator">
                  <div className="spinner" />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      <div className="camera-controls">
        <button 
          onClick={handleCancel} 
          className="btn btn-outline"
          disabled={status === 'processing'}
        >
          Cancel
        </button>
        
        {status === 'detecting' && !requireLiveness && (
          <button 
            onClick={() => handleCapture()} 
            className="btn btn-primary btn-lg"
            disabled={!faceDetected || faceQuality < FACE_CONFIG.QUALITY_THRESHOLD}
          >
            Capture Biometric
          </button>
        )}
      </div>
    </div>
  )
}