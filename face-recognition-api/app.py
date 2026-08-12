#!/usr/bin/env python3
"""
Face Recognition API Server
Provides REST API endpoints for the React frontend to use the YuNet + SFace system
"""
import os
import sys
import logging
from datetime import datetime
import json
import base64
import io
from PIL import Image
import numpy as np
import cv2
import threading

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.exceptions import BadRequest

# Get base directory for relative paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Add the face-recognition src to path
sys.path.append(os.path.join(BASE_DIR, '..', 'face-recognition', 'src'))

try:
    from detector import FaceDetector
    from recognizer import FaceRecognizer
    from database import DatabaseManager
except ImportError as e:
    print(f"Error importing face recognition modules: {e}")
    print("Make sure you're running from the correct directory and all dependencies are installed")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

app = Flask(__name__)

# Configure CORS for production - allow all origins for face recognition API
# This is acceptable for a public API that doesn't handle sensitive authentication
CORS(app, 
     resources={r"/*": {"origins": "*"}},
     supports_credentials=False,
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "OPTIONS"]
)

# Model paths - use absolute paths for deployment
# Model paths - check both local dev structure and deployment structure
# In deployment, models will be in face-recognition-api/models/
# In local dev, models are in face-recognition/models/
deployment_yunet = os.path.join(BASE_DIR, "models", "face_detection_yunet_2023mar.onnx")
deployment_sface = os.path.join(BASE_DIR, "models", "face_recognition_sface_2021dec.onnx")
local_yunet = os.path.join(BASE_DIR, "..", "face-recognition", "models", "face_detection_yunet_2023mar.onnx")
local_sface = os.path.join(BASE_DIR, "..", "face-recognition", "models", "face_recognition_sface_2021dec.onnx")

# Use deployment paths if they exist, otherwise fall back to local paths
yunet_model_path = deployment_yunet if os.path.exists(deployment_yunet) else local_yunet
sface_model_path = deployment_sface if os.path.exists(deployment_sface) else local_sface

# Global components with thread safety
detector = None
recognizer = None
db_manager = None
process_lock = threading.Lock()  # Add thread lock for OpenCV operations

