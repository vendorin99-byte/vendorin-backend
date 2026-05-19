import { Router } from 'express'
import { supabase } from '../../lib/supabase'
import { validateWebhookSignature } from '../../services/tripay'
import { creditWallet } from '../../services/wallet'

const router = Router()

router.post('/payment', async (req, res) => {
  const rawBody = JSON.stringify(req.body)
  const signature = req.headers['x-callback-secret'] as string

  if (!validateWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const { reference, merchant_ref, status } = req.body
  if (status !== 'PAID') return res.json({ received: true })

  const isDP = (merchant_ref as string).startsWith('booking-dp-')
  const bookingId = (merchant_ref as string)
    .replace('booking-dp-', '')
    .replace('booking-remaining-', '')

  const { data: transaction } = await supabase
    .from('transactions')
    .select('*, bookings(*)')
    .eq('tripay_reference', reference)
    .maybeSingle()

  if (!transaction) return res.status(404).json({ error: 'Transaction not found' })

  await supabase.from('transactions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', transaction.id)

  const newStatus = isDP ? 'dp_paid' : 'fully_paid'
  await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId)

  if (!isDP) {
    const booking = transaction.bookings
    await creditWallet(
      booking.vendor_id,
      booking.vendor_received,
      'credit_order',
      booking.id,
      `Pesanan #${booking.id.slice(0, 8)} dilunasi`
    )
  }

  res.json({ received: true })
})

export default router
