#!/usr/bin/env python3
"""
Face Recognition System
Identifies faces against registered users in the database
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

class FaceRecognition:
    """Face recognition system for identifying registered users"""
    
    def __init__(self, yunet_model_path: str, sface_model_path: str, 
                 recognition_threshold: float = 0.5, use_database: bool = True):
        """
        Initialize face recognition system
        
        Args:
            yunet_model_path: Path to YuNet face detection model
            sface_model_path: Path to SFace recognition model
            recognition_threshold: Similarity threshold for face matching
            use_database: Whether to use database (fallback to local storage)
        """
        self.detector = FaceDetector(yunet_model_path)
        self.recognizer = FaceRecognizer(sface_model_path)
        self.camera = CameraCapture()
        self.threshold = recognition_threshold
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
        if not self.use_database and not os.path.exists(self.local_storage_dir):
            logging.error(f"Local storage directory not found: {self.local_storage_dir}")
            logging.error("Please register users first or enable database")
        
        # Cache for loaded embeddings (performance optimization)
        self.embeddings_cache = None
        self.cache_timestamp = None
        self.cache_refresh_interval = 60.0  # seconds
        
        # Performance tracking
        self.recognition_stats = {
            'total_attempts': 0,
            'successful_matches': 0,
            'failed_matches': 0,
            'avg_confidence': 0.0
        }
    
    def load_registered_embeddings(self, force_refresh: bool = False) -> List[Dict]:
        """
        Load all registered user embeddings
        
        Args:
            force_refresh: Force reload from database/storage
            
        Returns:
            List of embedding records with user info
        """
        current_time = time.time()
        
        # Use cache if available and recent
        if (not force_refresh and self.embeddings_cache is not None and 
            self.cache_timestamp is not None and 
            (current_time - self.cache_timestamp) < self.cache_refresh_interval):
            return self.embeddings_cache
        
        embeddings = []
        
        if self.use_database and self.db_manager:
            # Load from database
            embeddings = self.db_manager.get_all_embeddings()
            logging.info(f"Loaded {len(embeddings)} embeddings from database")
        else:
            # Load from local storage
            embeddings = self._load_local_embeddings()
            logging.info(f"Loaded {len(embeddings)} embeddings from local storage")
        
        # Update cache
        self.embeddings_cache = embeddings
        self.cache_timestamp = current_time
        
        return embeddings
    
    def _load_local_embeddings(self) -> List[Dict]:
        """Load embeddings from local file storage"""
        embeddings = []
        
        if not os.path.exists(self.local_storage_dir):
            return embeddings
        
        for user_dir in os.listdir(self.local_storage_dir):
            user_path = os.path.join(self.local_storage_dir, user_dir)
            if not os.path.isdir(user_path):
                continue
            
            # Load user info
            user_info_file = os.path.join(user_path, 'user_info.json')
            if not os.path.exists(user_info_file):
                continue
            
            try:
                with open(user_info_file, 'r') as f:
                    user_info = json.load(f)
                
                # Load all embeddings for this user
                for file_name in os.listdir(user_path):
                    if file_name.startswith('embedding_') and file_name.endswith('.npy'):
                        sample_num = file_name.replace('embedding_', '').replace('.npy', '')
                        
                        # Load embedding
                        embedding_path = os.path.join(user_path, file_name)
                        embedding = np.load(embedding_path)
                        
                        # Load metadata
                        metadata_file = os.path.join(user_path, f'sample_{sample_num}.json')
                        metadata = {}
                        if os.path.exists(metadata_file):
                            with open(metadata_file, 'r') as f:
                                metadata = json.load(f)
                        
                        # Create embedding record
                        embedding_record = {
                            'id': f"{user_info['user_id']}_{sample_num}",
                            'embedding': embedding,
                            'quality_score': metadata.get('quality_score', 1.0),
                            'users': {
                                'user_id': user_info['user_id'],
                                'name': user_info['name']
                            }
                        }
                        
                        embeddings.append(embedding_record)
                        
            except Exception as e:
                logging.error(f"Failed to load embeddings for user {user_dir}: {e}")
        
        return embeddings
    
    def recognize_face(self, frame: np.ndarray, return_details: bool = False) -> Tuple[Optional[str], float, Optional[Dict]]:
        """
        Recognize face in the given frame
        
        Args:
            frame: Input frame containing face
            return_details: Whether to return detailed matching information
            
        Returns:
            Tuple of (user_name, confidence, details)
            - user_name: Name of recognized user or None
            - confidence: Similarity score (0.0 to 1.0)
            - details: Additional information if return_details=True
        """
        self.recognition_stats['total_attempts'] += 1
        
        # Process face for recognition
        success, message, aligned_face, processing_info = self.detector.process_face_for_recognition(frame)
        
        if not success:
            return None, 0.0, {'error': message} if return_details else None
        
        # Extract embedding
        try:
            query_embedding = self.recognizer.extract_embedding(aligned_face)
            
            if not self.recognizer.validate_embedding(query_embedding):
                return None, 0.0, {'error': 'Invalid embedding generated'} if return_details else None
        
        except Exception as e:
            logging.error(f"Embedding extraction failed: {e}")
            return None, 0.0, {'error': f'Embedding extraction failed: {e}'} if return_details else None
        
        # Load registered embeddings
        registered_embeddings = self.load_registered_embeddings()
        
        if not registered_embeddings:
            return None, 0.0, {'error': 'No registered users found', 'top_matches': []} if return_details else None
        
        # Find best match
        best_match = None
        best_similarity = 0.0
        best_user_name = None
        similarities = []
        
        for record in registered_embeddings:
            stored_embedding = record['embedding']
            user_info = record['users']
            
            # Calculate similarity
            similarity = self.recognizer.compare_embeddings(query_embedding, stored_embedding)
            
            similarities.append({
                'user_id': user_info['user_id'],
                'user_name': user_info['name'],
                'similarity': similarity,
                'quality_score': record.get('quality_score', 1.0)
            })
            
            # Track best match
            if similarity > best_similarity:
                best_similarity = similarity
                best_user_name = user_info['name']
                best_match = record
        
        # Sort similarities by score (highest first)
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Check if best match meets threshold
        if best_similarity >= self.threshold:
            self.recognition_stats['successful_matches'] += 1
            result_name = best_user_name
        else:
            self.recognition_stats['failed_matches'] += 1
            result_name = None
            best_similarity = 0.0
        
        # Update average confidence
        total_matches = self.recognition_stats['successful_matches'] + self.recognition_stats['failed_matches']
        if total_matches > 0:
            self.recognition_stats['avg_confidence'] = (
                (self.recognition_stats['avg_confidence'] * (total_matches - 1) + best_similarity) / total_matches
            )
        
        # Prepare details if requested
        details = None
        if return_details:
            details = {
                'threshold': self.threshold,
                'best_similarity': best_similarity,
                'processing_info': processing_info,
                'top_matches': similarities[:5],  # Top 5 matches
                'total_registered_users': len(set(s['user_id'] for s in similarities)),
                'recognition_quality': processing_info['quality'] if processing_info else None
            }
        
        return result_name, best_similarity, details
    
    def start_realtime_recognition(self):
        """Start real-time face recognition from camera"""
        
        if not self.camera.start_camera():
            print("ERROR: Could not start camera")
            return
        
        print("=== Real-time Face Recognition ===")
        print("Controls:")
        print("- 'q': Quit")
        print("- 'r': Reload registered users")
        print("- 'i': Show detailed info")
        print("- 't': Adjust threshold")
        print("- 's': Show statistics")
        print(f"\nCurrent threshold: {self.threshold}")
        
        # Load embeddings initially
        registered_embeddings = self.load_registered_embeddings(force_refresh=True)
        print(f"Loaded {len(registered_embeddings)} embeddings from {len(set(e['users']['user_id'] for e in registered_embeddings))} users")
        
        show_details = False
        last_recognition_time = 0
        recognition_interval = 0.5  # Recognize every 0.5 seconds
        
        try:
            while True:
                frame = self.camera.read_frame()
                if frame is None:
                    continue
                
                current_time = time.time()
                display_frame = frame.copy()
                
                # Perform recognition at intervals
                if current_time - last_recognition_time >= recognition_interval:
                    user_name, confidence, details = self.recognize_face(frame, return_details=show_details)
                    last_recognition_time = current_time
                else:
                    # Just detect faces for display
                    face_boxes, confidences, landmarks, quality_assessments = self.detector.detect_faces_with_quality(frame)
                    user_name, confidence, details = None, 0.0, None
                    
                    # Draw face detection
                    if face_boxes:
                        display_frame = self.detector.draw_detections_with_quality(
                            display_frame, face_boxes, confidences, landmarks, quality_assessments
                        )
                
                # Display recognition result
                if user_name:
                    # Recognized user
                    result_text = f"RECOGNIZED: {user_name}"
                    confidence_text = f"Confidence: {confidence:.3f}"
                    color = (0, 255, 0)  # Green
                    self._draw_recognition_result(display_frame, result_text, confidence_text, color)
                    
                elif confidence > 0:
                    # Unknown face (below threshold)
                    result_text = "UNKNOWN FACE"
                    confidence_text = f"Max similarity: {confidence:.3f} (threshold: {self.threshold:.3f})"
                    color = (0, 165, 255)  # Orange
                    self._draw_recognition_result(display_frame, result_text, confidence_text, color)
                
                # Show detailed info if enabled
                if show_details and details:
                    self._draw_detailed_info(display_frame, details)
                
                # Show statistics
                stats = self.recognition_stats
                stats_text = f"Attempts: {stats['total_attempts']} | Matches: {stats['successful_matches']} | Avg: {stats['avg_confidence']:.3f}"
                cv2.putText(display_frame, stats_text, (10, display_frame.shape[0] - 10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                
                cv2.imshow('Face Recognition', display_frame)
                
                # Handle key input
                key = cv2.waitKey(1) & 0xFF
                
                if key == ord('q'):
                    break
                elif key == ord('r'):
                    print("Reloading registered users...")
                    registered_embeddings = self.load_registered_embeddings(force_refresh=True)
                    print(f"Reloaded {len(registered_embeddings)} embeddings")
                elif key == ord('i'):
                    show_details = not show_details
                    print(f"Detailed info: {'ON' if show_details else 'OFF'}")
                elif key == ord('t'):
                    self._adjust_threshold()
                elif key == ord('s'):
                    self._show_statistics()
        
        finally:
            self.camera.release()
            cv2.destroyAllWindows()
    
    def _draw_recognition_result(self, frame: np.ndarray, result_text: str, confidence_text: str, color: tuple):
        """Draw recognition result on frame"""
        # Main result
        cv2.putText(frame, result_text, (10, 40), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1.2, color, 3)
        
        # Confidence
        cv2.putText(frame, confidence_text, (10, 80), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    
    def _draw_detailed_info(self, frame: np.ndarray, details: Dict):
        """Draw detailed recognition information"""
        y_offset = 120
        line_height = 25
        
        # Top matches
        cv2.putText(frame, "Top Matches:", (10, y_offset), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        y_offset += line_height
        
        for i, match in enumerate(details['top_matches'][:3]):
            match_text = f"{i+1}. {match['user_name']}: {match['similarity']:.3f}"
            cv2.putText(frame, match_text, (20, y_offset), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            y_offset += line_height
    
    def _adjust_threshold(self):
        """Interactive threshold adjustment"""
        print(f"\nCurrent threshold: {self.threshold}")
        print("Enter new threshold (0.0-1.0) or press Enter to keep current:")
        
        try:
            user_input = input().strip()
            if user_input:
                new_threshold = float(user_input)
                if 0.0 <= new_threshold <= 1.0:
                    self.threshold = new_threshold
                    print(f"Threshold updated to: {self.threshold}")
                else:
                    print("Threshold must be between 0.0 and 1.0")
        except ValueError:
            print("Invalid threshold value")
    
    def _show_statistics(self):
        """Show detailed recognition statistics"""
        stats = self.recognition_stats
        print(f"\n=== Recognition Statistics ===")
        print(f"Total Attempts: {stats['total_attempts']}")
        print(f"Successful Matches: {stats['successful_matches']}")
        print(f"Failed Matches: {stats['failed_matches']}")
        print(f"Success Rate: {stats['successful_matches']/max(stats['total_attempts'], 1)*100:.1f}%")
        print(f"Average Confidence: {stats['avg_confidence']:.3f}")
        print(f"Current Threshold: {self.threshold}")
        
        if self.embeddings_cache:
            unique_users = len(set(e['users']['user_id'] for e in self.embeddings_cache))
            print(f"Registered Users: {unique_users}")
            print(f"Total Embeddings: {len(self.embeddings_cache)}")
    
    def batch_recognize_images(self, image_paths: List[str]) -> List[Dict]:
        """
        Recognize faces in a batch of images
        
        Args:
            image_paths: List of paths to image files
            
        Returns:
            List of recognition results
        """
        results = []
        
        for image_path in image_paths:
            try:
                # Load image
                frame = cv2.imread(image_path)
                if frame is None:
                    results.append({
                        'image_path': image_path,
                        'error': 'Could not load image'
                    })
                    continue
                
                # Recognize
                user_name, confidence, details = self.recognize_face(frame, return_details=True)
                
                results.append({
                    'image_path': image_path,
                    'recognized_user': user_name,
                    'confidence': confidence,
                    'details': details
                })
                
            except Exception as e:
                results.append({
                    'image_path': image_path,
                    'error': str(e)
                })
        
        return results


def main():
    """Test face recognition system"""
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
        # Initialize recognition system
        print("Initializing face recognition system...")
        
        # Get threshold from environment or use default
        threshold = float(os.getenv('FACE_MATCH_THRESHOLD', 0.5))
        
        recognition = FaceRecognition(
            yunet_model_path=yunet_model,
            sface_model_path=sface_model,
            recognition_threshold=threshold,
            use_database=True
        )
        
        # Interactive menu
        while True:
            print("\n=== Face Recognition System ===")
            print("1. Start real-time recognition")
            print("2. Test single image")
            print("3. Batch test images")
            print("4. Show statistics")
            print("5. Adjust threshold")
            print("6. Exit")
            
            choice = input("\nEnter choice (1-6): ").strip()
            
            if choice == '1':
                recognition.start_realtime_recognition()
            
            elif choice == '2':
                image_path = input("Enter image path: ").strip()
                if os.path.exists(image_path):
                    frame = cv2.imread(image_path)
                    if frame is not None:
                        user_name, confidence, details = recognition.recognize_face(frame, return_details=True)
                        
                        print(f"\nRecognition Result:")
                        if user_name:
                            print(f"✓ Recognized: {user_name}")
                            print(f"  Confidence: {confidence:.3f}")
                        else:
                            print(f"✗ Unknown face")
                            print(f"  Max similarity: {confidence:.3f}")
                            print(f"  Threshold: {recognition.threshold}")
                        
                        if details and 'top_matches' in details:
                            print(f"\nTop matches:")
                            for i, match in enumerate(details['top_matches'][:5]):
                                print(f"  {i+1}. {match['user_name']}: {match['similarity']:.3f}")
                    else:
                        print("Could not load image")
                else:
                    print("Image file not found")
            
            elif choice == '3':
                folder_path = input("Enter folder path containing images: ").strip()
                if os.path.exists(folder_path):
                    image_files = [f for f in os.listdir(folder_path) 
                                 if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))]
                    
                    if image_files:
                        image_paths = [os.path.join(folder_path, f) for f in image_files[:10]]  # Limit to 10
                        results = recognition.batch_recognize_images(image_paths)
                        
                        print(f"\nBatch Recognition Results ({len(results)} images):")
                        for result in results:
                            filename = os.path.basename(result['image_path'])
                            if 'error' in result:
                                print(f"✗ {filename}: {result['error']}")
                            elif result['recognized_user']:
                                print(f"✓ {filename}: {result['recognized_user']} ({result['confidence']:.3f})")
                            else:
                                print(f"? {filename}: Unknown ({result['confidence']:.3f})")
                    else:
                        print("No image files found in folder")
                else:
                    print("Folder not found")
            
            elif choice == '4':
                recognition._show_statistics()
            
            elif choice == '5':
                recognition._adjust_threshold()
            
            elif choice == '6':
                print("Exiting...")
                break
            
            else:
                print("Invalid choice")
                
    except Exception as e:
        logging.error(f"Recognition system error: {e}")
        print(f"Error: {e}")


if __name__ == "__main__":
    main()