// CustomerSecuritySettingsManager
// Comprehensive security settings and transaction limit management for enhanced FacePay system
// Implements production-ready validation, database integration, and security constraints

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  CustomerSecuritySettings,
  SecuritySettingsManager,
  ValidationResult,
  AuthMethodsResult,
  TransactionLimitError,
  SecurityValidationError,
  DailyTransactionSummary
} from '../types/enhanced-types'

export class CustomerSecuritySettingsManager implements SecuritySettingsManager {
  private supabase: SupabaseClient

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    this.supabase = createClient(
      supabaseUrl || process.env.VITE_SUPABASE_URL || '',
      supabaseKey || process.env.VITE_SUPABASE_ANON_KEY || ''
    )
  }

  // ============================================================================
  // TRANSACTION LIMIT MANAGEMENT
  // ============================================================================

  async updateTransactionLimit(customerId: string, limit: number): Promise<boolean> {
    try {
      // Validate limit amount
      if (limit <= 0) {
        throw new SecurityValidationError(
          'Transaction limit must be positive',
          'INVALID_LIMIT_AMOUNT',
          { providedLimit: limit }
        )
      }

      if (limit > 100000) { // 1 lakh max per transaction
        throw new SecurityValidationError(
          'Transaction limit cannot exceed ₹100,000',
          'EXCESSIVE_LIMIT_AMOUNT',
          { providedLimit: limit, maxAllowed: 100000 }
        )
      }

      // Get current settings
      const currentSettings = await this.getCustomerSettings(customerId)
      
      // Validate against daily limit
      if (limit > currentSettings.dailyTransactionLimit) {
        throw new SecurityValidationError(
          'Per-transaction limit cannot exceed daily limit',
          'LIMIT_EXCEEDS_DAILY',
          { transactionLimit: limit, dailyLimit: currentSettings.dailyTransactionLimit }
        )
      }

      // Update in database
      const { error } = await this.supabase
        .from('customer_security_settings')
        .update({ 
          maxTransactionAmount: limit,
          updatedAt: new Date().toISOString()
        })
        .eq('customerProfileId', customerId)

      if (error) {
        console.error('Failed to update transaction limit:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating transaction limit:', error)
      throw error
    }
  }

  async updateDailyLimit(customerId: string, limit: number): Promise<boolean> {
    try {
      // Validate limit amount
      if (limit <= 0) {
        throw new SecurityValidationError(
          'Daily transaction limit must be positive',
          'INVALID_DAILY_LIMIT',
          { providedLimit: limit }
        )
      }

      if (limit > 500000) { // 5 lakh max per day
        throw new SecurityValidationError(
          'Daily transaction limit cannot exceed ₹500,000',
          'EXCESSIVE_DAILY_LIMIT',
          { providedLimit: limit, maxAllowed: 500000 }
        )
      }

      // Get current settings
      const currentSettings = await this.getCustomerSettings(customerId)
      
      // Ensure per-transaction limit doesn't exceed new daily limit
      const updatedTransactionLimit = Math.min(
        currentSettings.maxTransactionAmount,
        limit
      )

      // Update in database
      const { error } = await this.supabase
        .from('customer_security_settings')
        .update({ 
          dailyTransactionLimit: limit,
          maxTransactionAmount: updatedTransactionLimit,
          updatedAt: new Date().toISOString()
        })
        .eq('customerProfileId', customerId)

      if (error) {
        console.error('Failed to update daily limit:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating daily limit:', error)
      throw error
    }
  }

  // ============================================================================
  // AUTHENTICATION METHOD MANAGEMENT
  // ============================================================================

  async enableFacePayment(customerId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('customer_security_settings')
        .update({ 
          facePaymentEnabled: true,
          updatedAt: new Date().toISOString()
        })
        .eq('customerProfileId', customerId)

      if (error) {
        console.error('Failed to enable face payment:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error enabling face payment:', error)
      return false
    }
  }

  async enableBiometricPayment(customerId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('customer_security_settings')
        .update({ 
          biometricPaymentEnabled: true,
          updatedAt: new Date().toISOString()
        })
        .eq('customerProfileId', customerId)

      if (error) {
        console.error('Failed to enable biometric payment:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error enabling biometric payment:', error)
      return false
    }
  }

  async disableFacePayment(customerId: string): Promise<boolean> {
    try {
      // Security constraint: At least one auth method must remain enabled
      const currentSettings = await this.getCustomerSettings(customerId)
      
      if (!currentSettings.biometricPaymentEnabled) {
        throw new SecurityValidationError(
          'Cannot disable face payment - at least one authentication method must remain enabled',
          'AUTH_METHOD_REQUIRED',
          { currentFaceEnabled: true, currentBiometricEnabled: false }
        )
      }

      const { error } = await this.supabase
        .from('customer_security_settings')
        .update({ 
          facePaymentEnabled: false,
          updatedAt: new Date().toISOString()
        })
        .eq('customerProfileId', customerId)

      if (error) {
        console.error('Failed to disable face payment:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error disabling face payment:', error)
      throw error
    }
  }

  async disableBiometricPayment(customerId: string): Promise<boolean> {
    try {
      // Security constraint: At least one auth method must remain enabled
      const currentSettings = await this.getCustomerSettings(customerId)
      
      if (!currentSettings.facePaymentEnabled) {
        throw new SecurityValidationError(
          'Cannot disable biometric payment - at least one authentication method must remain enabled',
          'AUTH_METHOD_REQUIRED',
          { currentFaceEnabled: false, currentBiometricEnabled: true }
        )
      }

      const { error } = await this.supabase
        .from('customer_security_settings')
        .update({ 
          biometricPaymentEnabled: false,
          updatedAt: new Date().toISOString()
        })
        .eq('customerProfileId', customerId)

      if (error) {
        console.error('Failed to disable biometric payment:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error disabling biometric payment:', error)
      throw error
    }
  }

  // ============================================================================
  // SETTINGS RETRIEVAL
  // ============================================================================

  async getCustomerSettings(customerId: string): Promise<CustomerSecuritySettings> {
    try {
      const { data, error } = await this.supabase
        .from('customer_security_settings')
        .select('*')
        .eq('customerProfileId', customerId)
        .single()

      if (error) {
        // If no settings exist, create default settings
        if (error.code === 'PGRST116') {
          return await this.createDefaultSettings(customerId)
        }
        throw error
      }

      return {
        id: data.id,
        customerProfileId: data.customerProfileId,
        maxTransactionAmount: data.maxTransactionAmount,
        dailyTransactionLimit: data.dailyTransactionLimit,
        facePaymentEnabled: data.facePaymentEnabled,
        biometricPaymentEnabled: data.biometricPaymentEnabled,
        requireDualFactor: data.requireDualFactor,
        livenessDetectionEnabled: data.livenessDetectionEnabled,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      }
    } catch (error) {
      console.error('Error fetching customer settings:', error)
      throw error
    }
  }

  private async createDefaultSettings(customerId: string): Promise<CustomerSecuritySettings> {
    try {
      const defaultSettings = {
        customerProfileId: customerId,
        maxTransactionAmount: 5000, // ₹5,000 default
        dailyTransactionLimit: 25000, // ₹25,000 default
        facePaymentEnabled: true,
        biometricPaymentEnabled: false,
        requireDualFactor: false,
        livenessDetectionEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const { data, error } = await this.supabase
        .from('customer_security_settings')
        .insert([defaultSettings])
        .select()
        .single()

      if (error) {
        throw error
      }

      return {
        id: data.id,
        customerProfileId: data.customerProfileId,
        maxTransactionAmount: data.maxTransactionAmount,
        dailyTransactionLimit: data.dailyTransactionLimit,
        facePaymentEnabled: data.facePaymentEnabled,
        biometricPaymentEnabled: data.biometricPaymentEnabled,
        requireDualFactor: data.requireDualFactor,
        livenessDetectionEnabled: data.livenessDetectionEnabled,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      }
    } catch (error) {
      console.error('Error creating default settings:', error)
      throw error
    }
  }

  // ============================================================================
  // TRANSACTION VALIDATION
  // ============================================================================

  async validateTransactionAmount(customerId: string, amount: number): Promise<ValidationResult> {
    try {
      if (amount <= 0) {
        return {
          valid: false,
          reason: 'Transaction amount must be positive'
        }
      }

      const settings = await this.getCustomerSettings(customerId)
      
      // Check per-transaction limit
      if (amount > settings.maxTransactionAmount) {
        return {
          valid: false,
          reason: `Transaction amount exceeds per-transaction limit of ₹${settings.maxTransactionAmount}`,
          maxTransactionAmount: settings.maxTransactionAmount
        }
      }

      // Calculate daily spending
      const dailySummary = await this.getDailyTransactionSummary(customerId)
      const potentialDailySpending = dailySummary.totalAmount + amount

      // Check daily limit
      if (potentialDailySpending > settings.dailyTransactionLimit) {
        return {
          valid: false,
          reason: `Transaction would exceed daily limit of ₹${settings.dailyTransactionLimit}`,
          dailyTransactionLimit: settings.dailyTransactionLimit,
          currentDailySpending: dailySummary.totalAmount,
          transactionsToday: dailySummary.transactionCount
        }
      }

      // Valid transaction
      return {
        valid: true,
        maxTransactionAmount: settings.maxTransactionAmount,
        dailyTransactionLimit: settings.dailyTransactionLimit,
        currentDailySpending: dailySummary.totalAmount,
        transactionsToday: dailySummary.transactionCount
      }

    } catch (error) {
      console.error('Error validating transaction amount:', error)
      return {
        valid: false,
        reason: 'Unable to validate transaction - please try again'
      }
    }
  }

  private async getDailyTransactionSummary(customerId: string): Promise<DailyTransactionSummary> {
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

      const { data, error } = await this.supabase
        .from('transaction_authorizations')
        .select('id, amount, authorizedAt')
        .eq('customerProfileId', customerId)
        .eq('status', 'AUTHORIZED')
        .gte('authorizedAt', startOfDay.toISOString())
        .lt('authorizedAt', endOfDay.toISOString())

      if (error) {
        console.error('Error fetching daily transactions:', error)
        throw error
      }

      const transactions = data || []
      const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
      const lastTransaction = transactions.length > 0 
        ? new Date(Math.max(...transactions.map(tx => new Date(tx.authorizedAt).getTime())))
        : startOfDay

      return {
        customerProfileId: customerId,
        transactionDate: startOfDay,
        transactionCount: transactions.length,
        totalAmount,
        lastTransactionAt: lastTransaction
      }
    } catch (error) {
      console.error('Error calculating daily spending:', error)
      return {
        customerProfileId: customerId,
        transactionDate: new Date(),
        transactionCount: 0,
        totalAmount: 0,
        lastTransactionAt: new Date()
      }
    }
  }

  // ============================================================================
  // AUTHENTICATION METHODS QUERY
  // ============================================================================

  async getAuthMethods(customerId: string): Promise<AuthMethodsResult> {
    try {
      const settings = await this.getCustomerSettings(customerId)
      
      // Check WebAuthn credential count
      const { data: credentials, error: credError } = await this.supabase
        .from('webauthn_credentials')
        .select('id')
        .eq('customerProfileId', customerId)
        .eq('isActive', true)

      if (credError) {
        console.error('Error fetching WebAuthn credentials:', credError)
      }

      const webauthnCredentialCount = credentials?.length || 0

      return {
        facePaymentEnabled: settings.facePaymentEnabled,
        biometricPaymentEnabled: settings.biometricPaymentEnabled,
        hasWebAuthnCredentials: webauthnCredentialCount > 0,
        requireDualFactor: settings.requireDualFactor,
        webauthnCredentialCount
      }
    } catch (error) {
      console.error('Error fetching auth methods:', error)
      
      // Return safe defaults
      return {
        facePaymentEnabled: true,
        biometricPaymentEnabled: false,
        hasWebAuthnCredentials: false,
        requireDualFactor: false,
        webauthnCredentialCount: 0
      }
    }
  }

  // ============================================================================
  // BULK OPERATIONS AND UTILITIES
  // ============================================================================

  async updateSecurityPreferences(
    customerId: string, 
    preferences: {
      facePaymentEnabled?: boolean
      biometricPaymentEnabled?: boolean
      requireDualFactor?: boolean
      livenessDetectionEnabled?: boolean
      maxTransactionAmount?: number
      dailyTransactionLimit?: number
    }
  ): Promise<boolean> {
    try {
      const currentSettings = await this.getCustomerSettings(customerId)
      
      // Validate authentication method constraint
      const newFaceEnabled = preferences.facePaymentEnabled ?? currentSettings.facePaymentEnabled
      const newBiometricEnabled = preferences.biometricPaymentEnabled ?? currentSettings.biometricPaymentEnabled
      
      if (!newFaceEnabled && !newBiometricEnabled) {
        throw new SecurityValidationError(
          'At least one authentication method must remain enabled',
          'AUTH_METHOD_REQUIRED'
        )
      }

      // Validate transaction limits if provided
      if (preferences.maxTransactionAmount !== undefined) {
        if (preferences.maxTransactionAmount <= 0 || preferences.maxTransactionAmount > 100000) {
          throw new SecurityValidationError(
            'Invalid transaction limit amount',
            'INVALID_TRANSACTION_LIMIT'
          )
        }
      }

      if (preferences.dailyTransactionLimit !== undefined) {
        if (preferences.dailyTransactionLimit <= 0 || preferences.dailyTransactionLimit > 500000) {
          throw new SecurityValidationError(
            'Invalid daily transaction limit',
            'INVALID_DAILY_LIMIT'
          )
        }
      }

      // Update database
      const updateData = {
        ...preferences,
        updatedAt: new Date().toISOString()
      }

      const { error } = await this.supabase
        .from('customer_security_settings')
        .update(updateData)
        .eq('customerProfileId', customerId)

      if (error) {
        console.error('Failed to update security preferences:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating security preferences:', error)
      throw error
    }
  }

  async getCustomersRequiringDualFactor(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('customer_security_settings')
        .select('customerProfileId')
        .eq('requireDualFactor', true)

      if (error) {
        console.error('Error fetching dual factor customers:', error)
        return []
      }

      return data.map(item => item.customerProfileId)
    } catch (error) {
      console.error('Error getting dual factor customers:', error)
      return []
    }
  }

  // ============================================================================
  // HEALTH CHECK AND DIAGNOSTICS
  // ============================================================================

  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, any> }> {
    try {
      // Test database connection
      const { data, error } = await this.supabase
        .from('customer_security_settings')
        .select('count')
        .limit(1)

      if (error) {
        return {
          healthy: false,
          details: {
            database: 'connection_failed',
            error: error.message,
            timestamp: new Date().toISOString()
          }
        }
      }

      return {
        healthy: true,
        details: {
          database: 'connected',
          timestamp: new Date().toISOString(),
          service: 'CustomerSecuritySettingsManager'
        }
      }
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      }
    }
  }
}

// Export singleton instance for convenience
export const securitySettingsManager = new CustomerSecuritySettingsManager()

// Named exports for testing and custom initialization
export { CustomerSecuritySettingsManager as default }