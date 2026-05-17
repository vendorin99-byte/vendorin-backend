import { supabase } from '../lib/supabase'
import { WalletLedgerEntry } from '../types'

export async function creditWallet(
  vendorId: string,
  amount: number,
  type: WalletLedgerEntry['type'],
  referenceId: string,
  description: string
) {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('wallet_balance')
    .eq('id', vendorId)
    .single()

  if (!vendor) throw new Error('Vendor not found')

  const newBalance = vendor.wallet_balance + amount

  await supabase.from('vendors').update({ wallet_balance: newBalance }).eq('id', vendorId)
  await supabase.from('wallet_ledger').insert({
    vendor_id: vendorId,
    type,
    amount,
    balance_after: newBalance,
    reference_id: referenceId,
    description,
  })

  return newBalance
}

export async function debitWallet(
  vendorId: string,
  amount: number,
  type: WalletLedgerEntry['type'],
  referenceId: string,
  description: string
) {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('wallet_balance')
    .eq('id', vendorId)
    .single()

  if (!vendor) throw new Error('Vendor not found')
  if (vendor.wallet_balance < amount) throw new Error('Insufficient balance')

  const newBalance = vendor.wallet_balance - amount

  await supabase.from('vendors').update({ wallet_balance: newBalance }).eq('id', vendorId)
  await supabase.from('wallet_ledger').insert({
    vendor_id: vendorId,
    type,
    amount,
    balance_after: newBalance,
    reference_id: referenceId,
    description,
  })

  return newBalance
}
