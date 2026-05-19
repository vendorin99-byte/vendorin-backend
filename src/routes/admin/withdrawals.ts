import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'
import { createDisbursement } from '../../services/tripay'
import { creditWallet } from '../../services/wallet'
import { sendWithdrawalSuccessEmail, sendWithdrawalFailedEmail } from '../../services/email'

const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/', async (req, res) => {
  const { status, page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('withdrawals')
    .select('*, vendor_bank_accounts(bank_code, account_number, account_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status as string)

  const { data: withdrawals, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  if (!withdrawals?.length) return res.json({ data: [], total: 0 })

  // Fetch vendor names separately
  const vendorIds = [...new Set(withdrawals.map((w: any) => w.vendor_id).filter(Boolean))]
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, business_name, user_id')
    .in('id', vendorIds)

  const userIds = (vendors || []).map((v: any) => v.user_id).filter(Boolean)
  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .in('id', userIds)

  const vendorMap = Object.fromEntries((vendors || []).map((v: any) => [v.id, v]))
  const userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]))
  const data = withdrawals.map((w: any) => ({
    ...w,
    vendors: vendorMap[w.vendor_id]
      ? { ...vendorMap[w.vendor_id], users: userMap[vendorMap[w.vendor_id].user_id] }
      : null,
  }))

  res.json({ data, total: count })
})

router.post('/:id/approve', async (req, res) => {
  const { data: withdrawal } = await supabase
    .from('withdrawals')
    .select('*, vendor_bank_accounts(*)')
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .single()

  if (!withdrawal) return res.status(404).json({ error: 'Not found or already processed' })

  try {
    const disburse = await createDisbursement({
      externalId: `withdrawal-${withdrawal.id}`,
      bankCode: withdrawal.vendor_bank_accounts.bank_code,
      accountName: withdrawal.vendor_bank_accounts.account_name,
      accountNumber: withdrawal.vendor_bank_accounts.account_number,
      amount: withdrawal.amount_received,
    })

    await supabase.from('withdrawals').update({
      status: 'processing',
      tripay_disburse_id: disburse.uuid,
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
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (!withdrawal) return res.status(404).json({ error: 'Not found' })

  await supabase.from('withdrawals').update({ status: 'rejected', failure_reason: reason }).eq('id', req.params.id)
  await creditWallet(withdrawal.vendor_id, withdrawal.amount, 'credit_refund', withdrawal.id, 'Withdrawal rejected — balance returned')

  // Get user email for notification
  const { data: vendor } = await supabase.from('vendors').select('user_id').eq('id', withdrawal.vendor_id).single()
  if (vendor) {
    const { data: user } = await supabase.from('users').select('email').eq('id', vendor.user_id).single()
    if (user?.email) await sendWithdrawalFailedEmail(user.email, withdrawal.amount, reason)
  }

  res.json({ message: 'Withdrawal rejected and balance returned' })
})

export default router
