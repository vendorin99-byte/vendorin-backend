import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole, requireAdmin } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAdmin, requireAuth, requireRole('admin'))

router.get('/summary', async (req, res) => {
  const [customers, vendors, transactions] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('verified', true),
    supabase.from('transactions').select('amount').eq('status', 'paid'),
  ])

  const revenue = transactions.data?.reduce((sum, t) => sum + t.amount * 0.01, 0) || 0

  res.json({
    total_customers: customers.count || 0,
    total_vendors: vendors.count || 0,
    total_revenue_fee: revenue,
  })
})

router.get('/revenue', async (req, res) => {
  const { period = 'monthly' } = req.query
  const trunc = period === 'weekly' ? 'week' : 'month'

  const { data, error } = await supabase.rpc('revenue_by_period', { p_trunc: trunc })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
