// Enhanced FacePay TypeScript Interfaces
// Core data models for multi-factor biometric authentication system

// ============================================================================
// CORE DATA MODELS
// ============================================================================

export interface CustomerProfile {
  id: string // UUID
  userId: string // References auth.users.id
  facepayId: string // Unique identifier for Face Pay
  fullName: string
  email: string
  
  // Legacy fields (maintain compatibility)
  faceReference?: string
  paymentIdentifier?: string
  transactionLimit: number
  facepayEnabled: boolean
  
  // Timestamps
  createdAt: Date
}

export interface CustomerSecuritySettings {
  id: string
  customerProfileId: string
  
  // Transaction Limits
  maxTransactionAmount: number
  dailyTransactionLimit: number
  
  // Authentication Method Preferences
  facePaymentEnabled: boolean
  biometricPaymentEnabled: boolean
  
  // Security Preferences
  requireDualFactor: boolean
  livenessDetectionEnabled: boolean
  
  // Metadata
  createdAt: Date
  updatedAt: Date
}

export interface WebAuthnCredential {
  id: string
  userId: string
  customerProfileId: string
  
  // WebAuthn Credential Data (NOT biometric data)
  credentialId: string // Base64URL encoded
  publicKey: ArrayBuffer // Cryptographic public key only
  counter: number
  
  // Device Information
  transports: AuthenticatorTransport[]
  deviceType: 'platform' | 'cross-platform'
  aaguid?: string
  
  // User-Friendly Information
  friendlyName: string // "Windows Hello", "Touch ID", etc.
  deviceInfo: Record<string, any>
  
  // Security
  attestationObject?: ArrayBuffer
  clientDataJSON?: ArrayBuffer
  
  // Status
  isActive: boolean
  lastUsedAt?: Date
  createdAt: Date
}

export interface TransactionAuthorization {
  id: string
  transactionId: string
  customerProfileId: string
  merchantId: string
  
  // Authentication Factors
  faceVerified: boolean
  faceSimilarity?: number
  faceEmbeddingId?: string
  
  deviceBiometricVerified: boolean
  webauthnCredentialId?: string
  webauthnSignature?: ArrayBuffer
  authenticatorType?: string
  
  // Security Metadata
  challenge: string
  challengeExpiresAt: Date
  ipAddress?: string
  userAgent?: string
  geolocation?: {
    latitude: number
    longitude: number
  }
  
  // Risk Assessment
  riskScore: number // 0.0 to 1.0
  fraudFlags: string[]
  
  // Status
  status: 'PENDING' | 'AUTHORIZED' | 'DENIED' | 'EXPIRED'
  authorizedAt?: Date
  createdAt: Date
}

export interface PaymentSession {
  id: string
  sessionId: string
  
  // Session Data
  merchantId: string
  customerEmail: string
  amount: number
  currency: string
  
  // Security
  challenge: string
  nonce: string
  
  // Status
  status: 'INITIATED' | 'AUTHENTICATING' | 'AUTHORIZED' | 'COMPLETED' | 'FAILED' | 'EXPIRED'
  expiresAt: Date
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// BUSINESS LOGIC INTERFACES
// ============================================================================

export interface SecuritySettingsManager {
  updateTransactionLimit(customerId: string, limit: number): Promise<boolean>
  updateDailyLimit(customerId: string, limit: number): Promise<boolean>
  enableFacePayment(customerId: string): Promise<boolean>
  enableBiometricPayment(customerId: string): Promise<boolean>
  disableFacePayment(customerId: string): Promise<boolean>
  disableBiometricPayment(customerId: string): Promise<boolean>
  getCustomerSettings(customerId: string): Promise<CustomerSecuritySettings>
  validateTransactionAmount(customerId: string, amount: number): Promise<ValidationResult>
  getAuthMethods(customerId: string): Promise<AuthMethodsResult>
}

export interface ValidationResult {
  valid: boolean
  reason?: string
  maxTransactionAmount?: number
  dailyTransactionLimit?: number
  currentDailySpending?: number
  transactionsToday?: number
}

export interface AuthMethodsResult {
  facePaymentEnabled: boolean
  biometricPaymentEnabled: boolean
  hasWebAuthnCredentials: boolean
  requireDualFactor: boolean
  webauthnCredentialCount: number
}

// ============================================================================
// BIOMETRIC AUTHENTICATION INTERFACES
// ============================================================================

export interface BiometricAuthenticator {
  // Face Recognition
  enrollFace(imageData: ImageData): Promise<FaceEnrollmentResult>
  identifyFace(imageData: ImageData, threshold: number): Promise<FaceIdentificationResult>
  verifyFace(imageData: ImageData, customerId: string, threshold: number): Promise<FaceVerificationResult>
  
