import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole, requireAdmin } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'
import { createDisbursement } from '../../services/xendit'
import { creditWallet } from '../../services/wallet'
import { sendWithdrawalSuccessEmail, sendWithdrawalFailedEmail } from '../../services/email'

const router = Router()

router.use(requireAdmin, requireAuth, requireRole('admin'))

router.get('/', async (req, res) => {
  const { status, page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('withdrawals')
    .select(`*, vendors(business_name, users(email)), vendor_bank_accounts(bank_code, account_number, account_name)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status as string)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

router.post('/:id/approve', async (req, res) => {
  const { data: withdrawal } = await supabase
    .from('withdrawals')
    .select('*, vendor_bank_accounts(*), vendors(users(email))')
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .single()

  if (!withdrawal) return res.status(404).json({ error: 'Not found or already processed' })

  try {
    const disburse = await createDisbursement({
      externalId: `withdrawal-${withdrawal.id}`,
      bankCode: withdrawal.vendor_bank_accounts.bank_code,
      accountHolderName: withdrawal.vendor_bank_accounts.account_name,
      accountNumber: withdrawal.vendor_bank_accounts.account_number,
      description: 'VendorIn Disbursement',
      amount: withdrawal.amount_received,
    })

    await supabase.from('withdrawals').update({
      status: 'processing',
      xendit_disburse_id: (disburse as any).id,
      approved_by: req.user!.id,
      approved_at: new Date().toISOString(),
    }).eq('id', req.params.id)

    res.json({ message: 'Disbursement initiated' })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:id/reject', async (req, res) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ error: 'reason required' })

  const { data: withdrawal } = await supabase
    .from('withdrawals')
    .select('*, vendors(users(email))')
    .eq('id', req.params.id)
    .single()

  if (!withdrawal) return res.status(404).json({ error: 'Not found' })

  await supabase.from('withdrawals').update({ status: 'rejected', failure_reason: reason }).eq('id', req.params.id)
  await creditWallet(withdrawal.vendor_id, withdrawal.amount, 'credit_refund', withdrawal.id, 'Withdrawal rejected — balance returned')

  await sendWithdrawalFailedEmail((withdrawal as any).vendors.users.email, withdrawal.amount, reason)
  res.json({ message: 'Withdrawal rejected and balance returned' })
})

export default router
