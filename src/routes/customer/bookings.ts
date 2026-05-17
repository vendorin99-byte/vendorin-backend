import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'
import { createInvoice } from '../../services/xendit'

const router = Router()

const bookingSchema = z.object({
  vendor_id: z.string().uuid(),
  service_id: z.string().uuid(),
  event_date: z.string(),
  event_time: z.string().optional(),
  notes: z.string().optional(),
})

router.post('/', requireAuth, requireRole('customer'), async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { vendor_id, service_id, event_date, event_time, notes } = parsed.data

  const { data: service } = await supabase.from('services').select('*').eq('id', service_id).single()
  if (!service) return res.status(404).json({ error: 'Service not found' })

  const platformFee = Math.floor(service.price * 0.01)
  const dpAmount = Math.floor(service.price * (service.dp_percent / 100))

  const { data: booking, error } = await supabase.from('bookings').insert({
    customer_id: req.user!.id,
    vendor_id,
    service_id,
    event_date,
    event_time,
    notes,
    total_amount: service.price,
    dp_amount: dpAmount,
    platform_fee: platformFee,
    vendor_received: service.price - platformFee,
    status: 'pending_dp',
  }).select().single()

  if (error) return res.status(500).json({ error: error.message })

  const invoice = await createInvoice({
    externalId: `booking-dp-${booking.id}`,
    amount: dpAmount,
    payerEmail: req.user!.email,
    description: `DP Booking ${service.name}`,
  })

  await supabase.from('transactions').insert({
    booking_id: booking.id,
    amount: dpAmount,
    type: 'dp',
    xendit_invoice_id: (invoice as any).id,
  })

  res.status(201).json({ booking, payment_url: (invoice as any).invoice_url })
})

router.get('/my', requireAuth, requireRole('customer'), async (req, res) => {
  const { status } = req.query
  let query = supabase
    .from('bookings')
    .select(`*, vendors(business_name, category, avatar_url), services(name)`)
    .eq('customer_id', req.user!.id)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('bookings')
    .select(`*, vendors(*), services(*), transactions(*)`)
    .eq('id', req.params.id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Booking not found' })

  const isOwner = data.customer_id === req.user!.id || data.vendor_id === req.user!.vendorId
  if (!isOwner && req.user!.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  res.json(data)
})

router.post('/:id/pay-remaining', requireAuth, requireRole('customer'), async (req, res) => {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, services(name)')
    .eq('id', req.params.id)
    .eq('customer_id', req.user!.id)
    .single()

  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  if (booking.status !== 'confirmed') return res.status(400).json({ error: 'Booking belum dikonfirmasi vendor' })

  const remaining = booking.total_amount - booking.dp_amount

  const invoice = await createInvoice({
    externalId: `booking-remaining-${booking.id}`,
    amount: remaining,
    payerEmail: req.user!.email,
    description: `Pelunasan Booking ${(booking.services as any).name}`,
  })

  await supabase.from('transactions').insert({
    booking_id: booking.id,
    amount: remaining,
    type: 'remaining',
    xendit_invoice_id: (invoice as any).id,
  })

  await supabase.from('bookings').update({ status: 'pending_remaining' }).eq('id', booking.id)

  res.json({ amount: remaining, payment_url: (invoice as any).invoice_url })
})

export default router