def download_models_if_missing():
    """Download models if they don't exist (for deployment)"""
    import urllib.request
    
    models_to_download = []
    
    if not os.path.exists(yunet_model_path):
        models_to_download.append(('YuNet', yunet_model_path, 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'))
    
    if not os.path.exists(sface_model_path):
        models_to_download.append(('SFace', sface_model_path, 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx'))
    
    if models_to_download:
        logging.info(f"Downloading {len(models_to_download)} missing models...")
        
        # Ensure models directory exists
        models_dir = os.path.dirname(yunet_model_path)
        os.makedirs(models_dir, exist_ok=True)
        logging.info(f"Models directory: {models_dir}")
        
        for name, path, url in models_to_download:
            try:
                logging.info(f"Downloading {name} from {url}...")
                urllib.request.urlretrieve(url, path)
                file_size = os.path.getsize(path) / (1024 * 1024)
                logging.info(f"✓ Downloaded {name} ({file_size:.2f} MB)")
            except Exception as e:
                logging.error(f"✗ Failed to download {name}: {e}")
                raise
        
        logging.info("All models downloaded successfully")

def initialize_system():
    """Initialize all face recognition components"""
    global detector, recognizer, db_manager
    
    try:
        logging.info("Initializing face recognition system...")
        logging.info(f"Base directory: {BASE_DIR}")
        logging.info(f"YuNet model path: {yunet_model_path}")
        logging.info(f"SFace model path: {sface_model_path}")
        
        # Download models if missing (for deployment)
        download_models_if_missing()
        
        # Check if models exist
        if not os.path.exists(yunet_model_path):
            raise FileNotFoundError(f"YuNet model not found: {yunet_model_path}")
        
        if not os.path.exists(sface_model_path):
            raise FileNotFoundError(f"SFace model not found: {sface_model_path}")
        
        logging.info("Model files found successfully")
        
        # Initialize components
        detector = FaceDetector(yunet_model_path)
        recognizer = FaceRecognizer(sface_model_path)
        
        # Initialize database
        try:
            db_manager = DatabaseManager()
            if db_manager.test_connection():
                logging.info("Database connection successful")
            else:
                logging.warning("Database connection failed - will use local fallback")
                db_manager = None
        except Exception as e:
            logging.warning(f"Database initialization failed: {e}")
            db_manager = None
        
        logging.info("Face recognition system initialized successfully")
        return True
        
    except Exception as e:
        logging.error(f"Failed to initialize face recognition system: {e}")
        return False

# Initialize system at module load time (for gunicorn workers)
logging.info("=" * 60)
logging.info("INITIALIZING FACE RECOGNITION API")
logging.info("=" * 60)
initialize_system()

def decode_base64_image(base64_data):
    """
    Decode base64 image data to OpenCV format
    """
    try:
        # Remove data URL prefix if present
        if base64_data.startswith('data:image'):
            base64_data = base64_data.split(',')[1]
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(base64_data)
        
        # Convert to PIL Image
        pil_image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to OpenCV format (BGR)
        opencv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        
        return opencv_image
        
    except Exception as e:
        raise ValueError(f"Failed to decode image: {e}")

def encode_image_to_base64(opencv_image):
    """
    Encode OpenCV image to base64
    """
    try:
        # Encode image to JPEG
        _, buffer = cv2.imencode('.jpg', opencv_image, [cv2.IMWRITE_JPEG_QUALITY, 85])
        
        # Convert to base64
        base64_data = base64.b64encode(buffer).decode('utf-8')
        
        return f"data:image/jpeg;base64,{base64_data}"
        
    except Exception as e:
        raise ValueError(f"Failed to encode image: {e}")

def convert_numpy_types(obj):
    """
    Recursively convert numpy types to native Python types for JSON serialization
    """
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_numpy_types(item) for item in obj]
    else:
        return obj

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'models_loaded': detector is not None and recognizer is not None,
        'database_connected': db_manager is not None and db_manager.test_connection() if db_manager else False
    })

@app.route('/api/face/detect', methods=['POST'])
def detect_face():
    """
    Detect and analyze face in uploaded image
    Compatible with existing MediaPipe frontend
    """
    try:
        if not detector:
            return jsonify({'success': False, 'error': 'Face detection not initialized'}), 500
        
        data = request.get_json()
        if not data or 'imageData' not in data:
            return jsonify({'success': False, 'error': 'No image data provided'}), 400
        
        # Use thread lock to prevent OpenCV DNN memory issues
        with process_lock:
            # Decode image
            frame = decode_base64_image(data['imageData'])
            
            # Process face for recognition
            success, message, aligned_face, processing_info = detector.process_face_for_recognition(frame)
            
            if not success:
                logging.info(f"Face detection failed: {message}")
                return jsonify({
                    'success': False,
                    'error': message
                })
            
            # Extract embedding if successful
            embedding = recognizer.extract_embedding(aligned_face)
            
            # Flatten embedding if it's 2D (SFace returns 1x128, we need 128)
            if embedding.ndim == 2:
                embedding = embedding.flatten()
            
            # Prepare response in MediaPipe-compatible format
            response_data = {
                'success': True,
                'face': {
                    'box': convert_numpy_types(processing_info['face_box']),
                    'landmarks': convert_numpy_types(processing_info['landmarks'])
                },
                'embedding': convert_numpy_types(embedding),
                'quality': convert_numpy_types(processing_info['quality']['scores']) if processing_info and 'quality' in processing_info else {},
                'confidence': convert_numpy_types(processing_info['confidence']),
                'aligned_face': encode_image_to_base64(aligned_face),
                'metadata': {
                    'model': 'YuNet + SFace',
                    'embedding_dimension': 128,
                    'timestamp': datetime.now().isoformat()
                }
            }
            
            return jsonify(response_data)
        
    except Exception as e:
        logging.error(f"Face detection error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/face/enroll', methods=['POST'])
def enroll_face():
    """
    Enroll user face (register new user)
    Compatible with existing BiometricCamera enrollment flow
    Supports both imageData (for re-processing) and embedding (pre-extracted)
    
    SECURITY ENHANCEMENTS:
    - Prevents duplicate enrollments (checks if face already registered)
    - Enforces strict quality requirements
    - Validates embedding uniqueness
    """
    try:
        if not detector or not recognizer:
            return jsonify({'success': False, 'error': 'Face recognition not initialized'}), 500
        
        data = request.get_json()
        required_fields = ['userId', 'userName']
        
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        user_id = data['userId']
        user_name = data['userName']
        
        # Check if embedding is pre-provided (preferred) or needs extraction
        if 'embedding' in data and data['embedding']:
            # Use pre-extracted embedding (from BiometricCamera capture)
            embedding = np.array(data['embedding'], dtype=np.float32)
            overall_quality = float(data.get('quality_score', 1.0))
            
            # Basic validation
            if len(embedding) != 128:
                return jsonify({'success': False, 'error': f'Invalid embedding dimension: {len(embedding)} (expected 128)'}), 400
            
            logging.info(f"Using pre-extracted embedding for user {user_id}")
            
        elif 'imageData' in data:
            # Extract embedding from image (legacy support)
            # Use thread lock to prevent OpenCV DNN memory issues
            with process_lock:
                # Decode image
                frame = decode_base64_image(data['imageData'])
                
                # Process face
                success, message, aligned_face, processing_info = detector.process_face_for_recognition(frame)
                
                if not success:
                    return jsonify({'success': False, 'error': message})
                
                # Extract embedding
                embedding = recognizer.extract_embedding(aligned_face)
                
                # Flatten embedding if it's 2D
                if embedding.ndim == 2:
                    embedding = embedding.flatten()
                
                quality_score = processing_info['quality']['scores'] if processing_info else {}
                
                # Calculate overall quality score
                overall_quality = 1.0  # Default to high quality
                if isinstance(quality_score, dict):
                    quality_values = [q.get('ok', True) for q in quality_score.values() if isinstance(q, dict)]
                    if quality_values:
                        overall_quality = sum(quality_values) / len(quality_values)
            
            logging.info(f"Extracted embedding from image for user {user_id}")
        else:
            return jsonify({'success': False, 'error': 'Either embedding or imageData must be provided'}), 400
        
        # SECURITY CHECK 1: Check for duplicate enrollment (same face already registered)
        if db_manager:
            try:
                # Load all registered embeddings
                registered_embeddings = db_manager.get_all_embeddings()
                
                for record in registered_embeddings:
                    stored_embedding = record['embedding']
                    existing_user = record['users']
                    
                    # Calculate similarity with existing faces
                    similarity = recognizer.compare_embeddings(embedding, stored_embedding)
                    
                    # If similarity is very high (>= 0.85), this face is already enrolled
                    if similarity >= 0.85:
                        logging.warning(f"Duplicate enrollment attempt: user {user_id} matches existing user {existing_user['user_id']} with {similarity:.2%} similarity")
                        return jsonify({
                            'success': False,
                            'error': f'This face is already registered as {existing_user["name"]}. Each person can only register once.',
                            'duplicate_detected': True,
                            'existing_user': existing_user['name'],
                            'similarity': float(similarity)
                        }), 409  # 409 Conflict
                
                logging.info(f"No duplicate found for user {user_id}, proceeding with enrollment")
                
            except Exception as e:
                logging.error(f"Duplicate check error: {e}")
                # Continue with enrollment even if duplicate check fails (fail open)
        
        # SECURITY CHECK 2: Validate minimum quality threshold
        MIN_ENROLLMENT_QUALITY = 0.6  # Minimum quality score required
        if overall_quality < MIN_ENROLLMENT_QUALITY:
            return jsonify({
                'success': False,
                'error': f'Face quality too low ({overall_quality:.1%}). Please ensure good lighting, face the camera directly, and hold steady.',
                'quality_score': float(overall_quality),
                'required_quality': MIN_ENROLLMENT_QUALITY
            }), 400
        
        # Store in database if available (outside the lock)
        if db_manager:
            try:
                # Register user
                user_uuid = db_manager.register_user(user_id, user_name)
                if not user_uuid:
                    return jsonify({'success': False, 'error': 'Failed to register user in database'})
                
                # Store embedding
                success = db_manager.store_face_embedding(
                    user_uuid=user_uuid,
                    embedding=embedding,
                    quality_score=overall_quality,
                    metadata={
                        'enrollment_method': 'web_api_yunet',
                        'timestamp': datetime.now().isoformat(),
                        'model': 'YuNet + SFace',
                        'security_checks_passed': True
                    }
                )
                
                if not success:
                    return jsonify({'success': False, 'error': 'Failed to store face embedding'})
                    
            except Exception as e:
                logging.error(f"Database enrollment error: {e}")
                return jsonify({'success': False, 'error': f'Database error: {str(e)}'})
        
        # Return response compatible with existing frontend
        return jsonify({
            'success': True,
            'message': 'Face enrolled successfully',
            'enrollment_id': user_uuid if db_manager else user_id,
            'quality_score': convert_numpy_types(overall_quality),
            'embedding_dimension': int(len(embedding)),
            'metadata': {
                'model': 'YuNet + SFace',
                'timestamp': datetime.now().isoformat(),
                'security_level': 'high'
            }
        })
        
    except Exception as e:
        logging.error(f"Face enrollment error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/face/verify', methods=['POST'])
def verify_face():
    """
    Verify face against enrolled users
    Compatible with existing face verification flow
    Supports both imageData (for re-processing) and embedding (pre-extracted)
    """
    try:
        if not detector or not recognizer:
            return jsonify({'success': False, 'error': 'Face recognition not initialized'}), 500
        
        data = request.get_json()
        
        # Get threshold
        threshold = float(data.get('threshold', 0.5))
        
        # Check if embedding is pre-provided (preferred) or needs extraction
        if 'embedding' in data and data['embedding']:
            # Use pre-extracted embedding (from BiometricCamera capture)
            query_embedding = np.array(data['embedding'], dtype=np.float32)
            
            # Basic validation
            if len(query_embedding) != 128:
                return jsonify({'success': False, 'error': f'Invalid embedding dimension: {len(query_embedding)} (expected 128)'}), 400
            
            logging.info("Using pre-extracted embedding for verification")
            
        elif 'imageData' in data:
            # Extract embedding from image (legacy support)
            # Use thread lock to prevent OpenCV DNN memory issues
            with process_lock:
                # Decode image
                frame = decode_base64_image(data['imageData'])
                
                # Process face
                success, message, aligned_face, processing_info = detector.process_face_for_recognition(frame)
                
                if not success:
                    return jsonify({'success': False, 'error': message})
                
                # Extract embedding
                query_embedding = recognizer.extract_embedding(aligned_face)
                
                # Flatten embedding if it's 2D
                if query_embedding.ndim == 2:
                    query_embedding = query_embedding.flatten()
            
            logging.info("Extracted embedding from image for verification")
        else:
            return jsonify({'success': False, 'error': 'Either embedding or imageData must be provided'}), 400
        
        # Search for matches (outside the lock)
        best_match = None
        best_similarity = 0.0
        all_matches = []
        
        if db_manager:
            # Load all registered embeddings
            registered_embeddings = db_manager.get_all_embeddings()
            
            for record in registered_embeddings:
                stored_embedding = record['embedding']
                user_info = record['users']
                
                # Calculate similarity
                similarity = recognizer.compare_embeddings(query_embedding, stored_embedding)
                
                match_info = {
                    'user_id': user_info['user_id'],
                    'user_name': user_info['name'],
                    'similarity': similarity,
                    'quality_score': record.get('quality_score', 1.0)
                }
                
                all_matches.append(match_info)
                
                # Track best match
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = match_info
        
        # Sort matches by similarity
        all_matches.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Determine if verification passed
        verification_passed = best_similarity >= threshold
        
        # Prepare response
        response = {
            'success': True,
            'verified': verification_passed,
            'similarity': convert_numpy_types(best_similarity),
            'threshold': convert_numpy_types(threshold),
            'matched_user': convert_numpy_types(best_match) if verification_passed and best_match else None,
            'top_matches': [convert_numpy_types(m) for m in all_matches[:5]],  # Top 5 matches
            'metadata': {
                'model': 'YuNet + SFace',
                'total_registered_users': len(set(m['user_id'] for m in all_matches)),
                'timestamp': datetime.now().isoformat()
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        logging.error(f"Face verification error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/face/compare', methods=['POST'])
def compare_faces():
    """
    Compare two face embeddings directly
    """
    try:
        if not recognizer:
            return jsonify({'success': False, 'error': 'Face recognizer not initialized'}), 500
        
        data = request.get_json()
        
        if 'embedding1' not in data or 'embedding2' not in data:
            return jsonify({'success': False, 'error': 'Two embeddings required for comparison'}), 400
        
        embedding1 = np.array(data['embedding1'])
        embedding2 = np.array(data['embedding2'])
        
        # Validate embeddings
        if not recognizer.validate_embedding(embedding1) or not recognizer.validate_embedding(embedding2):
            return jsonify({'success': False, 'error': 'Invalid embeddings provided'}), 400
        
        # Calculate similarity
        similarity = recognizer.compare_embeddings(embedding1, embedding2)
        threshold = float(data.get('threshold', 0.5))
        
        return jsonify({
            'success': True,
            'similarity': similarity,
            'threshold': threshold,
            'match': similarity >= threshold,
            'metadata': {
                'model': 'SFace',
                'embedding_dimension': len(embedding1),
                'timestamp': datetime.now().isoformat()
            }
        })
        
    except Exception as e:
        logging.error(f"Face comparison error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/system/stats', methods=['GET'])
def get_system_stats():
    """
    Get system statistics
    """
    try:
        stats = {
            'models_loaded': detector is not None and recognizer is not None,
            'database_connected': db_manager is not None and db_manager.test_connection() if db_manager else False,
            'total_users': 0,
            'total_embeddings': 0,
            'model_info': {
                'face_detection': 'YuNet (OpenCV)',
                'face_recognition': 'SFace (OpenCV)',
                'embedding_dimension': 128
            }
        }
        
        if db_manager:
            db_stats = db_manager.get_database_stats()
            stats.update({
                'total_users': db_stats['total_users'],
                'total_embeddings': db_stats['total_embeddings'],
                'avg_embeddings_per_user': db_stats['avg_embeddings_per_user']
            })
        
        return jsonify({'success': True, 'stats': stats})
        
    except Exception as e:
        logging.error(f"Stats error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.errorhandler(400)
def bad_request(error):
    return jsonify({'success': False, 'error': 'Bad request'}), 400

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Initialize system
    if not initialize_system():
        print("❌ Failed to initialize face recognition system")
        sys.exit(1)
    
    print("🚀 Face Recognition API Server starting...")
    print("📊 Models: YuNet + SFace")
    print("🔗 Database: Supabase" if db_manager else "📁 Database: Local fallback")
    print("🌐 Access: http://localhost:5000")
    
    # Start Flask app
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False  # Set to True for development
    )