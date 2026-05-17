import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth)

router.get('/rooms', async (req, res) => {
  const userId = req.user!.id
  const vendorId = req.user!.vendorId

  const query = vendorId
    ? supabase.from('chat_rooms').select(`*, users!customer_id(id, name, avatar_url), messages(content, created_at)`).eq('vendor_id', vendorId)
    : supabase.from('chat_rooms').select(`*, vendors(business_name, avatar_url), messages(content, created_at)`).eq('customer_id', userId)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/rooms', async (req, res) => {
  const { vendor_id, booking_id } = req.body
  if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' })

  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('customer_id', req.user!.id)
    .eq('vendor_id', vendor_id)
    .single()

  if (existing) return res.json(existing)

  const { data, error } = await supabase
    .from('chat_rooms')
    .insert({ customer_id: req.user!.id, vendor_id, booking_id })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.get('/rooms/:roomId/messages', async (req, res) => {
  const { page = '1' } = req.query
  const limit = 50
  const offset = (parseInt(page as string) - 1) * limit

  const { data, error } = await supabase
    .from('messages')
    .select(`*, users(id, name, avatar_url)`)
    .eq('room_id', req.params.roomId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data?.reverse())
})

router.post('/rooms/:roomId/messages', async (req, res) => {
  const { content, type = 'text' } = req.body
  if (!content) return res.status(400).json({ error: 'content required' })

  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: req.params.roomId, sender_id: req.user!.id, content, type })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

export default router
