#!/usr/bin/env python3
"""
Complete Face Recognition System
Main application combining registration and recognition
"""
import os
import logging
import sys
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Import our modules
from registration import FaceRegistration
from recognition import FaceRecognition
from database import DatabaseManager

class FaceRecognitionApp:
    """Main application class for face recognition system"""
    
    def __init__(self):
        """Initialize the application"""
        self.yunet_model_path = "../models/face_detection_yunet_2023mar.onnx"
        self.sface_model_path = "../models/face_recognition_sface_2021dec.onnx"
        
        # Check if models exist
        if not self._check_models():
            raise RuntimeError("Required models not found")
        
        # Initialize components
        self.registration = None
        self.recognition = None
        self.db_manager = None
        
        # Get configuration from environment
        self.threshold = float(os.getenv('FACE_MATCH_THRESHOLD', 0.5))
        self.use_database = True
        
        self._initialize_components()
    
    def _check_models(self) -> bool:
        """Check if required models exist"""
        models_ok = True
        
        if not os.path.exists(self.yunet_model_path):
            print(f"❌ YuNet model not found: {self.yunet_model_path}")
            print("Please download from: https://github.com/opencv/opencv_zoo/tree/master/models/face_detection_yunet")
            models_ok = False
        
        if not os.path.exists(self.sface_model_path):
            print(f"❌ SFace model not found: {self.sface_model_path}")
            print("Please download from: https://github.com/opencv/opencv_zoo/tree/master/models/face_recognition_sface")
            models_ok = False
        
        return models_ok
    
    def _initialize_components(self):
        """Initialize registration and recognition components"""
        try:
            print("🔧 Initializing face recognition system...")
            
            # Test database connection
            try:
                self.db_manager = DatabaseManager()
                if self.db_manager.test_connection():
                    print("✅ Database connection successful")
                    stats = self.db_manager.get_database_stats()
                    print(f"📊 Database: {stats['total_users']} users, {stats['total_embeddings']} embeddings")
                else:
                    print("⚠️  Database connection failed - using local storage")
                    self.use_database = False
            except Exception as e:
                print(f"⚠️  Database error: {e}")
                self.use_database = False
            
            # Initialize registration system
            self.registration = FaceRegistration(
                yunet_model_path=self.yunet_model_path,
                sface_model_path=self.sface_model_path,
                use_database=self.use_database
            )
            
            # Initialize recognition system  
            self.recognition = FaceRecognition(
                yunet_model_path=self.yunet_model_path,
                sface_model_path=self.sface_model_path,
                recognition_threshold=self.threshold,
                use_database=self.use_database
            )
            
            print("✅ System initialized successfully")
            print(f"🎯 Recognition threshold: {self.threshold}")
            
        except Exception as e:
            print(f"❌ Initialization failed: {e}")
            raise
    
    def show_main_menu(self):
        """Display main menu"""
        print("\n" + "="*50)
        print("🔐 DEEP LEARNING FACE RECOGNITION SYSTEM")
        print("="*50)
        print("1. 👤 Register New User")
        print("2. 🔍 Start Face Recognition")
        print("3. 📸 Test Single Image")
        print("4. 📊 View Statistics")
        print("5. ⚙️  Settings")
        print("6. 🗂️  Manage Users")
        print("7. ❓ Help & Info")
        print("8. 🚪 Exit")
        print("-" * 50)
    
    def register_user_interactive(self):
        """Interactive user registration"""
        print("\n🔹 USER REGISTRATION")
        print("=" * 30)
        
        # Get user details
        while True:
            user_id = input("Enter User ID (alphanumeric): ").strip()
            if user_id and user_id.replace('_', '').replace('-', '').isalnum():
                break
            print("❌ Invalid User ID. Use letters, numbers, underscore, or dash only.")
        
        while True:
            name = input("Enter Full Name: ").strip()
            if name and len(name) >= 2:
                break
            print("❌ Please enter a valid name (at least 2 characters).")
        
        # Start registration
        print(f"\n🎯 Starting registration for: {name} (ID: {user_id})")
        print("\n📷 CAMERA INSTRUCTIONS:")
        print("• Look directly at the camera")
        print("• Ensure good lighting")
        print("• Move slightly between samples (left, right, up, down)")
        print("• Press SPACE to capture each sample")
        print("• Press 'q' when you have enough samples (min 5)")
        print("• Press ESC to cancel")
        
        input("\nPress Enter to start camera...")
        
        success = self.registration.register_user(user_id, name)
        
        if success:
            print(f"✅ Registration successful for {name}!")
            print("🎉 User can now be recognized by the system")
        else:
            print(f"❌ Registration failed for {name}")
            print("💡 Try again with better lighting or camera position")
    
    def start_recognition_interactive(self):
        """Interactive face recognition"""
        print("\n🔹 FACE RECOGNITION")
        print("=" * 30)
        
        # Check if users are registered
        if self.use_database and self.db_manager:
            stats = self.db_manager.get_database_stats()
            if stats['total_users'] == 0:
                print("❌ No users registered yet!")
                print("💡 Register users first using option 1")
                return
            print(f"👥 {stats['total_users']} registered users in database")
        
        print("\n📷 REAL-TIME RECOGNITION CONTROLS:")
        print("• 'q' - Quit recognition")
        print("• 'r' - Reload registered users")
        print("• 'i' - Toggle detailed info display")
        print("• 't' - Adjust recognition threshold") 
        print("• 's' - Show statistics")
        print(f"\n🎯 Current threshold: {self.recognition.threshold}")
        
        input("Press Enter to start camera...")
        
        try:
            self.recognition.start_realtime_recognition()
        except KeyboardInterrupt:
            print("\n🛑 Recognition stopped by user")
        except Exception as e:
            print(f"❌ Recognition error: {e}")
    
    def test_single_image(self):
        """Test recognition on a single image"""
        print("\n🔹 SINGLE IMAGE TEST")
        print("=" * 30)
        
        image_path = input("Enter image file path: ").strip().strip('"')
        
        if not os.path.exists(image_path):
            print("❌ Image file not found!")
            return
        
        print(f"🔍 Analyzing image: {os.path.basename(image_path)}")
        
        try:
            import cv2
            frame = cv2.imread(image_path)
            if frame is None:
                print("❌ Could not load image (unsupported format?)")
                return
            
            user_name, confidence, details = self.recognition.recognize_face(frame, return_details=True)
            
            print(f"\n📊 RECOGNITION RESULTS:")
            print("-" * 30)
            
            if user_name:
                print(f"✅ RECOGNIZED: {user_name}")
                print(f"🎯 Confidence: {confidence:.3f}")
                print(f"🚦 Status: MATCH (above threshold {self.recognition.threshold})")
            else:
                print(f"❓ UNKNOWN PERSON")
                print(f"🎯 Max Similarity: {confidence:.3f}")
                print(f"🚦 Status: NO MATCH (below threshold {self.recognition.threshold})")
            
            if details and 'top_matches' in details:
                print(f"\n🏆 TOP MATCHES:")
                for i, match in enumerate(details['top_matches'][:5]):
                    status = "✅" if match['similarity'] >= self.recognition.threshold else "❌"
                    print(f"  {i+1}. {status} {match['user_name']}: {match['similarity']:.3f}")
            
            if details and 'processing_info' in details:
                quality = details['processing_info']['quality']
                print(f"\n📷 IMAGE QUALITY: {'GOOD' if quality['is_good'] else 'POOR'}")
                if not quality['is_good']:
                    print(f"   Issue: {quality['reason']}")
                    
        except Exception as e:
            print(f"❌ Error processing image: {e}")
    
    def show_statistics(self):
        """Display system statistics"""
        print("\n🔹 SYSTEM STATISTICS")
        print("=" * 30)
        
        # Database stats
        if self.use_database and self.db_manager:
            stats = self.db_manager.get_database_stats()
            print(f"👥 Registered Users: {stats['total_users']}")
            print(f"🧠 Face Embeddings: {stats['total_embeddings']}")
            print(f"📊 Avg Embeddings/User: {stats['avg_embeddings_per_user']:.1f}")
            print(f"🔌 Database Status: {'Connected' if stats['connection_status'] else 'Disconnected'}")
        else:
            print("📁 Using Local Storage")
        
        # Recognition stats
        if hasattr(self.recognition, 'recognition_stats'):
            rec_stats = self.recognition.recognition_stats
            print(f"\n🔍 RECOGNITION PERFORMANCE:")
            print(f"  Total Attempts: {rec_stats['total_attempts']}")
            print(f"  Successful Matches: {rec_stats['successful_matches']}")
            print(f"  Failed Matches: {rec_stats['failed_matches']}")
            if rec_stats['total_attempts'] > 0:
                success_rate = rec_stats['successful_matches'] / rec_stats['total_attempts'] * 100
                print(f"  Success Rate: {success_rate:.1f}%")
            print(f"  Average Confidence: {rec_stats['avg_confidence']:.3f}")
        
        # System info
        print(f"\n⚙️  SYSTEM CONFIGURATION:")
        print(f"  Recognition Threshold: {self.recognition.threshold}")
        print(f"  YuNet Model: {'✅ Loaded' if os.path.exists(self.yunet_model_path) else '❌ Missing'}")
        print(f"  SFace Model: {'✅ Loaded' if os.path.exists(self.sface_model_path) else '❌ Missing'}")
    
    def settings_menu(self):
        """Settings and configuration menu"""
        while True:
            print("\n🔹 SETTINGS & CONFIGURATION")
            print("=" * 30)
            print(f"Current Threshold: {self.recognition.threshold}")
            print("\n1. Adjust Recognition Threshold")
            print("2. Test Database Connection") 
            print("3. Reload System Components")
            print("4. View System Info")
            print("5. Back to Main Menu")
            
            choice = input("\nEnter choice (1-5): ").strip()
            
            if choice == '1':
                self._adjust_threshold()
            elif choice == '2':
                self._test_database()
            elif choice == '3':
                self._reload_system()
            elif choice == '4':
                self._show_system_info()
            elif choice == '5':
                break
            else:
                print("❌ Invalid choice")
    
    def _adjust_threshold(self):
        """Adjust recognition threshold"""
        print(f"\n🎯 Current threshold: {self.recognition.threshold}")
        print("💡 Lower = more lenient (may allow false matches)")
        print("💡 Higher = more strict (may reject valid matches)")
        print("💡 Recommended range: 0.4 - 0.7")
        
        try:
            new_threshold = float(input("Enter new threshold (0.0-1.0): ").strip())
            if 0.0 <= new_threshold <= 1.0:
                self.recognition.threshold = new_threshold
                print(f"✅ Threshold updated to {new_threshold}")
            else:
                print("❌ Threshold must be between 0.0 and 1.0")
        except ValueError:
            print("❌ Invalid number format")
    
    def _test_database(self):
        """Test database connection"""
        print("\n🔍 Testing database connection...")
        
        if not self.use_database:
            print("❌ Database not configured - using local storage")
            return
        
        try:
            if self.db_manager and self.db_manager.test_connection():
                print("✅ Database connection successful")
                stats = self.db_manager.get_database_stats()
                print(f"📊 Found {stats['total_users']} users, {stats['total_embeddings']} embeddings")
            else:
                print("❌ Database connection failed")
        except Exception as e:
            print(f"❌ Database error: {e}")
    
    def _reload_system(self):
        """Reload system components"""
        print("\n🔄 Reloading system components...")
        try:
            self._initialize_components()
            print("✅ System reloaded successfully")
        except Exception as e:
            print(f"❌ Reload failed: {e}")
    
    def _show_system_info(self):
        """Show detailed system information"""
        print("\n🔹 SYSTEM INFORMATION")
        print("=" * 30)
        
        print(f"📁 Working Directory: {os.getcwd()}")
        print(f"🐍 Python Version: {sys.version.split()[0]}")
        
        # Check dependencies
        try:
            import cv2
            print(f"👁️  OpenCV Version: {cv2.__version__}")
        except:
            print("❌ OpenCV not available")
        
        try:
            import numpy as np
            print(f"🔢 NumPy Version: {np.__version__}")
        except:
            print("❌ NumPy not available")
        
        print(f"\n🤖 MODEL FILES:")
        print(f"  YuNet: {'✅' if os.path.exists(self.yunet_model_path) else '❌'} {self.yunet_model_path}")
        print(f"  SFace: {'✅' if os.path.exists(self.sface_model_path) else '❌'} {self.sface_model_path}")
    
    def manage_users(self):
        """User management menu"""
        while True:
            print("\n🔹 USER MANAGEMENT")
            print("=" * 30)
            print("1. List All Users")
            print("2. Delete User")
            print("3. User Details")
            print("4. Back to Main Menu")
            
            choice = input("\nEnter choice (1-4): ").strip()
            
            if choice == '1':
                self._list_users()
            elif choice == '2':
                self._delete_user()
            elif choice == '3':
                self._user_details()
            elif choice == '4':
                break
            else:
                print("❌ Invalid choice")
    
    def _list_users(self):
        """List all registered users"""
        print("\n👥 REGISTERED USERS:")
        print("-" * 30)
        
        users = self.registration.list_registered_users()
        
        if not users:
            print("No users registered yet")
        else:
            for i, user in enumerate(users, 1):
                print(f"{i}. {user['name']} (ID: {user['user_id']}) - {user.get('sample_count', 0)} samples")
    
    def _delete_user(self):
        """Delete a user (placeholder)"""
        print("🗑️  User deletion feature would be implemented here")
        print("💡 For now, you can delete users directly in the database/files")
    
    def _user_details(self):
        """Show user details (placeholder)"""
        print("📄 User details feature would be implemented here")
        print("💡 This would show registration date, sample quality, etc.")
    
    def show_help(self):
        """Show help and information"""
        print("\n🔹 HELP & INFORMATION")
        print("=" * 50)
        
        print("🤖 ABOUT THIS SYSTEM:")
        print("This is a deep learning face recognition system using:")
        print("• YuNet for face detection (OpenCV DNN)")
        print("• SFace for face recognition (128D embeddings)")  
        print("• Quality assessment and face alignment")
        print("• Supabase/PostgreSQL for data storage")
        
        print("\n📚 HOW TO USE:")
        print("1. Register users by capturing 5-10 face samples")
        print("2. Start real-time recognition to identify people")
        print("3. Test with single images for verification")
        print("4. Adjust threshold based on your accuracy needs")
        
        print("\n🎯 THRESHOLD GUIDANCE:")
        print("• 0.3-0.4: Very lenient (higher false positives)")
        print("• 0.5-0.6: Balanced (recommended for most use)")
        print("• 0.7-0.8: Strict (lower false positives)")
        
        print("\n💡 TIPS FOR BEST RESULTS:")
        print("• Use consistent lighting during registration and recognition")
        print("• Capture samples from different angles during registration")
        print("• Ensure face is clearly visible and well-lit")
        print("• Avoid glasses, hats, or face coverings if possible")
        
        print("\n🔧 TROUBLESHOOTING:")
        print("• If recognition fails: Check lighting and face alignment")
        print("• If false matches: Increase threshold or re-register")
        print("• If no matches: Decrease threshold or improve image quality")
        
        input("\nPress Enter to continue...")
    
    def run(self):
        """Main application loop"""
        try:
            print("🚀 Starting Face Recognition System...")
            
            while True:
                self.show_main_menu()
                
                choice = input("Enter your choice (1-8): ").strip()
                
                if choice == '1':
                    self.register_user_interactive()
                elif choice == '2':
                    self.start_recognition_interactive()
                elif choice == '3':
                    self.test_single_image()
                elif choice == '4':
                    self.show_statistics()
                elif choice == '5':
                    self.settings_menu()
                elif choice == '6':
                    self.manage_users()
                elif choice == '7':
                    self.show_help()
                elif choice == '8':
                    print("\n👋 Goodbye! Thanks for using the Face Recognition System")
                    break
                else:
                    print("❌ Invalid choice. Please enter 1-8.")
                
        except KeyboardInterrupt:
            print("\n\n🛑 Application interrupted by user")
        except Exception as e:
            print(f"\n❌ Application error: {e}")
            logging.error(f"Application error: {e}", exc_info=True)


def main():
    """Entry point"""
    try:
        app = FaceRecognitionApp()
        app.run()
    except Exception as e:
        print(f"❌ Failed to start application: {e}")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())