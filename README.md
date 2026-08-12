# FacePay - Real Biometric Payment System

A React-based facial recognition payment system with **real biometric authentication** using TensorFlow.js and Supabase.

⚠️ **This is a prototype system for demonstration purposes. See disclaimers below.**

## 🔐 Biometric System Overview

### Face Recognition Model
- **Model**: MediaPipe FaceMesh
- **Embedding Dimension**: 512-dimensional vectors
- **Framework**: TensorFlow.js with WebGL backend
- **License**: Apache 2.0
- **Detection Model**: BlazeFace for fast face detection

### Architecture
```
Customer Registration Flow:
Camera → Face Detection → Liveness Check → Face Embedding (512-dim) → Supabase Edge Function → pgvector Storage

Merchant Payment Flow:
1. First Scan (1:N Identification):
   Camera → Face Detection → Liveness Check → Face Embedding → identify-face Edge Function → pgvector Search → Customer Matched

2. Second Scan (1:1 Verification):
   Camera → Face Detection → Liveness Check → Face Embedding → verify-face Edge Function → Compare with Customer's Stored Embedding → Transaction Authorized
```

### Security Features

#### Liveness Detection
- **Randomized challenges**: Blink, turn left, smile
- **Challenge order**: Randomized per session
- **Detection method**: Real-time facial landmark analysis
- **Disclaimer**: This is prototype-level liveness detection, NOT production-grade anti-spoofing. Production systems require advanced liveness detection with depth sensing, texture analysis, and challenge-response protocols.

#### Biometric Matching
- **1:N Identification Threshold**: 0.85 (85% similarity)
- **1:1 Verification Threshold**: 0.90 (90% similarity)
- **Similarity Metric**: Cosine similarity
- **Storage**: PostgreSQL with pgvector extension
- **Vector Search**: Efficient nearest-neighbor search with HNSW indexing

#### Transaction Security
- **Two-factor biometric**: First scan identifies, second scan verifies
- **Cryptographic nonce**: Unique transaction identifier (32-byte random hex)
- **Time-bound verification**: Verification tokens expire in 5 minutes
- **Audit logging**: All biometric operations logged with timestamps, IP, and user agent

#### Privacy & Data Protection
- ✅ Biometric embeddings never exposed to client
- ✅ All matching operations server-side only (Supabase Edge Functions)
- ✅ Service role key never exposed to frontend
- ✅ Optional enrollment images stored in private bucket
- ✅ Row-level security on biometric data
- ❌ Never stores: UPI PIN, OTP, CVV, bank passwords

## 🚀 Getting Started

### Prerequisites
```bash
Node.js 18+
npm or yarn
Supabase account
Supabase CLI (for Edge Functions deployment)
```

### Environment Setup
1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Add your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Installation
```bash
npm install
npm run dev
```

### Database Setup

1. Enable pgvector extension in Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

2. Run the complete schema from `src/lib/schema.sql`:
   - Creates `customer_biometrics` table with vector(512) column
   - Creates `biometric_audit_log` table
   - Creates RPC functions: `match_face_embedding()` and `verify_face_embedding()`
   - Creates vector index for efficient similarity search

3. Create storage bucket for biometric images:
   - Bucket name: `biometric-images`
   - Privacy: Private
   - File size limit: 5MB
   - Allowed MIME types: image/jpeg, image/png

### Deploy Edge Functions

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy all Edge Functions
supabase functions deploy enroll-face
supabase functions deploy identify-face
supabase functions deploy verify-face

