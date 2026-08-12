#!/usr/bin/env python3
"""
Download ONNX models during Render deployment
This script downloads YuNet and SFace models from OpenCV's GitHub repository
"""
import os
import urllib.request
import sys

# Model URLs from OpenCV Zoo
MODELS = {
    'face_detection_yunet_2023mar.onnx': 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
    'face_recognition_sface_2021dec.onnx': 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx'
}

def download_file(url, destination):
    """Download file from URL to destination"""
    print(f"Downloading {os.path.basename(destination)}...")
    try:
        urllib.request.urlretrieve(url, destination)
        file_size = os.path.getsize(destination) / (1024 * 1024)  # Size in MB
        print(f"✓ Downloaded {os.path.basename(destination)} ({file_size:.2f} MB)")
        return True
    except Exception as e:
        print(f"✗ Failed to download {os.path.basename(destination)}: {e}")
        return False

def main():
    """Download all required models"""
    print("=" * 60)
    print("DOWNLOADING FACE RECOGNITION MODELS")
    print("=" * 60)
    
    # Get base directory (face-recognition-api)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Models directory path - create it relative to face-recognition-api for deployment
    # Check if we're in deployment (face-recognition folder might not exist)
    models_dir = os.path.join(base_dir, 'models')
    
    # Create models directory if it doesn't exist
    os.makedirs(models_dir, exist_ok=True)
    print(f"\nModels directory: {models_dir}")
    
    # Download each model
    success_count = 0
    for filename, url in MODELS.items():
        destination = os.path.join(models_dir, filename)
        
        # Skip if already exists
        if os.path.exists(destination):
            file_size = os.path.getsize(destination) / (1024 * 1024)
            print(f"✓ {filename} already exists ({file_size:.2f} MB)")
            success_count += 1
            continue
        
        # Download
        if download_file(url, destination):
            success_count += 1
    
    print("\n" + "=" * 60)
    print(f"DOWNLOAD COMPLETE: {success_count}/{len(MODELS)} models ready")
    print("=" * 60)
    
    if success_count == len(MODELS):
        print("✓ All models downloaded successfully")
        return 0
    else:
        print("✗ Some models failed to download")
        return 1

if __name__ == '__main__':
    sys.exit(main())