  // Device Biometric
  registerWebAuthn(userId: string, options?: WebAuthnRegistrationOptions): Promise<WebAuthnRegistrationResult>
  authenticateWebAuthn(userId: string, challenge: Challenge): Promise<WebAuthnAuthResult>
  
  // Platform Detection
  getSupportedBiometrics(): Promise<BiometricCapability[]>
  isDeviceBiometricAvailable(): Promise<boolean>
  isFaceCameraAvailable(): Promise<boolean>
}

export interface FaceEnrollmentResult {
  success: boolean
  embedding?: number[] // 512D vector
  qualityScore?: number
  errorMessage?: string
}

export interface FaceIdentificationResult {
  success: boolean
  identified: boolean
  customer?: {
    id: string
    userId: string
    name: string
    email: string
  }
  similarity: number
  errorMessage?: string
}

export interface FaceVerificationResult {
  success: boolean
  verified: boolean
  similarity: number
  verificationToken?: string
  errorMessage?: string
}

export interface WebAuthnRegistrationOptions {
  displayName?: string
  timeout?: number
  attestation?: AttestationConveyancePreference
  authenticatorSelection?: AuthenticatorSelectionCriteria
}

export interface WebAuthnRegistrationResult {
  success: boolean
  credentialId?: string
  friendlyName?: string
  deviceType?: 'platform' | 'cross-platform'
  errorMessage?: string
}

export interface Challenge {
  challenge: string
  amount?: number
  merchantId?: string
  timestamp?: string
}

export interface WebAuthnAuthResult {
  verified: boolean
  authorizationToken?: string
  authenticatorName?: string
  signature?: ArrayBuffer
  counter?: number
  errorMessage?: string
}

export type BiometricCapability = 
  | 'face-recognition'
  | 'fingerprint'
  | 'face-id'
  | 'touch-id' 
  | 'windows-hello'
  | 'webauthn-platform'
  | 'webauthn-roaming'

// ============================================================================
// TRANSACTION PROCESSING INTERFACES  
// ============================================================================

export interface TransactionAuthorizationEngine {
  initiatePayment(request: PaymentRequest): Promise<PaymentSession>
  validateCustomerLimits(customerId: string, amount: number): Promise<ValidationResult>
  authorizePayment(session: PaymentSession, authFactors: AuthenticationFactors): Promise<AuthorizationResult>
  generateSecureChallenge(): Promise<string>
  preventReplayAttacks(transactionId: string): Promise<boolean>
  getPaymentSession(sessionId: string): Promise<PaymentSession | null>
}

export interface PaymentRequest {
  merchantId: string
  customerEmail: string
  amount: number
  currency: string
  timestamp: Date
  metadata?: Record<string, any>
}

export interface AuthenticationFactors {
  faceVerified?: boolean
  faceEmbedding?: number[]
  faceSimilarity?: number
  deviceBiometricVerified?: boolean
  webauthnSignature?: ArrayBuffer
  webauthnCredentialId?: string
  challenge: string
  timestamp?: string
}

export interface AuthorizationResult {
  success: boolean
  transactionId?: string
  authMethod?: string
  isDualFactor?: boolean
  authType?: string
  errorMessage?: string
  riskScore?: number
}

// ============================================================================
// PLATFORM-SPECIFIC HANDLERS
// ============================================================================

export interface WebAuthnHandler {
  createCredential(options: CredentialCreationOptions): Promise<PublicKeyCredential>
  getAssertion(options: CredentialRequestOptions): Promise<PublicKeyCredential>
  isWebAuthnSupported(): boolean
  isUserVerifyingPlatformAuthenticatorAvailable(): Promise<boolean>
  getAuthenticatorInfo(): Promise<AuthenticatorInfo>
}

export interface AuthenticatorInfo {
  type: 'platform' | 'cross-platform'
  transport: AuthenticatorTransport[]
  algorithms: number[]
  capabilities: string[]
}

// ============================================================================
// SECURITY AND AUDIT INTERFACES
// ============================================================================

export interface SecurityAuditLogger {
  logAuthenticationAttempt(event: AuthenticationEvent): Promise<void>
  logPaymentAuthorization(event: PaymentAuthEvent): Promise<void>
  logSecuritySettingsChange(event: SecuritySettingsEvent): Promise<void>
  logSuspiciousActivity(event: SuspiciousActivityEvent): Promise<void>
  getAuditLog(userId: string, filters?: AuditFilters): Promise<SecurityAuditLog[]>
}

export interface AuthenticationEvent {
  userId: string
  customerProfileId?: string
  eventType: 'face_enrollment' | 'face_authentication' | 'webauthn_registration' | 'webauthn_authentication'
  eventAction: 'success' | 'failure' | 'attempt'
  authenticationMethod?: 'face' | 'device_biometric' | 'dual_factor'
  similarityScore?: number
  riskScore?: number
  ipAddress?: string
  userAgent?: string
  errorMessage?: string
  metadata?: Record<string, any>
}

export interface PaymentAuthEvent {
  userId: string
  customerProfileId: string
  transactionId: string
  merchantId: string
  amount: number
  authMethod: string
  success: boolean
  riskScore: number
  fraudFlags?: string[]
  ipAddress?: string
  userAgent?: string
}

export interface SecuritySettingsEvent {
  userId: string
  customerProfileId: string
  settingChanged: string
  oldValue: any
  newValue: any
  changeReason?: string
}

export interface SuspiciousActivityEvent {
  userId: string
  activityType: string
  riskScore: number
  indicators: string[]
  description: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

export interface SecurityAuditLog {
  id: string
  userId: string
  customerProfileId?: string
  eventType: string
  eventAction: string
  eventResult: Record<string, any>
  authenticationMethod?: string
  similarityScore?: number
  riskScore?: number
  ipAddress?: string
  userAgent?: string
  requestId?: string
  sessionId?: string
  suspiciousActivity: boolean
  fraudIndicators: string[]
  metadata: Record<string, any>
  createdAt: Date
}

export interface AuditFilters {
  eventType?: string
  eventAction?: string
  dateFrom?: Date
  dateTo?: Date
  suspiciousOnly?: boolean
  limit?: number
  offset?: number
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class BiometricAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'BiometricAuthError'
  }
}

export class TransactionLimitError extends Error {
  constructor(
    message: string,
    public limitType: 'transaction' | 'daily',
    public currentValue: number,
    public limitValue: number
  ) {
    super(message)
    this.name = 'TransactionLimitError'
  }
}

export class WebAuthnError extends Error {
  constructor(
    message: string,
    public code: string,
    public authenticatorError?: string
  ) {
    super(message)
    this.name = 'WebAuthnError'
  }
}

export class SecurityValidationError extends Error {
  constructor(
    message: string,
    public validationType: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'SecurityValidationError'
  }
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type AuthMethodPreference = 'face-only' | 'biometric-only' | 'both' | 'none'

export type TransactionStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED'

export type PaymentAuthMethod = 
  | 'FACE_ONLY'
  | 'DEVICE_BIOMETRIC'
  | 'DUAL_BIOMETRIC_FACE_FACE'
  | 'DUAL_BIOMETRIC_FACEPAY_WEBAUTHN'

export interface DailyTransactionSummary {
  customerProfileId: string
  transactionDate: Date
  transactionCount: number
  totalAmount: number
  lastTransactionAt: Date
}

// Type guards for runtime type checking
export function isValidBiometricCapability(value: string): value is BiometricCapability {
  return [
    'face-recognition',
    'fingerprint', 
    'face-id',
    'touch-id',
    'windows-hello',
    'webauthn-platform',
    'webauthn-roaming'
  ].includes(value as BiometricCapability)
}

export function isValidTransactionStatus(value: string): value is TransactionStatus {
  return ['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED'].includes(value as TransactionStatus)
}

export function isValidPaymentAuthMethod(value: string): value is PaymentAuthMethod {
  return [
    'FACE_ONLY',
    'DEVICE_BIOMETRIC', 
    'DUAL_BIOMETRIC_FACE_FACE',
    'DUAL_BIOMETRIC_FACEPAY_WEBAUTHN'
  ].includes(value as PaymentAuthMethod)
}