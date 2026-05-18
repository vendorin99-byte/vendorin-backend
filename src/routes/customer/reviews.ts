import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.post('/', requireAuth, requireRole('customer'), async (req, res) => {
  const schema = z.object({
    booking_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { booking_id, rating, comment } = parsed.data

  const { data: booking } = await supabase
    .from('bookings')
    .select('vendor_id, customer_id, status')
    .eq('id', booking_id)
    .single()

  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  if (booking.customer_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
  if (booking.status !== 'done') return res.status(400).json({ error: 'Pesanan belum selesai' })

  const { data: existing } = await supabase.from('reviews').select('id').eq('booking_id', booking_id).single()
  if (existing) return res.status(400).json({ error: 'Ulasan sudah diberikan' })

  const { data, error } = await supabase.from('reviews').insert({
    booking_id,
    vendor_id: booking.vendor_id,
    user_id: req.user!.id,
    rating,
    comment,
  }).select().single()

  if (error) return res.status(500).json({ error: error.message })

  // Update avg_rating vendor
  const { data: stats } = await supabase
    .from('reviews')
    .select('rating')
    .eq('vendor_id', booking.vendor_id)

  if (stats?.length) {
    const avg = stats.reduce((s, r) => s + r.rating, 0) / stats.length
    await supabase.from('vendors').update({
      avg_rating: Math.round(avg * 10) / 10,
      total_reviews: stats.length,
    }).eq('id', booking.vendor_id)
  }

  res.status(201).json(data)
})

export default router
