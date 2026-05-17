import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

router.get('/', async (req, res) => {
  const { status, page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('bookings')
    .select(`*, users(name, phone, avatar_url), services(name, price)`, { count: 'exact' })
    .eq('vendor_id', req.user!.vendorId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

router.patch('/:id/confirm', async (req, res) => {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', req.params.id).single()
  if (!booking || booking.vendor_id !== req.user!.vendorId) return res.status(404).json({ error: 'Not found' })
  if (booking.status !== 'dp_paid') return res.status(400).json({ error: 'DP not yet paid' })

  const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Order confirmed' })
})

router.patch('/:id/reject', async (req, res) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ error: 'Reason required' })

  const { data: booking } = await supabase.from('bookings').select('*').eq('id', req.params.id).single()
  if (!booking || booking.vendor_id !== req.user!.vendorId) return res.status(404).json({ error: 'Not found' })

  const { error } = await supabase.from('bookings')
    .update({ status: 'cancelled', rejected_reason: reason })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Order rejected' })
})

router.patch('/:id/done', async (req, res) => {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', req.params.id).single()
  if (!booking || booking.vendor_id !== req.user!.vendorId) return res.status(404).json({ error: 'Not found' })

  const { error } = await supabase.from('bookings').update({ status: 'done' }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Order marked as done' })
})

export default router
