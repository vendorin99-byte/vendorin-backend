import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'
import { debitWallet } from '../../services/wallet'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

const withdrawSchema = z.object({
  amount: z.number().min(50000),
  bank_account_id: z.string().uuid(),
})

router.post('/', async (req, res) => {
  const parsed = withdrawSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { amount, bank_account_id } = parsed.data
  const adminFee = 5000
  const amountReceived = amount - adminFee

  const { data: bank } = await supabase
    .from('vendor_bank_accounts')
    .select('*')
    .eq('id', bank_account_id)
    .eq('vendor_id', req.user!.vendorId)
    .eq('is_verified', true)
    .single()

  if (!bank) return res.status(400).json({ error: 'Bank account not found or not verified' })

  try {
    await debitWallet(req.user!.vendorId!, amount, 'debit_withdrawal', '', 'Withdrawal request')
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }

  const { data: withdrawal, error } = await supabase.from('withdrawals').insert({
    vendor_id: req.user!.vendorId,
    bank_account_id,
    amount,
    admin_fee: adminFee,
    amount_received: amountReceived,
    status: 'pending',
  }).select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(withdrawal)
})

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*, vendor_bank_accounts(bank_code, account_number)')
    .eq('vendor_id', req.user!.vendorId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
