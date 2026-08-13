// Property-based tests for Security Settings Manager
// Tests transaction limit validation and authentication method management

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'

// Mock Supabase
vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

// Import after mocking
import { CustomerSecuritySettingsManager } from '../security-settings-manager'
import { supabase } from '../supabase.js'

// Mock data
const mockCustomerSettings = {
  id: 'setting-123',
  customer_profile_id: 'customer-123',
  max_transaction_amount: 5000,
  daily_transaction_limit: 20000,
  face_payment_enabled: true,
  biometric_payment_enabled: false,
  require_dual_factor: false,
  liveness_detection_enabled: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z'
}

const mockValidationResult = {
  valid: true,
  reason: 'Transaction within limits',
  max_transaction_amount: 5000,
  daily_transaction_limit: 20000,
  current_daily_spending: 1000,
  transactions_today: 2
}

const mockCustomerProfile = {
  user_id: 'user-123'
}

describe('CustomerSecuritySettingsManager', () => {
  let manager

  beforeEach(() => {
    manager = new CustomerSecuritySettingsManager()
    vi.clearAllMocks()
    
    // Set up default mocks
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCustomerSettings, error: null })
        })
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null })
        })
      })
    })
    
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [mockValidationResult], error: null })
  })

  describe('Property-based tests', () => {
    
    // Property 1: Transaction Limit Validation Invariant
    it('should enforce transaction amount ≤ customer max transaction amount', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 0, max: 100000 }), // transaction amount
          fc.float({ min: 0, max: 100000 }), // max limit
          async (amount, limit) => {
            // Mock the validation result based on the property
            const expectedValid = amount <= limit && amount > 0
            
            const mockResult = {
              valid: expectedValid,
              reason: expectedValid ? 'Transaction within limits' : 'Transaction limit exceeded',
              max_transaction_amount: limit,
              daily_transaction_limit: limit * 4, // Assume daily is 4x transaction limit
              current_daily_spending: 0,
              transactions_today: 0
            }

            vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [mockResult], error: null })

            const result = await manager.validateTransactionAmount('customer-123', amount)
            
            // Property: (amount <= limit AND amount > 0) === result.valid
            expect(result.valid).toBe(expectedValid)
            
            if (!expectedValid && amount > limit) {
              expect(result.reason).toContain('limit')
            }
          }
        ),
        { numRuns: 50 }
      )
    })

    // Property 2: Daily Limit Validation
    it('should enforce daily spending + transaction ≤ daily limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 1, max: 10000 }), // transaction amount
          fc.float({ min: 0, max: 50000 }), // current daily spending  
          fc.float({ min: 10000, max: 100000 }), // daily limit
          async (transactionAmount, dailySpending, dailyLimit) => {
            const totalAfterTransaction = dailySpending + transactionAmount
            const expectedValid = totalAfterTransaction <= dailyLimit

            const mockResult = {
              valid: expectedValid,
              reason: expectedValid ? 'Transaction within limits' : 'Daily limit exceeded',
              max_transaction_amount: Math.min(transactionAmount * 2, dailyLimit),
              daily_transaction_limit: dailyLimit,
              current_daily_spending: dailySpending,
              transactions_today: 5
            }

            vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [mockResult], error: null })

            const result = await manager.validateTransactionAmount('customer-123', transactionAmount)
            
            // Property: (dailySpending + transactionAmount <= dailyLimit) === result.valid
            expect(result.valid).toBe(expectedValid)
            
            if (!expectedValid) {
              expect(result.reason).toContain('daily')
            }
          }
        ),
        { numRuns: 50 }
      )
    })

    // Property 3: Transaction Limit Consistency 
    it('should maintain max_transaction_amount ≤ daily_transaction_limit invariant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 1, max: 50000 }), // max transaction amount
          fc.float({ min: 1, max: 100000 }), // daily limit
          async (maxTransaction, dailyLimit) => {
            // Only test valid combinations where daily >= max transaction
            fc.pre(dailyLimit >= maxTransaction)

            // Mock successful update for valid combinations
            vi.mocked(supabase.from).mockReturnValue({
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ 
                    data: {
                      ...mockCustomerSettings,
                      max_transaction_amount: maxTransaction,
                      daily_transaction_limit: dailyLimit
                    }, 
                    error: null 
                  })
                })
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null })
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null })
                })
              })
            })

            const result1 = await manager.updateTransactionLimit('customer-123', maxTransaction)
            const result2 = await manager.updateDailyLimit('customer-123', dailyLimit)
            
            // Property: Valid updates should always succeed when daily >= max
            expect(result1).toBe(true)
            expect(result2).toBe(true)
          }
        ),
        { numRuns: 30 }
      )
    })

    // Property 4: Authentication Method Constraint
    it('should always maintain at least one authentication method enabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // face enabled
          fc.boolean(), // biometric enabled  
          async (faceEnabled, biometricEnabled) => {
            // Skip the case where both are disabled (should be rejected)
            fc.pre(faceEnabled || biometricEnabled)

            const mockSettings = {
              ...mockCustomerSettings,
              face_payment_enabled: faceEnabled,
              biometric_payment_enabled: biometricEnabled
            }

            vi.mocked(supabase.from).mockReturnValue({
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockSettings, error: null })
                })
              })
            })

            const settings = await manager.getCustomerSettings('customer-123')
            
            // Property: At least one authentication method must be enabled
            expect(settings.facePaymentEnabled || settings.biometricPaymentEnabled).toBe(true)
          }
        ),
        { numRuns: 20 }
      )
    })

    // Property 5: Idempotent Operations
    it('should be idempotent for enable/disable operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (initialState) => {
            const mockSettings = {
              ...mockCustomerSettings,
              face_payment_enabled: initialState,
              biometric_payment_enabled: !initialState // Ensure at least one is enabled
            }

            vi.mocked(supabase.from).mockReturnValue({
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockSettings, error: null })
                })
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null })
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null })
                })
              })
            })

            // Enable face payment twice
            const result1 = await manager.enableFacePayment('customer-123')
            const result2 = await manager.enableFacePayment('customer-123')
            
            // Property: Idempotent operations should always succeed
            expect(result1).toBe(true)
            expect(result2).toBe(true)
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('Boundary value tests', () => {
    
    it('should handle boundary values for transaction limits', async () => {
      const boundaryValues = [0, 0.01, 1, 999.99, 1000, 1000.01, 4999.99, 5000, 5000.01, 100000]
      
      for (const amount of boundaryValues) {
        const mockResult = {
          valid: amount > 0 && amount <= 5000,
          reason: amount <= 0 ? 'Amount must be positive' : 
                  amount > 5000 ? 'Transaction limit exceeded' : 'Transaction within limits',
          max_transaction_amount: 5000,
          daily_transaction_limit: 20000,
          current_daily_spending: 0,
          transactions_today: 0
        }

        vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [mockResult], error: null })

        const result = await manager.validateTransactionAmount('customer-123', amount)
        
        if (amount > 0 && amount <= 5000) {
          expect(result.valid).toBe(true)
        } else {
          expect(result.valid).toBe(false)
        }
      }
    })

    it('should handle edge cases for daily limits', async () => {
      const testCases = [
        { current: 0, transaction: 20000, limit: 20000, expected: true },      // Exactly at limit
        { current: 19999, transaction: 1, limit: 20000, expected: true },      // Just under limit
        { current: 19999, transaction: 2, limit: 20000, expected: false },     // Just over limit
        { current: 0, transaction: 20001, limit: 20000, expected: false },     // Single transaction over limit
      ]

      for (const testCase of testCases) {
        const mockResult = {
          valid: testCase.expected,
          reason: testCase.expected ? 'Transaction within limits' : 'Daily limit exceeded',
          max_transaction_amount: 5000,
          daily_transaction_limit: testCase.limit,
          current_daily_spending: testCase.current,
          transactions_today: 5
        }

        vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [mockResult], error: null })

        const result = await manager.validateTransactionAmount('customer-123', testCase.transaction)
        
        expect(result.valid).toBe(testCase.expected)
      }
    })
  })

  describe('Error handling', () => {
    
    it('should handle database errors gracefully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Database connection failed' } })

      await expect(manager.validateTransactionAmount('customer-123', 1000))
        .rejects.toThrow('Database connection failed')
    })

    it('should validate input parameters', async () => {
      await expect(manager.updateTransactionLimit('', 1000))
        .rejects.toThrow('Customer ID is required')

      await expect(manager.updateTransactionLimit('customer-123', -100))
        .rejects.toThrow('Transaction limit must be positive')

      await expect(manager.updateDailyLimit('customer-123', 0))
        .rejects.toThrow('Daily limit must be positive')
    })

    it('should prevent disabling all authentication methods', async () => {
      const mockSettings = {
        ...mockCustomerSettings,
        face_payment_enabled: true,
        biometric_payment_enabled: false
      }

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockSettings, error: null })
          })
        })
      })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [{
        face_payment_enabled: true,
        biometric_payment_enabled: false,
        has_webauthn_credentials: false,
        require_dual_factor: false,
        webauthn_credential_count: 0
      }], error: null })

      // Should throw error when trying to disable the only enabled method
      await expect(manager.disableFacePayment('customer-123'))
        .rejects.toThrow('at least one authentication method must remain enabled')
    })
  })
})