# Set environment variables for Edge Functions
supabase secrets set SUPABASE_URL=your_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set SUPABASE_ANON_KEY=your_anon_key
```

## 📁 Project Structure

```
src/
├── components/
│   ├── BiometricCamera.jsx       # Real-time biometric capture with liveness
│   └── BiometricCamera.css
├── lib/
│   ├── face-recognition.js       # MediaPipe FaceMesh + TensorFlow.js
│   ├── liveness.js               # Liveness detection logic
│   ├── biometric-api.js          # Edge Function API helpers
│   ├── supabase.js               # Supabase client
│   └── schema.sql                # Database schema with pgvector
├── pages/
│   ├── CustomerRegister.jsx      # Customer registration with biometric enrollment
│   ├── MerchantDashboard.jsx     # Merchant terminal with 1:N + 1:1 scanning
│   ├── CustomerDashboard.jsx     # Customer dashboard
│   └── Landing.jsx               # Landing page
└── contexts/
    └── AuthContext.jsx           # Authentication context

supabase/functions/
├── _shared/
│   └── cors.ts                   # CORS headers
├── enroll-face/
│   └── index.ts                  # Biometric enrollment (customers only)
├── identify-face/
│   └── index.ts                  # 1:N face matching (merchants only)
└── verify-face/
    └── index.ts                  # 1:1 face verification (merchants only)
