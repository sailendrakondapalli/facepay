"""
Face Detection using OpenCV YuNet with Quality Assessment and Alignment
"""
import cv2
import numpy as np
import os
import logging
from typing import Optional, List, Tuple, Dict
from face_quality import FaceQuality, QualityConfig
from face_alignment import FaceAligner

class FaceDetector:
    def __init__(self, model_path: str, input_size: Tuple[int, int] = (320, 320), 
                 confidence_threshold: float = 0.7, nms_threshold: float = 0.3):
        """
        Initialize YuNet face detector with quality assessment
        
        Args:
            model_path: Path to YuNet ONNX model
            input_size: Input size for the model (width, height)
            confidence_threshold: Confidence threshold for face detection
            nms_threshold: NMS threshold for face detection
        """
        self.model_path = model_path
        self.input_size = input_size
        self.confidence_threshold = confidence_threshold
        self.nms_threshold = nms_threshold
        self.detector = None
        
        # Initialize quality assessor and face aligner
        self.quality_assessor = FaceQuality()
        self.face_aligner = FaceAligner()
        
        # Initialize detector
        self._load_model()
        
    def _load_model(self):
        """Load the YuNet model"""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"YuNet model not found at {self.model_path}")
            
        try:
            # Create FaceDetectorYN instance
            self.detector = cv2.FaceDetectorYN.create(
                model=self.model_path,
                config="",
                input_size=self.input_size,
                score_threshold=self.confidence_threshold,
                nms_threshold=self.nms_threshold,
                top_k=5000
            )
            logging.info(f"YuNet model loaded successfully from {self.model_path}")
        except Exception as e:
            logging.error(f"Failed to load YuNet model: {e}")
            raise
    
    def detect_faces(self, frame: np.ndarray) -> Tuple[List[np.ndarray], List[float], List[np.ndarray]]:
        """
        Detect faces in the given frame
        
        Args:
            frame: Input image frame (BGR format)
            
        Returns:
            Tuple containing:
            - List of face bounding boxes (x, y, w, h)
            - List of confidence scores
            - List of facial landmarks (5 points per face)
        """
        if self.detector is None:
            raise RuntimeError("Detector not initialized")
        
        # Set input size based on frame dimensions
        height, width = frame.shape[:2]
        self.detector.setInputSize((width, height))
        
        # Detect faces
        _, faces = self.detector.detect(frame)
        
        face_boxes = []
        confidences = []
        landmarks = []
        
        if faces is not None:
            for face in faces:
                # Extract bounding box
                x, y, w, h = face[0:4].astype(int)
                confidence = face[14]
                
                # Extract 5 facial landmarks
                face_landmarks = face[4:14].reshape(5, 2).astype(int)
                
                face_boxes.append([x, y, w, h])
                confidences.append(confidence)
                landmarks.append(face_landmarks)
        
        return face_boxes, confidences, landmarks
        
    def detect_faces_with_quality(self, frame: np.ndarray) -> Tuple[List[np.ndarray], List[float], List[np.ndarray], List[Dict]]:
        """
        Detect faces and assess their quality
        
        Args:
            frame: Input image frame (BGR format)
            
        Returns:
            Tuple containing:
            - List of face bounding boxes (x, y, w, h)
            - List of confidence scores
            - List of facial landmarks (5 points per face)
            - List of quality assessments
        """
        # First detect faces
        face_boxes, confidences, landmarks = self.detect_faces(frame)
        
        # Assess quality for each face
        quality_assessments = []
        for box, landmark_points in zip(face_boxes, landmarks):
            is_good, reason, scores = self.quality_assessor.assess_quality(frame, box, landmark_points)
            quality_assessments.append({
                'is_good': is_good,
                'reason': reason,
                'scores': scores
            })
        
        return face_boxes, confidences, landmarks, quality_assessments
        
    def process_face_for_recognition(self, frame: np.ndarray) -> Tuple[bool, str, Optional[np.ndarray], Optional[Dict]]:
        """
        Complete face processing pipeline for recognition:
        Detection -> Quality Check -> Alignment
        
        Args:
            frame: Input frame
            
        Returns:
            Tuple of (success, message, aligned_face, quality_info)
        """
        # Detect faces with quality assessment
        face_boxes, confidences, landmarks, quality_assessments = self.detect_faces_with_quality(frame)
        
        if len(face_boxes) == 0:
            return False, "No face detected", None, None
        
        if len(face_boxes) > 1:
            good_faces = sum(1 for q in quality_assessments if q['is_good'])
            return False, f"Multiple faces detected ({len(face_boxes)} total, {good_faces} good quality)", None, None
        
        # Single face detected
        face_box = face_boxes[0]
        face_landmarks = landmarks[0]
        quality = quality_assessments[0]
        confidence = confidences[0]
        
        # Check quality
        if not quality['is_good']:
            return False, quality['reason'], None, quality
        
        # Align face
        try:
            aligned_face, transformation_matrix = self.face_aligner.align_face(frame, face_landmarks, face_box)
            
            # Package quality info with alignment results
            processing_info = {
                'quality': quality,
                'confidence': confidence,
                'face_box': face_box,
                'landmarks': face_landmarks,
                'transformation_matrix': transformation_matrix
            }
            
            return True, "Face processed successfully", aligned_face, processing_info
            
        except Exception as e:
            logging.error(f"Face alignment failed: {e}")
            return False, f"Face alignment failed: {str(e)}", None, quality
    
    def draw_detections(self, frame: np.ndarray, face_boxes: List[np.ndarray], 
                       confidences: List[float], landmarks: List[np.ndarray]) -> np.ndarray:
        """
        Draw face detections on the frame
        
        Args:
            frame: Input frame
            face_boxes: List of face bounding boxes
            confidences: List of confidence scores
            landmarks: List of facial landmarks
            
        Returns:
            Frame with drawn detections
        """
        result_frame = frame.copy()
        
        for box, conf, points in zip(face_boxes, confidences, landmarks):
            x, y, w, h = box
            
            # Draw bounding box
            cv2.rectangle(result_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            
            # Draw confidence score
            label = f'Face: {conf:.2f}'
            label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
            cv2.rectangle(result_frame, (x, y - label_size[1] - 10), 
                         (x + label_size[0], y), (0, 255, 0), -1)
            cv2.putText(result_frame, label, (x, y - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
            
            # Draw facial landmarks
            for point in points:
                cv2.circle(result_frame, tuple(point), 3, (0, 0, 255), -1)
        
        return result_frame
        
    def draw_detections_with_quality(self, frame: np.ndarray, face_boxes: List[np.ndarray], 
                                   confidences: List[float], landmarks: List[np.ndarray], 
                                   quality_assessments: List[Dict]) -> np.ndarray:
        """
        Draw face detections with quality information on the frame
        
        Args:
            frame: Input frame
            face_boxes: List of face bounding boxes
            confidences: List of confidence scores
            landmarks: List of facial landmarks
            quality_assessments: List of quality assessment results
            
        Returns:
            Frame with drawn detections and quality info
        """
        result_frame = frame.copy()
        
        for box, conf, points, quality in zip(face_boxes, confidences, landmarks, quality_assessments):
            x, y, w, h = box
            
            # Choose color based on quality
            color = (0, 255, 0) if quality['is_good'] else (0, 165, 255)  # Green if good, orange if bad
            
            # Draw bounding box
            cv2.rectangle(result_frame, (x, y), (x + w, y + h), color, 2)
            
            # Draw confidence and quality
            if quality['is_good']:
                label = f'Face: {conf:.2f} ✓'
            else:
                label = f'Face: {conf:.2f} ✗'
            
            label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
            cv2.rectangle(result_frame, (x, y - label_size[1] - 10), 
                         (x + label_size[0], y), color, -1)
            cv2.putText(result_frame, label, (x, y - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
            
            # Draw quality reason below the box
            reason = quality['reason']
            reason_size = cv2.getTextSize(reason, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
            cv2.rectangle(result_frame, (x, y + h), (x + reason_size[0], y + h + reason_size[1] + 10), 
                         color, -1)
            cv2.putText(result_frame, reason, (x, y + h + reason_size[1] + 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
            
            # Draw facial landmarks (different colors based on quality)
            landmark_color = (0, 255, 0) if quality['is_good'] else (0, 0, 255)
            for point in points:
                cv2.circle(result_frame, tuple(point), 3, landmark_color, -1)
        
        return result_frame
    
    def get_detection_status(self, face_count: int) -> str:
        """
        Get human-readable detection status
        
        Args:
            face_count: Number of faces detected
            
        Returns:
            Status message
        """
        if face_count == 0:
            return "No face detected"
        elif face_count == 1:
            return "Face detected"
        else:
            return f"Multiple faces detected ({face_count} total)"
    def get_detection_status_with_quality(self, face_count: int, quality_assessments: List[Dict]) -> str:
        """
        Get human-readable detection status with quality info
        
        Args:
            face_count: Number of faces detected
            quality_assessments: List of quality assessments
            
        Returns:
            Status message
        """
        if face_count == 0:
            return "No face detected"
        elif face_count == 1:
            quality = quality_assessments[0]
            if quality['is_good']:
                return "Face detected - Good quality ✓"
            else:
                return f"Face detected - {quality['reason']}"
        else:
            good_faces = sum(1 for q in quality_assessments if q['is_good'])
            return f"Multiple faces detected ({good_faces}/{face_count} good quality)"


class CameraCapture:
    """Camera capture utility for face detection"""
    
    def __init__(self, camera_index: int = 0, width: int = 640, height: int = 480):
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.cap = None
        
    def start_camera(self) -> bool:
        """Start camera capture"""
        try:
            self.cap = cv2.VideoCapture(self.camera_index)
            if not self.cap.isOpened():
                logging.error("Failed to open camera")
                return False
                
            # Set camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            
            logging.info(f"Camera started: {self.width}x{self.height}")
            return True
        except Exception as e:
            logging.error(f"Failed to start camera: {e}")
            return False
    
    def read_frame(self) -> Optional[np.ndarray]:
        """Read a frame from camera"""
        if self.cap is None or not self.cap.isOpened():
            return None
            
        ret, frame = self.cap.read()
        return frame if ret else None
    
    def release(self):
        """Release camera resources"""
        if self.cap is not None:
            self.cap.release()
            logging.info("Camera released")


def main():
    """Test face detection"""
    logging.basicConfig(level=logging.INFO)
    
    # Model path - you need to download this manually
    model_path = "../models/face_detection_yunet_2023mar.onnx"
    
    if not os.path.exists(model_path):
        print("ERROR: YuNet model not found!")
        print("Please download the YuNet model:")
        print("1. Go to: https://github.com/opencv/opencv_zoo/tree/master/models/face_detection_yunet")
        print("2. Download: face_detection_yunet_2023mar.onnx")
        print(f"3. Place it at: {model_path}")
        return
    
    # Initialize detector
    try:
        detector = FaceDetector(model_path)
        camera = CameraCapture()
        
        if not camera.start_camera():
            print("Failed to start camera")
            return
        
        print("Face Detection + Quality Assessment + Alignment Test")
        print("Press 'q' to quit, 'c' to capture frame info, 's' to save good quality face, 'a' to test alignment")
        
        while True:
            frame = camera.read_frame()
            if frame is None:
                break
            
            # Detect faces with quality assessment
            face_boxes, confidences, landmarks, quality_assessments = detector.detect_faces_with_quality(frame)
            
            # Draw detections with quality info
            result_frame = detector.draw_detections_with_quality(frame, face_boxes, confidences, landmarks, quality_assessments)
            
            # Add status text
            status = detector.get_detection_status_with_quality(len(face_boxes), quality_assessments)
            cv2.putText(result_frame, status, (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            
            # Show frame
            cv2.imshow('YuNet Face Detection + Quality Assessment', result_frame)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('c'):
                print(f"\n--- Frame Info ---")
                print(f"Faces detected: {len(face_boxes)}")
                for i, (box, conf, quality) in enumerate(zip(face_boxes, confidences, quality_assessments)):
                    print(f"\nFace {i+1}:")
                    print(f"  Box: {box}")
                    print(f"  Confidence: {conf:.3f}")
                    print(f"  Quality: {'GOOD' if quality['is_good'] else 'POOR'}")
                    print(f"  Reason: {quality['reason']}")
                    if 'scores' in quality:
                        print(f"  Detailed scores:")
                        for category, data in quality['scores'].items():
                            if isinstance(data, dict):
                                print(f"    {category}: {'✓' if data.get('ok') else '✗'} - {data.get('reason', 'N/A')}")
            elif key == ord('s'):
                # Save faces that pass quality check
                good_faces = []
                for i, (box, quality) in enumerate(zip(face_boxes, quality_assessments)):
                    if quality['is_good']:
                        x, y, w, h = box
                        face_roi = frame[y:y+h, x:x+w]
                        filename = f"good_quality_face_{i}_{len(os.listdir('.')) if os.path.exists('.') else 0}.jpg"
                        cv2.imwrite(filename, face_roi)
                        good_faces.append(filename)
                        print(f"Saved good quality face: {filename}")
                
                if not good_faces:
                    print("No good quality faces to save")
                else:
                    print(f"Saved {len(good_faces)} good quality faces")
            elif key == ord('a'):
                # Test face alignment
                success, message, aligned_face, processing_info = detector.process_face_for_recognition(frame)
                print(f"\n--- Alignment Test ---")
                print(f"Success: {success}")
                print(f"Message: {message}")
                
                if success and aligned_face is not None:
                    # Show alignment visualization
                    landmarks_array = processing_info['landmarks']
                    vis = detector.face_aligner.visualize_alignment(frame, landmarks_array, aligned_face)
                    cv2.imshow('Face Alignment Visualization', vis)
                    
                    # Save aligned face
                    filename = f"aligned_face_{len(os.listdir('.')) if os.path.exists('.') else 0}.jpg"
                    cv2.imwrite(filename, aligned_face)
                    print(f"Saved aligned face: {filename}")
                    print(f"Aligned face size: {aligned_face.shape}")
                else:
                    print("Face alignment failed or no good quality face detected")
        
        camera.release()
        cv2.destroyAllWindows()
        
    except Exception as e:
        logging.error(f"Error in main: {e}")


if __name__ == "__main__":
    main()