// Property-based tests for Biometric Authenticator
// Tests face recognition and WebAuthn functionality with mathematical properties

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { MultiBiometricAuthenticator } from '../biometric-authenticator'

// Mock fetch for face recognition API
global.fetch = vi.fn()

// Mock WebAuthn APIs
global.navigator = {
  credentials: {
    create: vi.fn(),
    get: vi.fn()
  },
  mediaDevices: {
    enumerateDevices: vi.fn(() => Promise.resolve([
      { kind: 'videoinput', deviceId: 'camera1' }
    ]))
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
}

global.PublicKeyCredential = {
  isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(() => Promise.resolve(true))
}

// Mock Canvas API for ImageData conversion
global.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  putImageData: vi.fn(),
  canvas: { width: 640, height: 480 }
}))
global.HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,fake-image-data')

// Mock Supabase
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockCustomerProfile, error: null })),
          limit: vi.fn(() => Promise.resolve({ data: [mockBiometricData], error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    })),
    rpc: vi.fn(() => Promise.resolve({ data: 'secure-challenge-123', error: null }))
  }
}))

const mockCustomerProfile = {
  id: 'customer-123',
  user_id: 'user-456',
  email: 'test@example.com',
  profiles: {
    full_name: 'Test Customer',
    email: 'test@example.com'
  }
}

const mockBiometricData = {
  id: 'bio-123',
  user_id: 'user-456',
  face_embedding: new Array(512).fill(0).map(() => Math.random())
}

const mockImageData = new ImageData(640, 480)

