#!/usr/bin/env python3
"""
Face Registration System
Collects multiple high-quality face samples for a user
"""
import cv2
import numpy as np
import os
import logging
import json
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import time

from detector import FaceDetector, CameraCapture
from recognizer import FaceRecognizer
from database import DatabaseManager

class FaceRegistration:
    """Face registration system for collecting user face samples"""
    
    def __init__(self, yunet_model_path: str, sface_model_path: str, use_database: bool = True):
        """
        Initialize face registration system
        
        Args:
            yunet_model_path: Path to YuNet face detection model
            sface_model_path: Path to SFace recognition model  
            use_database: Whether to use database storage (fallback to local files if False)
        """
        self.detector = FaceDetector(yunet_model_path)
        self.recognizer = FaceRecognizer(sface_model_path)
        self.camera = CameraCapture()
        self.use_database = use_database
        
        # Initialize database if enabled
        self.db_manager = None
        if use_database:
            try:
                self.db_manager = DatabaseManager()
                if self.db_manager.test_connection():
                    logging.info("Database connection established")
                else:
                    logging.warning("Database connection failed - falling back to local storage")
                    self.use_database = False
            except Exception as e:
                logging.error(f"Database initialization failed: {e}")
                self.use_database = False
        
        # Local storage directory if database is not available
        self.local_storage_dir = "../data/registrations"
        if not self.use_database:
            os.makedirs(self.local_storage_dir, exist_ok=True)
            logging.info(f"Using local storage: {self.local_storage_dir}")
        
        # Registration settings
        self.min_samples = 5
        self.max_samples = 10
        self.sample_delay = 1.0  # seconds between samples
        
    def register_user(self, user_id: str, name: str) -> bool:
        """
        Complete user registration workflow
        
        Args:
            user_id: Unique user identifier
            name: User's full name
            
        Returns:
            True if registration successful
        """
        print(f"\n=== Face Registration for {name} (ID: {user_id}) ===")
        print(f"Target samples: {self.min_samples}-{self.max_samples}")
        print("Instructions:")
        print("- Look straight at the camera")
        print("- Move slightly between samples (left, right, up, down)")
        print("- Ensure good lighting")
        print("- Press SPACE to capture sample")
        print("- Press 'q' to finish early (min 5 samples)")
        print("- Press 'r' to restart")
        
        # Register user in database first
        user_uuid = None
        if self.use_database and self.db_manager:
            user_uuid = self.db_manager.register_user(user_id, name)
            if not user_uuid:
                print("Warning: Could not register user in database, using local storage")
                self.use_database = False
        
        # Start camera
        if not self.camera.start_camera():
            print("ERROR: Could not start camera")
            return False
        
        samples_collected = []
        sample_count = 0
        last_sample_time = 0
        
        print(f"\nCamera ready! Press SPACE to capture samples...")
        
        try:
            while sample_count < self.max_samples:
                frame = self.camera.read_frame()
                if frame is None:
                    continue
                
                # Process frame for face detection and quality
                success, message, aligned_face, processing_info = self.detector.process_face_for_recognition(frame)
                
                # Create display frame
                display_frame = frame.copy()
                
                # Show instructions and status
                status_color = (0, 255, 0) if success else (0, 165, 255)
                cv2.putText(display_frame, f"Samples: {sample_count}/{self.max_samples}", 
                           (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                cv2.putText(display_frame, message, (10, 70), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
                
                if success:
                    cv2.putText(display_frame, "READY - Press SPACE to capture", 
                               (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    
                    # Draw face detection
                    if processing_info:
                        face_box = processing_info['face_box']
                        landmarks = processing_info['landmarks']
                        x, y, w, h = face_box
                        
                        # Draw bounding box
                        cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                        
                        # Draw landmarks
                        for point in landmarks:
                            cv2.circle(display_frame, tuple(point), 3, (0, 255, 0), -1)
                        
                        # Show confidence and quality
                        conf = processing_info['confidence']
                        quality = processing_info['quality']
                        cv2.putText(display_frame, f"Confidence: {conf:.2f}", 
                                   (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                
                cv2.imshow('Face Registration', display_frame)
                
                # Handle key input
                key = cv2.waitKey(1) & 0xFF
                current_time = time.time()
                
                if key == ord(' ') and success and (current_time - last_sample_time) > self.sample_delay:
                    # Capture sample
                    sample_data = self._capture_sample(aligned_face, processing_info, sample_count + 1)
                    if sample_data:
                        samples_collected.append(sample_data)
                        sample_count += 1
                        last_sample_time = current_time
                        print(f"✓ Sample {sample_count} captured (quality: {sample_data['quality_score']:.3f})")
                        
                        # Give user time to move for next sample
                        if sample_count < self.max_samples:
                            print("Move slightly for next sample...")
                
                elif key == ord('q'):
                    if sample_count >= self.min_samples:
                        print(f"\nFinishing registration with {sample_count} samples...")
                        break
                    else:
                        print(f"Need at least {self.min_samples} samples (have {sample_count})")
                
                elif key == ord('r'):
                    print("Restarting registration...")
                    samples_collected = []
                    sample_count = 0
                
                elif key == 27:  # ESC
                    print("Registration cancelled")
                    return False
        
        finally:
            self.camera.release()
            cv2.destroyAllWindows()
        
        # Process and store samples
        if sample_count >= self.min_samples:
            return self._store_registration(user_id, name, user_uuid, samples_collected)
        else:
            print("Registration failed - insufficient samples")
            return False
    
    def _capture_sample(self, aligned_face: np.ndarray, processing_info: Dict, sample_number: int) -> Optional[Dict]:
        """
        Capture and process a single face sample
        
        Args:
            aligned_face: Aligned face image
            processing_info: Processing information from detection
            sample_number: Sample number
            
        Returns:
            Sample data dictionary or None if failed
        """
        try:
            # Extract embedding
            embedding = self.recognizer.extract_embedding(aligned_face)
            
            # Validate embedding
            if not self.recognizer.validate_embedding(embedding):
                print(f"Invalid embedding for sample {sample_number}")
                return None
            
            # Calculate quality score from processing info
            quality_info = processing_info['quality']
            quality_scores = quality_info.get('scores', {})
            
            # Aggregate quality score (0.0 to 1.0)
            quality_score = 0.0
            valid_scores = 0
            
            for category, data in quality_scores.items():
                if isinstance(data, dict) and 'ok' in data:
                    quality_score += 1.0 if data['ok'] else 0.0
                    valid_scores += 1
            
            if valid_scores > 0:
                quality_score /= valid_scores
            
            # Create sample data
            sample_data = {
                'sample_number': sample_number,
                'embedding': embedding,
                'quality_score': quality_score,
                'confidence': processing_info['confidence'],
                'face_box': processing_info['face_box'],
                'landmarks': processing_info['landmarks'].tolist(),
                'timestamp': datetime.now().isoformat(),
                'quality_details': quality_info
            }
            
            # Optionally save aligned face image
            if not self.use_database:  # Save images for local storage
                sample_data['aligned_face'] = aligned_face
            
            return sample_data
            
        except Exception as e:
            logging.error(f"Failed to capture sample {sample_number}: {e}")
            return None
    
    def _store_registration(self, user_id: str, name: str, user_uuid: Optional[str], samples: List[Dict]) -> bool:
        """
        Store registration data (database or local files)
        
        Args:
            user_id: User identifier
            name: User name
            user_uuid: Database user UUID (if using database)
            samples: List of sample data
            
        Returns:
            True if storage successful
        """
        try:
            if self.use_database and self.db_manager and user_uuid:
                # Store in database
                print(f"Storing {len(samples)} samples in database...")
                
                for i, sample in enumerate(samples):
                    success = self.db_manager.store_face_embedding(
                        user_uuid=user_uuid,
                        embedding=sample['embedding'],
                        quality_score=float(sample['quality_score']),
                        metadata={
                            'sample_number': int(sample['sample_number']),
                            'confidence': float(sample['confidence']),
                            'face_box': [int(x) for x in sample['face_box']],
                            'landmarks': [[float(x), float(y)] for x, y in sample['landmarks']],
                            'timestamp': sample['timestamp'],
                            'quality_details': sample['quality_details']
                        }
                    )
                    
                    if not success:
                        print(f"Failed to store sample {i+1}")
                        return False
                
                print("✓ All samples stored in database successfully")
                return True
                
            else:
                # Store locally
                print(f"Storing {len(samples)} samples locally...")
                
                user_dir = os.path.join(self.local_storage_dir, user_id)
                os.makedirs(user_dir, exist_ok=True)
                
                # Save user metadata
                user_metadata = {
                    'user_id': user_id,
                    'name': name,
                    'registration_date': datetime.now().isoformat(),
                    'sample_count': len(samples)
                }
                
                with open(os.path.join(user_dir, 'user_info.json'), 'w') as f:
                    json.dump(user_metadata, f, indent=2)
                
                # Save samples
                for i, sample in enumerate(samples):
                    # Save embedding
                    embedding_file = os.path.join(user_dir, f'embedding_{sample["sample_number"]}.npy')
                    np.save(embedding_file, sample['embedding'])
                    
                    # Save metadata
                    metadata_file = os.path.join(user_dir, f'sample_{sample["sample_number"]}.json')
                    sample_metadata = {k: v for k, v in sample.items() if k != 'embedding' and k != 'aligned_face'}
                    with open(metadata_file, 'w') as f:
                        json.dump(sample_metadata, f, indent=2, default=str)
                    
                    # Save aligned face image
                    if 'aligned_face' in sample:
                        image_file = os.path.join(user_dir, f'aligned_face_{sample["sample_number"]}.jpg')
                        cv2.imwrite(image_file, sample['aligned_face'])
                
                print(f"✓ All samples stored locally in: {user_dir}")
                return True
                
        except Exception as e:
            logging.error(f"Failed to store registration: {e}")
            return False
    
    def list_registered_users(self) -> List[Dict]:
        """
        List all registered users
        
        Returns:
            List of user information
        """
        users = []
        
        if self.use_database and self.db_manager:
            # Get from database (would need a method in DatabaseManager)
            # For now, return empty list
            pass
        else:
            # Get from local storage
            if os.path.exists(self.local_storage_dir):
                for user_dir in os.listdir(self.local_storage_dir):
                    user_path = os.path.join(self.local_storage_dir, user_dir)
                    if os.path.isdir(user_path):
                        user_info_file = os.path.join(user_path, 'user_info.json')
                        if os.path.exists(user_info_file):
                            try:
                                with open(user_info_file, 'r') as f:
                                    user_info = json.load(f)
                                    users.append(user_info)
                            except Exception as e:
                                logging.error(f"Failed to read user info for {user_dir}: {e}")
        
        return users


def main():
    """Test face registration system"""
    logging.basicConfig(level=logging.INFO)
    
    # Model paths
    yunet_model = "../models/face_detection_yunet_2023mar.onnx"
    sface_model = "../models/face_recognition_sface_2021dec.onnx"
    
    # Check models exist
    if not os.path.exists(yunet_model):
        print(f"ERROR: YuNet model not found at {yunet_model}")
        return
    
    if not os.path.exists(sface_model):
        print(f"ERROR: SFace model not found at {sface_model}")
        return
    
    try:
        # Initialize registration system
        print("Initializing face registration system...")
        registration = FaceRegistration(yunet_model, sface_model, use_database=True)
        
        # Interactive menu
        while True:
            print("\n=== Face Registration System ===")
            print("1. Register new user")
            print("2. List registered users") 
            print("3. Exit")
            
            choice = input("\nEnter choice (1-3): ").strip()
            
            if choice == '1':
                user_id = input("Enter user ID: ").strip()
                name = input("Enter full name: ").strip()
                
                if user_id and name:
                    success = registration.register_user(user_id, name)
                    if success:
                        print(f"✓ Registration successful for {name}")
                    else:
                        print(f"✗ Registration failed for {name}")
                else:
                    print("Invalid input - user ID and name required")
            
            elif choice == '2':
                users = registration.list_registered_users()
                if users:
                    print(f"\nRegistered Users ({len(users)}):")
                    for user in users:
                        print(f"- {user['name']} (ID: {user['user_id']}) - {user['sample_count']} samples")
                else:
                    print("No registered users found")
            
            elif choice == '3':
                print("Exiting...")
                break
            
            else:
                print("Invalid choice")
                
    except Exception as e:
        logging.error(f"Registration system error: {e}")
        print(f"Error: {e}")


if __name__ == "__main__":
    main()