import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole, requireAdmin } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAdmin, requireAuth, requireRole('admin'))

router.get('/', async (req, res) => {
  const { status, from, to, page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('transactions')
    .select(`*, bookings(total_amount, vendor_id, customer_id)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status as string)
  if (from) query = query.gte('created_at', from as string)
  if (to) query = query.lte('created_at', to as string)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

export default router
