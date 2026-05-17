import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('vendors')
    .select('wallet_balance, wallet_pending')
    .eq('id', req.user!.vendorId)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/ledger', async (req, res) => {
  const { type, page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('wallet_ledger')
    .select('*', { count: 'exact' })
    .eq('vendor_id', req.user!.vendorId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type) query = query.eq('type', type)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

export default router
