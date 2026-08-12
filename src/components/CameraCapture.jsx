import { useState, useRef, useEffect } from 'react'
import './CameraCapture.css'

export function CameraCapture({ onCapture, onCancel, scanning = false }) {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 } 
      })
      setStream(mediaStream)
      if (videoRef.current) videoRef.current.srcObject = mediaStream
    } catch (err) {
      setError('Camera access denied. Please allow camera permissions.')
      console.error('Camera error:', err)
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    stopCamera()
    onCapture(dataUrl)
  }

  return (
    <div className="camera-capture">
      <div className="camera-view">
        {error && (
          <div className="camera-error">
            <p>{error}</p>
            <button onClick={onCancel} className="btn btn-outline btn-sm">Close</button>
          </div>
        )}
        {!error && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="camera-overlay">
              <div className="face-outline">
                {scanning && <div className="scan-line" />}
              </div>
            </div>
            <div className="camera-hint">
              {scanning ? 'Scanning...' : 'Position your face inside the frame'}
            </div>
          </>
        )}
      </div>
      {!error && (
        <div className="camera-controls">
          <button onClick={onCancel} className="btn btn-outline">Cancel</button>
          <button onClick={capturePhoto} className="btn btn-primary btn-lg" disabled={!stream}>
            {scanning ? 'Confirm' : 'Capture Photo'}
          </button>
        </div>
      )}
    </div>
  )
}
