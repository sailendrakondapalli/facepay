@echo off
echo Testing YuNet Face Detection + Quality Assessment + Alignment...
echo.
echo IMPORTANT: You need to download the models first!
echo.
echo 1. YuNet Face Detection Model:
echo    - Go to: https://github.com/opencv/opencv_zoo/tree/master/models/face_detection_yunet
echo    - Download: face_detection_yunet_2023mar.onnx
echo    - Place it in: models/face_detection_yunet_2023mar.onnx
echo.
echo 2. SFace Recognition Model:
echo    - Go to: https://github.com/opencv/opencv_zoo/tree/master/models/face_recognition_sface
echo    - Download: face_recognition_sface_2021dec.onnx
echo    - Place it in: models/face_recognition_sface_2021dec.onnx
echo.
echo 3. Setup Supabase Database:
echo    - Create account at https://supabase.com
echo    - Update .env file with your credentials
echo.
echo Press any key when models are downloaded, or Ctrl+C to exit...
pause

cd src
py detector.py