```

## 🔧 Configuration

### Face Recognition Thresholds
Edit `src/lib/face-recognition.js`:
```javascript
export const FACE_CONFIG = {
  EMBEDDING_DIMENSION: 512,
  MATCH_THRESHOLD: 0.85,           // 1:N identification
  VERIFICATION_THRESHOLD: 0.90,    // 1:1 verification
  QUALITY_THRESHOLD: 0.7,          // Minimum face quality
  MIN_FACE_SIZE: 100,              // Minimum face size in pixels
}
```

### Liveness Detection
Edit `src/lib/liveness.js`:
```javascript
export const LIVENESS_CONFIG = {
  BLINK_THRESHOLD: 0.3,
  HEAD_TURN_THRESHOLD: 0.2,
  SMILE_THRESHOLD: 0.1,
  ACTION_TIMEOUT: 10000,           // 10 seconds per action
  REQUIRED_ACTIONS: ['blink', 'turn_left', 'smile']
}
```

## 🧪 Testing the Complete Flow

### 1. Customer Registration with Real Biometrics
1. Navigate to Customer Register
2. Fill in personal details (name, phone, email, password)
3. Click "Start Biometric Capture"
4. **Follow liveness challenges**:
   - Blink your eyes when prompted
   - Turn your head left when prompted
   - Smile when prompted
5. System captures high-quality face image automatically
6. Complete registration with payment details
7. **Verify**: Check Supabase `customer_biometrics` table for stored embedding

### 2. Merchant Payment with Real Face Matching
1. Log in as merchant
2. Click "SCAN CUSTOMER"
3. **First Scan (1:N Identification)**:
   - Complete liveness challenges
   - System performs real biometric search across all enrolled customers
   - Customer is identified by similarity score
4. Enter payment amount
5. **Second Scan (1:1 Verification)**:
   - Complete liveness challenges again
   - System verifies face matches the identified customer
   - Transaction is authorized with verification token
6. **Verify**: Check `biometric_audit_log` for both identify and verify operations

### Expected Results
- ✅ Real face detection using BlazeFace
- ✅ Real liveness detection with randomized challenges
- ✅ Real 512-dimensional embedding generation
- ✅ Real pgvector similarity search
- ✅ Real cosine similarity calculation
- ✅ Real two-factor biometric authentication

## 📊 Performance Characteristics

### Model Loading
- Initial load: ~2-3 seconds (models downloaded once)
- Subsequent loads: Instant (cached in browser)

### Face Processing
- Detection: ~50-100ms per frame
- Embedding generation: ~200-300ms
- Liveness check: ~2-5 seconds (depends on user response time)
- Auto-capture: Triggers when quality ≥ 70%

### Matching Performance
- 1:N search: ~50-200ms (depends on database size)
- 1:1 verification: ~10-50ms
- pgvector index: HNSW for sub-linear search time

### Accuracy (Prototype Level)
- These metrics need calibration with real test data:
  - False Accept Rate (FAR): Not yet measured
  - False Reject Rate (FRR): Not yet measured
  - Liveness spoofing resistance: **Low** (prototype only)

## ⚠️ Important Disclaimers

### Development Status
This is a **prototype** system for demonstration purposes. Before production deployment:

#### 1. Liveness Detection
**Current**: Prototype facial landmark analysis
**Required for Production**:
- Hardware-based depth sensing (iPhone Face ID, Android FaceAuth)
- Advanced texture analysis for print/screen detection
- Challenge-response protocols with cryptographic binding
- Multi-spectral imaging
- Motion analysis across multiple frames

#### 2. Face Recognition Model
**Current**: Simplified embedding from MediaPipe FaceMesh keypoints
**Required for Production**:
- Dedicated face recognition model (FaceNet, ArcFace, CosFace)
- Training on diverse demographic datasets
- Bias testing and mitigation
- Regular model updates and retraining

#### 3. Security Hardening
- Add rate limiting on Edge Functions
- Implement request signing and replay protection
- Add device fingerprinting
- Enable fraud detection monitoring
- Implement backup authentication methods

#### 4. Threshold Calibration
**Critical**: Current thresholds (0.85 for identification, 0.90 for verification) are **not calibrated**.

Production requires:
- Collect genuine-match test data (same person, multiple captures)
- Collect impostor-match test data (different people)
- Calculate False Accept Rate (FAR) vs False Reject Rate (FRR) curves
- Choose operating point based on security requirements
- Test across age, gender, ethnicity, lighting conditions

#### 5. Compliance & Legal
- Ensure GDPR/privacy law compliance
- Implement biometric data deletion workflows
- Add explicit user consent mechanisms
- Document data retention policies
- Conduct privacy impact assessments
- Comply with biometric data regulations (BIPA, CCPA, etc.)

#### 6. Payment Integration
**Current**: Demo transactions only
**Required for Production**:
- Integrate real payment gateway (Razorpay, Stripe, etc.)
- Add PCI DSS compliance
- Implement proper transaction reconciliation
- Add refund/chargeback handling
- Implement fraud detection
- Add transaction monitoring and alerts

### Known Limitations
- ❌ **Does not prevent photo/video replay attacks** (needs production liveness)
- ❌ Not tested against 3D printed face models
- ❌ Not tested against deepfake attacks
- ❌ Not tested for demographic bias
- ❌ Embedding model is simplified (production needs dedicated recognition model)
- ❌ No backup authentication method
- ❌ No failover mechanism for camera failures
- ⚠️ Demo payment system - no real money transfer

### Security Vulnerabilities (Prototype)
1. **Presentation attacks**: Can be fooled by photos/videos
2. **Lighting variations**: May cause false rejects in poor lighting
3. **Pose variations**: May have lower accuracy for extreme angles
4. **Aging**: Not tested for long-term enrollment validity
5. **Identical twins**: Not tested for twin differentiation

## 🤝 Contributing

This is a prototype system. Contributions welcome for:
- Integration of production-grade face recognition models
- Production liveness detection implementation
- Security enhancements and penetration testing
- Performance optimizations
- Bias testing and mitigation
- Threshold calibration tools

## 📄 License

This project uses:
- **TensorFlow.js**: Apache 2.0 License
- **MediaPipe FaceMesh**: Apache 2.0 License
- **BlazeFace**: Apache 2.0 License
- **React**: MIT License
- **Supabase**: Apache 2.0 License

Project code: MIT License

## 🔗 Resources

- [TensorFlow.js Face Landmarks Detection](https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [MediaPipe FaceMesh](https://google.github.io/mediapipe/solutions/face_mesh.html)
- [Face Recognition Best Practices](https://pages.nist.gov/frvt/html/frvt11.html)

## 📞 Support

For issues and questions:
1. Check existing GitHub issues
2. Review the documentation above
3. Check Supabase logs for Edge Function errors
4. Verify database schema matches `schema.sql`
5. Ensure Edge Functions are deployed with correct environment variables

---

**Remember**: This is a prototype. Never deploy to production without proper security audits, compliance reviews, and production-grade components.
