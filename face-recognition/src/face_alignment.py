"""
Face Alignment Module
Aligns detected faces to a canonical pose for recognition
"""
import cv2
import numpy as np
import logging
from typing import Tuple, Optional

class FaceAligner:
    """Face alignment using facial landmarks"""
    
    def __init__(self, output_size: Tuple[int, int] = (112, 112)):
        """
        Initialize face aligner
        
        Args:
            output_size: Output aligned face size (width, height)
        """
        self.output_size = output_size
        
        # Define canonical facial landmarks for alignment
        # These are the target positions for the aligned face
        # Based on standard face recognition datasets
        self.canonical_landmarks = np.array([
            [38.2946, 51.6963],  # Left eye
            [73.5318, 51.5014],  # Right eye  
            [56.0252, 71.7366],  # Nose tip
            [41.5493, 92.3655],  # Left mouth corner
            [70.7299, 92.2041]   # Right mouth corner
        ], dtype=np.float32)
        
        # Scale canonical landmarks to match output size
        # Original canonical landmarks are for 112x112 image
        scale_x = self.output_size[0] / 112.0
        scale_y = self.output_size[1] / 112.0
        
        self.canonical_landmarks[:, 0] *= scale_x
        self.canonical_landmarks[:, 1] *= scale_y
        
        logging.info(f"Face aligner initialized for {output_size[0]}x{output_size[1]} output")
    
    def align_face(self, image: np.ndarray, landmarks: np.ndarray, 
                   face_box: Optional[list] = None) -> Tuple[np.ndarray, np.ndarray]:
        """
        Align face using facial landmarks
        
        Args:
            image: Input image (BGR format)
            landmarks: Facial landmarks (5 points) in format [[x1,y1], [x2,y2], ...]
            face_box: Optional face bounding box [x, y, w, h] for validation
            
        Returns:
            Tuple of (aligned_face, transformation_matrix)
        """
        if len(landmarks) != 5:
            raise ValueError(f"Expected 5 landmarks, got {len(landmarks)}")
        
        # Convert landmarks to float32
        src_landmarks = landmarks.astype(np.float32)
        
        # Validate landmarks are reasonable (within image bounds)
        h, w = image.shape[:2]
        if not self._validate_landmarks(src_landmarks, w, h):
            raise ValueError("Invalid landmarks detected")
        
        # Calculate similarity transformation matrix
        # This will handle rotation, scaling, and translation
        transformation_matrix = self._estimate_transformation(src_landmarks, self.canonical_landmarks)
        
        # Apply transformation to align the face
        aligned_face = cv2.warpAffine(
            image, 
            transformation_matrix, 
            self.output_size,
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT
        )
        
        return aligned_face, transformation_matrix
    
    def _validate_landmarks(self, landmarks: np.ndarray, image_width: int, image_height: int) -> bool:
        """
        Validate that landmarks are reasonable
        
        Args:
            landmarks: Facial landmarks array
            image_width: Image width
            image_height: Image height
            
        Returns:
            True if landmarks are valid
        """
        # Check if all landmarks are within image bounds (with small tolerance)
        tolerance = 10
        for point in landmarks:
            x, y = point
            if (x < -tolerance or x > image_width + tolerance or 
                y < -tolerance or y > image_height + tolerance):
                return False
        
        # Check basic facial geometry
        left_eye, right_eye, nose, left_mouth, right_mouth = landmarks
        
        # Eyes should be roughly horizontal
        eye_height_diff = abs(left_eye[1] - right_eye[1])
        face_width = abs(right_eye[0] - left_eye[0])
        if eye_height_diff > face_width * 0.2:  # 20% tolerance
            logging.warning(f"Large eye height difference: {eye_height_diff:.1f}")
        
        # Eyes should be above mouth
        avg_eye_y = (left_eye[1] + right_eye[1]) / 2
        avg_mouth_y = (left_mouth[1] + right_mouth[1]) / 2
        if avg_eye_y >= avg_mouth_y:
            logging.warning("Eyes below mouth - invalid face orientation")
            return False
        
        # Nose should be between eyes and mouth vertically
        if not (avg_eye_y < nose[1] < avg_mouth_y):
            logging.warning(f"Nose not between eyes and mouth: eye_y={avg_eye_y:.1f}, nose_y={nose[1]:.1f}, mouth_y={avg_mouth_y:.1f}")
        
        return True
    
    def _estimate_transformation(self, src_landmarks: np.ndarray, dst_landmarks: np.ndarray) -> np.ndarray:
        """
        Estimate similarity transformation matrix between source and destination landmarks
        
        Args:
            src_landmarks: Source facial landmarks
            dst_landmarks: Destination (canonical) facial landmarks
            
        Returns:
            2x3 transformation matrix
        """
        # Use OpenCV's estimateAffinePartial2D for similarity transform
        # This estimates rotation, uniform scaling, and translation
        transformation_matrix, _ = cv2.estimateAffinePartial2D(
            src_landmarks, 
            dst_landmarks, 
            method=cv2.RANSAC,
            ransacReprojThreshold=2.0
        )
        
        if transformation_matrix is None:
            # Fallback to simple affine transformation if RANSAC fails
            logging.warning("RANSAC failed, using simple affine transform")
            transformation_matrix = cv2.getAffineTransform(
                src_landmarks[:3],  # Use first 3 points
                dst_landmarks[:3]
            )
        
        return transformation_matrix
    
    def align_face_simple(self, image: np.ndarray, face_box: list) -> np.ndarray:
        """
        Simple face alignment using only bounding box (fallback method)
        
        Args:
            image: Input image
            face_box: Face bounding box [x, y, w, h]
            
        Returns:
            Aligned (cropped and resized) face
        """
        x, y, w, h = face_box
        
        # Add padding around face
        padding = 0.2  # 20% padding
        pad_x = int(w * padding)
        pad_y = int(h * padding)
        
        # Calculate expanded bounding box
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(image.shape[1], x + w + pad_x)
        y2 = min(image.shape[0], y + h + pad_y)
        
        # Crop face region
        face_crop = image[y1:y2, x1:x2]
        
        # Resize to target size
        aligned_face = cv2.resize(face_crop, self.output_size, interpolation=cv2.INTER_LINEAR)
        
        return aligned_face
    
    def visualize_alignment(self, original_image: np.ndarray, landmarks: np.ndarray, 
                          aligned_face: np.ndarray) -> np.ndarray:
        """
        Create visualization showing original and aligned face
        
        Args:
            original_image: Original image
            landmarks: Original landmarks
            aligned_face: Aligned face result
            
        Returns:
            Visualization image
        """
        # Create visualization
        vis_height = max(original_image.shape[0], aligned_face.shape[0])
        vis_width = original_image.shape[1] + aligned_face.shape[1] + 20
        visualization = np.zeros((vis_height, vis_width, 3), dtype=np.uint8)
        
        # Copy original image
        visualization[:original_image.shape[0], :original_image.shape[1]] = original_image
        
        # Draw landmarks on original
        for i, point in enumerate(landmarks):
            color = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255)][i]
            cv2.circle(visualization, tuple(point.astype(int)), 3, color, -1)
        
        # Copy aligned face
        x_offset = original_image.shape[1] + 10
        y_offset = (vis_height - aligned_face.shape[0]) // 2
        visualization[y_offset:y_offset+aligned_face.shape[0], 
                     x_offset:x_offset+aligned_face.shape[1]] = aligned_face
        
        # Draw canonical landmarks on aligned face
        for i, point in enumerate(self.canonical_landmarks):
            color = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255)][i]
            landmark_pos = (int(point[0] + x_offset), int(point[1] + y_offset))
            cv2.circle(visualization, landmark_pos, 2, color, -1)
        
        # Add labels
        cv2.putText(visualization, 'Original', (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(visualization, 'Aligned', (x_offset + 10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        return visualization


def main():
    """Test face alignment"""
    logging.basicConfig(level=logging.INFO)
    
    print("Face Alignment Test")
    print("This module works with detector.py to align detected faces")
    print("Integration test will be available after detector integration")
    
    # Test canonical landmarks
    aligner = FaceAligner((112, 112))
    print(f"\nCanonical landmarks for {aligner.output_size}:")
    for i, point in enumerate(aligner.canonical_landmarks):
        labels = ["Left Eye", "Right Eye", "Nose", "Left Mouth", "Right Mouth"]
        print(f"{labels[i]}: ({point[0]:.1f}, {point[1]:.1f})")


if __name__ == "__main__":
    main()