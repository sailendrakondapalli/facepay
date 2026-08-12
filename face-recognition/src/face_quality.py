"""
Face Quality Assessment Module
Evaluates face image quality before processing
"""
import cv2
import numpy as np
import logging
from typing import Tuple, Dict, Optional
from dataclasses import dataclass

@dataclass
class QualityConfig:
    """Configuration for face quality assessment"""
    min_face_size: int = 80
    max_face_size: int = 400
    min_brightness: float = 50.0
    max_brightness: float = 200.0
    min_sharpness: float = 100.0
    frame_margin: int = 20  # Minimum pixels from frame edge
    landmark_validity_threshold: float = 0.8

class FaceQuality:
    """Face quality assessment class"""
    
    def __init__(self, config: Optional[QualityConfig] = None):
        self.config = config or QualityConfig()
        
    def assess_quality(self, frame: np.ndarray, face_box: list, 
                      landmarks: np.ndarray) -> Tuple[bool, str, Dict]:
        """
        Comprehensive face quality assessment
        
        Args:
            frame: Input frame (BGR)
            face_box: Face bounding box [x, y, w, h]
            landmarks: Facial landmarks array (5 points)
            
        Returns:
            Tuple of (is_good_quality, reason, quality_scores)
        """
        x, y, w, h = face_box
        height, width = frame.shape[:2]
        
        # Extract face region
        face_roi = frame[y:y+h, x:x+w]
        
        # Initialize quality scores dictionary
        quality_scores = {}
        
        # 1. Check face size
        size_ok, size_reason = self._check_face_size(w, h)
        quality_scores['size'] = {'ok': size_ok, 'reason': size_reason, 'width': w, 'height': h}
        if not size_ok:
            return False, size_reason, quality_scores
        
        # 2. Check face position (within frame boundaries)
        position_ok, position_reason = self._check_face_position(x, y, w, h, width, height)
        quality_scores['position'] = {'ok': position_ok, 'reason': position_reason}
        if not position_ok:
            return False, position_reason, quality_scores
        
        # 3. Check brightness
        brightness_ok, brightness_reason, brightness_value = self._check_brightness(face_roi)
        quality_scores['brightness'] = {'ok': brightness_ok, 'reason': brightness_reason, 'value': brightness_value}
        if not brightness_ok:
            return False, brightness_reason, quality_scores
        
        # 4. Check blur/sharpness
        sharpness_ok, sharpness_reason, sharpness_value = self._check_sharpness(face_roi)
        quality_scores['sharpness'] = {'ok': sharpness_ok, 'reason': sharpness_reason, 'value': sharpness_value}
        if not sharpness_ok:
            return False, sharpness_reason, quality_scores
        
        # 5. Check landmark validity
        landmarks_ok, landmarks_reason = self._check_landmarks(landmarks, x, y, w, h)
        quality_scores['landmarks'] = {'ok': landmarks_ok, 'reason': landmarks_reason}
        if not landmarks_ok:
            return False, landmarks_reason, quality_scores
        
        return True, "Good quality", quality_scores
    
    def _check_face_size(self, width: int, height: int) -> Tuple[bool, str]:
        """Check if face size is within acceptable range"""
        face_size = min(width, height)
        
        if face_size < self.config.min_face_size:
            return False, f"Face too small ({face_size}px < {self.config.min_face_size}px) - Move closer"
        
        if face_size > self.config.max_face_size:
            return False, f"Face too large ({face_size}px > {self.config.max_face_size}px) - Move back"
        
        return True, f"Good size ({face_size}px)"
    
    def _check_face_position(self, x: int, y: int, w: int, h: int, 
                           frame_width: int, frame_height: int) -> Tuple[bool, str]:
        """Check if face is properly positioned within frame"""
        margin = self.config.frame_margin
        
        # Check if face is too close to edges
        if x < margin:
            return False, "Move right - face too close to left edge"
        
        if y < margin:
            return False, "Move down - face too close to top edge"
        
        if (x + w) > (frame_width - margin):
            return False, "Move left - face too close to right edge"
        
        if (y + h) > (frame_height - margin):
            return False, "Move up - face too close to bottom edge"
        
        # Check if face is reasonably centered
        face_center_x = x + w // 2
        face_center_y = y + h // 2
        frame_center_x = frame_width // 2
        frame_center_y = frame_height // 2
        
        # Allow some deviation from center
        max_deviation_x = frame_width * 0.3
        max_deviation_y = frame_height * 0.3
        
        deviation_x = abs(face_center_x - frame_center_x)
        deviation_y = abs(face_center_y - frame_center_y)
        
        if deviation_x > max_deviation_x:
            direction = "left" if face_center_x > frame_center_x else "right"
            return False, f"Move {direction} - center your face"
        
        if deviation_y > max_deviation_y:
            direction = "up" if face_center_y > frame_center_y else "down"
            return False, f"Move {direction} - center your face"
        
        return True, "Good position"
    
    def _check_brightness(self, face_roi: np.ndarray) -> Tuple[bool, str, float]:
        """Check face brightness/exposure"""
        # Convert to grayscale for brightness calculation
        gray_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray_face)
        
        if mean_brightness < self.config.min_brightness:
            return False, f"Image too dark ({mean_brightness:.1f}) - Improve lighting", mean_brightness
        
        if mean_brightness > self.config.max_brightness:
            return False, f"Image too bright ({mean_brightness:.1f}) - Reduce lighting", mean_brightness
        
        return True, f"Good brightness ({mean_brightness:.1f})", mean_brightness
    
    def _check_sharpness(self, face_roi: np.ndarray) -> Tuple[bool, str, float]:
        """Check image sharpness using Laplacian variance"""
        gray_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
        
        # Calculate Laplacian variance (measure of sharpness)
        laplacian = cv2.Laplacian(gray_face, cv2.CV_64F)
        sharpness = laplacian.var()
        
        if sharpness < self.config.min_sharpness:
            return False, f"Image too blurry ({sharpness:.1f}) - Hold steady and focus", sharpness
        
        return True, f"Good sharpness ({sharpness:.1f})", sharpness
    
    def _check_landmarks(self, landmarks: np.ndarray, face_x: int, face_y: int, 
                        face_w: int, face_h: int) -> Tuple[bool, str]:
        """Check if facial landmarks are valid and properly positioned"""
        if landmarks is None or len(landmarks) != 5:
            return False, "Invalid landmarks detected"
        
        # Check if all landmarks are within face bounding box (with some tolerance)
        tolerance = 10  # pixels
        valid_landmarks = 0
        
        for point in landmarks:
            px, py = point
            # Check if landmark is within extended face region
            if (face_x - tolerance <= px <= face_x + face_w + tolerance and 
                face_y - tolerance <= py <= face_y + face_h + tolerance):
                valid_landmarks += 1
        
        validity_ratio = valid_landmarks / len(landmarks)
        
        if validity_ratio < self.config.landmark_validity_threshold:
            return False, f"Poor landmark detection ({valid_landmarks}/5 valid)"
        
        # Check landmark geometry (basic sanity check)
        left_eye, right_eye, nose, left_mouth, right_mouth = landmarks
        
        # Eyes should be horizontally aligned (roughly)
        eye_height_diff = abs(left_eye[1] - right_eye[1])
        if eye_height_diff > face_h * 0.1:  # 10% of face height tolerance
            return False, "Face not properly aligned - look straight at camera"
        
        # Nose should be between eyes horizontally
        eye_center_x = (left_eye[0] + right_eye[0]) / 2
        nose_deviation = abs(nose[0] - eye_center_x)
        if nose_deviation > face_w * 0.2:  # 20% of face width tolerance
            return False, "Face turned too much - look straight at camera"
        
        return True, "Good landmarks"
    
    def get_quality_summary(self, quality_scores: Dict) -> str:
        """Generate human-readable quality summary"""
        summary = []
        
        for category, data in quality_scores.items():
            if isinstance(data, dict) and 'ok' in data:
                status = "✓" if data['ok'] else "✗"
                reason = data.get('reason', category)
                summary.append(f"{status} {category.capitalize()}: {reason}")
        
        return "\n".join(summary)


def main():
    """Test face quality assessment"""
    logging.basicConfig(level=logging.INFO)
    
    # This is a test function - in real usage, quality assessment
    # is integrated with face detection
    print("Face Quality Assessment Test")
    print("This module is designed to work with detector.py")
    print("Run detector.py to see quality assessment in action.")
    
    # Create a test configuration
    config = QualityConfig()
    quality = FaceQuality(config)
    
    print(f"\nCurrent Quality Thresholds:")
    print(f"- Min face size: {config.min_face_size}px")
    print(f"- Max face size: {config.max_face_size}px")
    print(f"- Min brightness: {config.min_brightness}")
    print(f"- Max brightness: {config.max_brightness}")
    print(f"- Min sharpness: {config.min_sharpness}")
    print(f"- Frame margin: {config.frame_margin}px")


if __name__ == "__main__":
    main()