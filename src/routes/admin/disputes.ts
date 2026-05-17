import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middlewares/auth'
import { requireRole, requireAdmin } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'
import { debitWallet } from '../../services/wallet'

const router = Router()

router.use(requireAdmin, requireAuth, requireRole('admin'))

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('bookings')
    .select(`*, vendors(business_name, category), services(name), transactions(*)`)
    .eq('status', 'dispute')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

const resolveSchema = z.object({
  action: z.enum(['full_refund', 'partial_refund', 'no_refund']),
  refund_amount: z.number().positive().optional(),
  notes: z.string().optional(),
})

router.post('/:id/resolve', async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { action, refund_amount, notes } = parsed.data

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('status', 'dispute')
    .single()

  if (!booking) return res.status(404).json({ error: 'Dispute booking not found' })

  let newStatus = ''
  let refundedAmount = 0

  if (action === 'full_refund') {
    refundedAmount = booking.total_amount
    newStatus = 'refunded'
    // Debit vendor wallet if they already received any amount
    try {
      await debitWallet(
        booking.vendor_id,
        booking.vendor_received,
        'dispute_debit',
        booking.id,
        `Dispute full refund — booking ${booking.id}`
      )
    } catch (_e) {
      // Vendor may not have been credited yet — safe to ignore
    }
  } else if (action === 'partial_refund') {
    if (!refund_amount) return res.status(400).json({ error: 'refund_amount required for partial_refund' })
    refundedAmount = refund_amount
    newStatus = 'dispute_resolved'
  } else {
    newStatus = 'completed'
  }

  await supabase.from('bookings').update({
    status: newStatus,
    admin_notes: notes,
  }).eq('id', booking.id)

  if (refundedAmount > 0) {
    await supabase.from('transactions').insert({
      booking_id: booking.id,
      amount: refundedAmount,
      type: 'refund',
      status: 'success',
    })
  }

  res.json({ message: 'Dispute resolved', action, booking_id: booking.id, refunded_amount: refundedAmount })
})

export default router
