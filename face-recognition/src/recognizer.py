"""
Face Recognition using OpenCV SFace
Extracts face embeddings for comparison
"""
import cv2
import numpy as np
import os
import logging
from typing import Optional, Tuple

class FaceRecognizer:
    """SFace face recognition for embedding extraction"""
    
    def __init__(self, model_path: str):
        """
        Initialize SFace face recognizer
        
        Args:
            model_path: Path to SFace ONNX model
        """
        self.model_path = model_path
        self.recognizer = None
        self.embedding_size = 128  # SFace produces 128-dimensional embeddings
        
        # Initialize recognizer
        self._load_model()
        
    def _load_model(self):
        """Load the SFace model"""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"SFace model not found at {self.model_path}")
            
        try:
            # Create FaceRecognizerSF instance
            self.recognizer = cv2.FaceRecognizerSF.create(
                model=self.model_path,
                config=""
            )
            logging.info(f"SFace model loaded successfully from {self.model_path}")
            
        except Exception as e:
            logging.error(f"Failed to load SFace model: {e}")
            raise
    
    def extract_embedding(self, aligned_face: np.ndarray) -> np.ndarray:
        """
        Extract face embedding from aligned face image
        
        Args:
            aligned_face: Aligned face image (should be 112x112)
            
        Returns:
            128-dimensional face embedding
        """
        if self.recognizer is None:
            raise RuntimeError("Recognizer not initialized")
        
        # Validate input size
        if aligned_face.shape[:2] != (112, 112):
            # Resize if necessary
            aligned_face = cv2.resize(aligned_face, (112, 112))
            logging.warning(f"Resized face to 112x112 for SFace processing")
        
        # Extract embedding using SFace
        embedding = self.recognizer.feature(aligned_face)
        
        # Normalize embedding (L2 normalization)
        embedding = self._normalize_embedding(embedding)
        
        return embedding
    
    def _normalize_embedding(self, embedding: np.ndarray) -> np.ndarray:
        """
        Normalize embedding using L2 normalization
        
        Args:
            embedding: Raw embedding vector
            
        Returns:
            Normalized embedding
        """
        # L2 normalization
        norm = np.linalg.norm(embedding)
        if norm == 0:
            logging.warning("Zero norm embedding detected")
            return embedding
        
        normalized = embedding / norm
        return normalized
    
    def compare_embeddings(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Compare two face embeddings using cosine similarity
        
        Args:
            embedding1: First face embedding
            embedding2: Second face embedding
            
        Returns:
            Cosine similarity score (0.0 to 1.0, higher = more similar)
        """
        # Ensure embeddings are normalized
        emb1_norm = self._normalize_embedding(embedding1.flatten())
        emb2_norm = self._normalize_embedding(embedding2.flatten())
        
        # Calculate cosine similarity
        similarity = np.dot(emb1_norm, emb2_norm)
        
        # Ensure result is in [0, 1] range
        similarity = np.clip(similarity, 0.0, 1.0)
        
        return float(similarity)
    
    def verify_match(self, embedding1: np.ndarray, embedding2: np.ndarray, 
                    threshold: float = 0.5) -> Tuple[bool, float]:
        """
        Verify if two embeddings represent the same person
        
        Args:
            embedding1: First face embedding
            embedding2: Second face embedding
            threshold: Similarity threshold for match decision
            
        Returns:
            Tuple of (is_match, similarity_score)
        """
        similarity = self.compare_embeddings(embedding1, embedding2)
        is_match = similarity >= threshold
        
        return is_match, similarity
    
    def find_best_match(self, query_embedding: np.ndarray, 
                       stored_embeddings: list, threshold: float = 0.5) -> Tuple[Optional[int], float]:
        """
        Find the best matching embedding from a list
        
        Args:
            query_embedding: Query face embedding
            stored_embeddings: List of stored embeddings to compare against
            threshold: Minimum similarity threshold for a valid match
            
        Returns:
            Tuple of (best_match_index, similarity_score) or (None, 0.0) if no match
        """
        if not stored_embeddings:
            return None, 0.0
        
        best_similarity = 0.0
        best_index = None
        
        for i, stored_embedding in enumerate(stored_embeddings):
            similarity = self.compare_embeddings(query_embedding, stored_embedding)
            
            if similarity > best_similarity and similarity >= threshold:
                best_similarity = similarity
                best_index = i
        
        return best_index, best_similarity
    
    def validate_embedding(self, embedding: np.ndarray) -> bool:
        """
        Validate embedding format and content
        
        Args:
            embedding: Face embedding to validate
            
        Returns:
            True if embedding is valid
        """
        if not isinstance(embedding, np.ndarray):
            return False
        
        # Check dimensions
        if embedding.size != self.embedding_size:
            logging.error(f"Invalid embedding size: {embedding.size} (expected {self.embedding_size})")
            return False
        
        # Check for NaN or infinite values
        if not np.isfinite(embedding).all():
            logging.error("Embedding contains NaN or infinite values")
            return False
        
        # Check if embedding is all zeros (usually indicates failure)
        if np.allclose(embedding, 0.0):
            logging.warning("Embedding is all zeros")
            return False
        
        return True


class EmbeddingDatabase:
    """Simple in-memory embedding database for testing"""
    
    def __init__(self):
        self.embeddings = []
        self.labels = []
        self.metadata = []
    
    def add_embedding(self, embedding: np.ndarray, label: str, metadata: dict = None):
        """Add embedding to database"""
        self.embeddings.append(embedding.copy())
        self.labels.append(label)
        self.metadata.append(metadata or {})
        logging.info(f"Added embedding for '{label}' (total: {len(self.embeddings)})")
    
    def search(self, query_embedding: np.ndarray, recognizer: FaceRecognizer, 
              threshold: float = 0.5) -> Tuple[Optional[str], float, Optional[dict]]:
        """Search for best match in database"""
        if not self.embeddings:
            return None, 0.0, None
        
        best_index, similarity = recognizer.find_best_match(
            query_embedding, self.embeddings, threshold
        )
        
        if best_index is not None:
            return self.labels[best_index], similarity, self.metadata[best_index]
        
        return None, similarity, None
    
    def get_stats(self) -> dict:
        """Get database statistics"""
        return {
            'total_embeddings': len(self.embeddings),
            'unique_labels': len(set(self.labels)),
            'labels': list(set(self.labels))
        }


def main():
    """Test face recognition"""
    logging.basicConfig(level=logging.INFO)
    
    # Model path - you need to download this manually
    model_path = "../models/face_recognition_sface_2021dec.onnx"
    
    if not os.path.exists(model_path):
        print("ERROR: SFace model not found!")
        print("Please download the SFace model:")
        print("1. Go to: https://github.com/opencv/opencv_zoo/tree/master/models/face_recognition_sface")
        print("2. Download: face_recognition_sface_2021dec.onnx")
        print(f"3. Place it at: {model_path}")
        return
    
    try:
        # Initialize recognizer
        recognizer = FaceRecognizer(model_path)
        
        print("SFace Recognition Test")
        print("This module extracts 128-dimensional embeddings from aligned faces")
        print(f"Expected input size: 112x112 pixels")
        print(f"Output: {recognizer.embedding_size}-dimensional embedding")
        
        # Test with a dummy aligned face (would come from face alignment)
        dummy_face = np.random.randint(0, 255, (112, 112, 3), dtype=np.uint8)
        
        print("\nTesting embedding extraction...")
        try:
            embedding = recognizer.extract_embedding(dummy_face)
            print(f"✓ Embedding extracted successfully")
            print(f"  Shape: {embedding.shape}")
            print(f"  Type: {embedding.dtype}")
            print(f"  Range: [{embedding.min():.4f}, {embedding.max():.4f}]")
            print(f"  Norm: {np.linalg.norm(embedding):.4f}")
            
            # Test validation
            is_valid = recognizer.validate_embedding(embedding)
            print(f"  Valid: {is_valid}")
            
            # Test comparison with itself (should be 1.0)
            similarity = recognizer.compare_embeddings(embedding, embedding)
            print(f"  Self-similarity: {similarity:.4f}")
            
        except Exception as e:
            print(f"✗ Embedding extraction failed: {e}")
        
        # Test embedding database
        print("\nTesting embedding database...")
        db = EmbeddingDatabase()
        
        # Add some test embeddings
        for i in range(3):
            test_embedding = np.random.randn(128).astype(np.float32)
            test_embedding = recognizer._normalize_embedding(test_embedding)
            db.add_embedding(test_embedding, f"Person_{i+1}")
        
        stats = db.get_stats()
        print(f"Database stats: {stats}")
        
        # Test search
        query = np.random.randn(128).astype(np.float32)
        query = recognizer._normalize_embedding(query)
        
        result_label, similarity, metadata = db.search(query, recognizer, threshold=0.3)
        print(f"Search result: {result_label}, similarity: {similarity:.4f}")
        
        print("\n✓ SFace recognition module test completed successfully")
        print("\nNext steps:")
        print("1. Integrate with detector.py for full pipeline")
        print("2. Test with real aligned faces")
        print("3. Implement database storage")
        
    except Exception as e:
        logging.error(f"Error in main: {e}")


if __name__ == "__main__":
    main()