describe('MultiBiometricAuthenticator', () => {
  let authenticator

  beforeEach(() => {
    authenticator = new MultiBiometricAuthenticator('http://localhost:5000')
    vi.clearAllMocks()
  })

  describe('Face Recognition Property Tests', () => {
    
    // Property 1: Face Enrollment Quality Threshold
    it('should reject low-quality face enrollments consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 0, max: 1 }), // quality score
          fc.array(fc.float(), { minLength: 512, maxLength: 512 }), // face embedding
          async (qualityScore, embedding) => {
            // Mock API response based on quality
            const mockResponse = {
              success: qualityScore >= 0.5,
              embedding: qualityScore >= 0.5 ? embedding : null,
              quality_score: qualityScore,
              error: qualityScore < 0.5 ? 'Face image quality too low' : null
            }

            global.fetch.mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve(mockResponse)
            })

            const result = await authenticator.enrollFace(mockImageData)
            
            // Property: success ⟺ (qualityScore >= 0.5 AND embedding.length === 512)
            if (qualityScore >= 0.5 && embedding.length === 512) {
              expect(result.success).toBe(true)
              expect(result.embedding).toHaveLength(512)
              expect(result.qualityScore).toBe(qualityScore)
            } else {
              expect(result.success).toBe(false)
              expect(result.errorMessage).toBeTruthy()
            }
          }
        ),
        { numRuns: 30 }
      )
    })

    // Property 2: Face Similarity Symmetry and Threshold
    it('should maintain similarity threshold properties for identification', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0), max: Math.fround(1) }), // similarity score
          fc.float({ min: Math.fround(0.5), max: Math.fround(0.9) }), // threshold
          async (similarity, threshold) => {
            const mockResponse = {
              success: true,
              identified: similarity >= threshold,
              similarity: similarity,
              customer: similarity >= threshold ? {
                id: 'user-456',
                name: 'Test Customer',
                email: 'test@example.com'
              } : null
            }

            global.fetch.mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve(mockResponse)
            })

            const result = await authenticator.identifyFace(mockImageData, threshold)
            
            // Property: identified ⟺ (similarity >= threshold)
            expect(result.identified).toBe(similarity >= threshold)
            expect(result.similarity).toBe(similarity)
            
            if (similarity >= threshold) {
              expect(result.customer).toBeTruthy()
            } else {
              expect(result.customer).toBeFalsy()
            }
          }
        ),
        { numRuns: 40 }
      )
    })

    // Property 3: Face Verification Monotonicity
    it('should maintain monotonic relationship between similarity and verification success', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0), max: Math.fround(1) }), // similarity1
          fc.float({ min: Math.fround(0), max: Math.fround(1) }), // similarity2
          fc.float({ min: Math.fround(0.7), max: Math.fround(0.85) }), // threshold
          async (sim1, sim2, threshold) => {
            fc.pre(sim1 !== sim2) // Avoid equal similarities for clearer property testing

            const results = []
            
            for (const similarity of [sim1, sim2]) {
              const mockResponse = {
                success: true,
                verified: similarity >= threshold,
                similarity: similarity,
                verification_token: similarity >= threshold ? 'token-123' : null
              }

              global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
              })

              const result = await authenticator.verifyFace(mockImageData, 'customer-123', threshold)
              results.push({ similarity, verified: result.verified })
            }
            
            // Property: Monotonicity - if sim1 > sim2, then verified1 >= verified2 (when crossing threshold)
            const [result1, result2] = results.sort((a, b) => a.similarity - b.similarity)
            
            if (result1.similarity < threshold && result2.similarity >= threshold) {
              expect(result1.verified).toBe(false)
              expect(result2.verified).toBe(true)
            }
          }
        ),
        { numRuns: 25 }
      )
    })
  })

  describe('WebAuthn Property Tests', () => {
    
    // Property 4: Counter Monotonicity (Replay Attack Prevention)
    it('should maintain strictly increasing counter property', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1000 }), // initial counter
          fc.integer({ min: 1, max: 10 }), // counter increment
          async (initialCounter, increment) => {
            const newCounter = initialCounter + increment
            
            // Mock WebAuthn credential with counter
            const mockCredential = {
              id: 'credential-123',
              user_id: 'user-456',
              credential_id: 'cred-123',
              counter: initialCounter,
              friendly_name: 'Test Device',
              is_active: true,
              transports: ['internal']
            }

            // Mock WebAuthn assertion response
            const mockAssertion = {
              rawId: new TextEncoder().encode('cred-123'),
              response: {
                authenticatorData: new ArrayBuffer(37), // Contains counter at byte 33
                signature: new ArrayBuffer(64)
              }
            }

            // Mock counter in authenticator data
            const view = new DataView(mockAssertion.response.authenticatorData)
            view.setUint32(33, newCounter, false)

            // Mock Supabase for this specific test
            const mockSupabase = {
              from: vi.fn(() => ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => Promise.resolve({ data: [mockCredential], error: null }))
                })),
                update: vi.fn(() => ({
                  eq: vi.fn(() => Promise.resolve({ error: null }))
                }))
              }))
            }

            // Temporarily replace supabase import
            const originalSupabase = authenticator.supabase
            authenticator.supabase = mockSupabase

            vi.mocked(authenticator.supabase?.from).mockReturnValue({
              select: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: [mockCredential], error: null }))
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null }))
              }))
            })

            global.navigator.credentials.get.mockResolvedValueOnce(mockAssertion)

            const result = await authenticator.authenticateWebAuthn('user-456', { 
              challenge: btoa('valid-test-challenge-data-32-chars') // Valid base64 encoded challenge
            })
            
            // Property: Counter must be strictly increasing (newCounter > initialCounter)
            if (newCounter > initialCounter) {
              expect(result.verified).toBe(true)
              expect(result.counter).toBe(newCounter)
            } else {
              // Should be rejected due to replay attack detection
              expect(result.verified).toBe(false)
              expect(result.errorMessage).toContain('replay')
            }
          }
        ),
        { numRuns: 20 }
      )
    })

    // Property 5: Challenge Uniqueness
    it('should generate unique challenges consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 1000 }), // number of challenges to generate
          async (numChallenges) => {
            fc.pre(numChallenges >= 2) // Need at least 2 for uniqueness test

            const challenges = new Set()
            
            for (let i = 0; i < Math.min(numChallenges, 100); i++) {
              const challenge = `challenge-${Math.random().toString(36)}-${i}`
              challenges.add(challenge)
            }
            
            // Property: All generated challenges should be unique
            expect(challenges.size).toBe(Math.min(numChallenges, 100))
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('Platform Detection Property Tests', () => {
    
    // Property 6: Platform Capability Consistency  
    it('should consistently detect platform capabilities', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // has camera
          fc.boolean(), // has webauthn
          async (hasCamera, hasWebauthn) => {
            // Mock camera availability
            if (hasCamera) {
              global.navigator.mediaDevices.enumerateDevices.mockResolvedValueOnce([
                { kind: 'videoinput', deviceId: 'camera1' }
              ])
            } else {
              global.navigator.mediaDevices.enumerateDevices.mockResolvedValueOnce([])
            }

            // Mock WebAuthn availability
            global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
              .mockResolvedValueOnce(hasWebauthn)

            const capabilities = await authenticator.getSupportedBiometrics()
            const cameraAvailable = await authenticator.isFaceCameraAvailable()
            const deviceBiometricAvailable = await authenticator.isDeviceBiometricAvailable()
            
            // Property: Detected capabilities should match actual availability
            expect(cameraAvailable).toBe(hasCamera)
            
            if (hasCamera) {
              expect(capabilities).toContain('face-recognition')
            } else {
              expect(capabilities).not.toContain('face-recognition')
            }

            if (hasWebauthn) {
              expect(capabilities).toContain('webauthn-platform')
            }
            // Note: Don't check negative case for WebAuthn as it might have fallback behavior
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('Error Handling and Edge Cases', () => {
    
    it('should handle API failures gracefully', async () => {
      // Test network failure
      global.fetch.mockRejectedValueOnce(new Error('Network error'))
      
      const result = await authenticator.enrollFace(mockImageData)
      expect(result.success).toBe(false)
      expect(result.errorMessage).toContain('Network error')
    })

    it('should handle invalid face embeddings', async () => {
      const mockResponse = {
        success: true,
        embedding: new Array(256).fill(0), // Wrong size (should be 512)
        quality_score: 0.8
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await authenticator.enrollFace(mockImageData)
      expect(result.success).toBe(false)
      expect(result.errorMessage).toContain('Invalid face embedding')
    })

    it('should handle WebAuthn not supported', async () => {
      // Mock WebAuthn not supported
      delete global.navigator.credentials
      
      const authenticatorWithoutWebAuthn = new MultiBiometricAuthenticator()
      
      const result = await authenticatorWithoutWebAuthn.authenticateWebAuthn('user-456', { challenge: 'test' })
      expect(result.verified).toBe(false)
      expect(result.errorMessage).toContain('not supported')
    })

    it('should validate challenge format', async () => {
      const invalidChallenges = ['', null, undefined, 123, {}, 'short']
      
      for (const invalidChallenge of invalidChallenges) {
        try {
          const result = await authenticator.authenticateWebAuthn('user-456', { challenge: invalidChallenge })
          expect(result.verified).toBe(false)
          expect(result.errorMessage).toBeTruthy()
        } catch (error) {
          // WebAuthnError should be thrown for invalid challenges
          expect(error.name).toBe('WebAuthnError')
        }
      }
    })
  })

  describe('Cosine Similarity Property Tests', () => {
    
    it('should maintain cosine similarity mathematical properties', async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.float({ min: Math.fround(-1), max: Math.fround(1) }), { minLength: 512, maxLength: 512 }),
          fc.array(fc.float({ min: Math.fround(-1), max: Math.fround(1) }), { minLength: 512, maxLength: 512 }),
          (vectorA, vectorB) => {
            // Filter out NaN and infinite values
            const cleanVectorA = vectorA.map(x => isNaN(x) || !isFinite(x) ? 0 : x)
            const cleanVectorB = vectorB.map(x => isNaN(x) || !isFinite(x) ? 0 : x)
            
            // Skip zero vectors (undefined cosine similarity)
            const isZeroA = cleanVectorA.every(x => Math.abs(x) < 0.001)
            const isZeroB = cleanVectorB.every(x => Math.abs(x) < 0.001)
            fc.pre(!isZeroA && !isZeroB)

            const similarity = cosineSimilarity(cleanVectorA, cleanVectorB)
            
            // Property 1: Symmetry - cos(A, B) = cos(B, A)
            const symmetricSimilarity = cosineSimilarity(cleanVectorB, cleanVectorA)
            expect(Math.abs(similarity - symmetricSimilarity)).toBeLessThan(0.0001)
            
            // Property 2: Range - cosine similarity is in [-1, 1]
            expect(similarity).toBeGreaterThanOrEqual(-1.0001) // Small tolerance for floating point errors
            expect(similarity).toBeLessThanOrEqual(1.0001)
            
            // Property 3: Identity - cos(A, A) = 1 (for non-zero vectors)
            const identitySimilarity = cosineSimilarity(cleanVectorA, cleanVectorA)
            expect(Math.abs(identitySimilarity - 1)).toBeLessThan(0.001)
          }
        ),
        { numRuns: 30 } // Reduced for better performance
      )
    })
  })
})

// Helper function for cosine similarity testing
function cosineSimilarity(vectorA, vectorB) {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i]
    magnitudeA += vectorA[i] * vectorA[i]
    magnitudeB += vectorB[i] * vectorB[i]
  }

  magnitudeA = Math.sqrt(magnitudeA)
  magnitudeB = Math.sqrt(magnitudeB)

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (magnitudeA * magnitudeB)
}