import { Router } from 'express'
import bcrypt from 'bcrypt'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/', async (req, res) => {
  const { role, search, page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('users')
    .select('id, name, email, phone, role, is_active, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (role) query = query.eq('role', role as string)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

router.patch('/:id/suspend', async (req, res) => {
  const { error } = await supabase.from('users').update({ is_active: false }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  await supabase.from('admin_logs').insert({ admin_id: req.user!.id, action: 'user_suspended', target_type: 'user', target_id: req.params.id, ip_address: req.ip })
  res.json({ message: 'User suspended' })
})

router.patch('/:id/activate', async (req, res) => {
  const { error } = await supabase.from('users').update({ is_active: true }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'User activated' })
})

router.patch('/:id/reset-password', async (req, res) => {
  const { password } = req.body
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' })
  const password_hash = await bcrypt.hash(password, 10)
  const { error } = await supabase.from('users').update({ password_hash }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Password berhasil direset' })
})

router.patch('/:id/location', async (req, res) => {
  const { lat, lng } = req.body
  if (!lat || !lng) return res.status(400).json({ error: 'Lat dan lng wajib diisi' })
  const { data: user } = await supabase.from('users').select('vendor_id').eq('id', req.params.id).single()
  if (!user?.vendor_id) return res.status(404).json({ error: 'Vendor tidak ditemukan' })
  const { error } = await supabase.from('vendors').update({ lat, lng }).eq('id', user.vendor_id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Lokasi berhasil diupdate' })
})

export default router
