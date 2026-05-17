export type UserRole = 'customer' | 'vendor' | 'admin'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  vendorId?: string
}

export interface WalletLedgerEntry {
  vendor_id: string
  type: 'credit_order' | 'debit_withdrawal' | 'credit_refund' | 'debit_fee' | 'dispute_debit'
  amount: number
  balance_after: number
  reference_id?: string
  description: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}
