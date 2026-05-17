import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole, requireAdmin } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAdmin, requireAuth, requireRole('admin'))

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

export default router
