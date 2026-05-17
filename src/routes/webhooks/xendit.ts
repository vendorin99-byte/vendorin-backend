import { Router } from 'express'
import { supabase } from '../../lib/supabase'
import { validateXenditWebhook } from '../../services/xendit'
import { creditWallet } from '../../services/wallet'
import { sendWithdrawalSuccessEmail } from '../../services/email'

const router = Router()

router.post('/payment', async (req, res) => {
  const token = req.headers['x-callback-token'] as string
  if (!validateXenditWebhook(token)) return res.status(401).json({ error: 'Invalid token' })

  const { external_id, status } = req.body
  if (status !== 'PAID') return res.json({ received: true })

  const { data: transaction } = await supabase
    .from('transactions')
    .select('*, bookings(*)')
    .eq('xendit_invoice_id', external_id.replace('booking-dp-', '').replace('booking-remaining-', ''))
    .single()

  if (!transaction) return res.status(404).json({ error: 'Transaction not found' })

  await supabase.from('transactions').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', transaction.id)

  const isDP = external_id.startsWith('booking-dp-')
  const newStatus = isDP ? 'dp_paid' : 'fully_paid'

  await supabase.from('bookings').update({ status: newStatus }).eq('id', transaction.booking_id)

  if (!isDP) {
    const booking = transaction.bookings
    await supabase.from('vendors').update({
      wallet_pending: supabase.rpc('decrement', { x: booking.vendor_received }),
    }).eq('id', booking.vendor_id)

    await creditWallet(booking.vendor_id, booking.vendor_received, 'credit_order', booking.id, `Pesanan #${booking.id.slice(0, 8)} selesai`)
  }

  res.json({ received: true })
})

router.post('/disbursement', async (req, res) => {
  const token = req.headers['x-callback-token'] as string
  if (!validateXenditWebhook(token)) return res.status(401).json({ error: 'Invalid token' })

  const { external_id, status, failure_reason } = req.body
  const withdrawalId = external_id.replace('withdrawal-', '')

  const { data: withdrawal } = await supabase
    .from('withdrawals')
    .select('*, vendors(users(email)), vendor_bank_accounts(account_number)')
    .eq('id', withdrawalId)
    .single()

  if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' })

  if (status === 'COMPLETED') {
    await supabase.from('withdrawals').update({ status: 'success', success_at: new Date().toISOString() }).eq('id', withdrawalId)
    await sendWithdrawalSuccessEmail(
      (withdrawal as any).vendors.users.email,
      withdrawal.amount_received,
      (withdrawal as any).vendor_bank_accounts.account_number.slice(-4)
    )
  } else if (status === 'FAILED') {
    await supabase.from('withdrawals').update({ status: 'failed', failure_reason }).eq('id', withdrawalId)
    await creditWallet(withdrawal.vendor_id, withdrawal.amount, 'credit_refund', withdrawalId, 'Disbursement failed — balance returned')
  }

  res.json({ received: true })
})

export default router
