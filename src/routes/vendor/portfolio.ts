import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('vendor_id', req.user!.vendorId)
    .order('sort_order')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { image_url, caption } = req.body
  if (!image_url) return res.status(400).json({ error: 'image_url required' })

  const { data: vendor } = await supabase.from('vendors').select('subscription').eq('id', req.user!.vendorId).single()
  const { count } = await supabase.from('portfolios').select('*', { count: 'exact', head: true }).eq('vendor_id', req.user!.vendorId)

  const isProPlus = vendor?.subscription && ['pro', 'premium', 'enterprise'].includes(vendor.subscription)
  if (!isProPlus && (count || 0) >= 20) {
    return res.status(403).json({ error: 'Upgrade to Pro for unlimited photos' })
  }

  const { data, error } = await supabase
    .from('portfolios')
    .insert({ vendor_id: req.user!.vendorId, image_url, caption, sort_order: count || 0 })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const { caption } = req.body
  const { data, error } = await supabase
    .from('portfolios')
    .update({ caption })
    .eq('id', req.params.id)
    .eq('vendor_id', req.user!.vendorId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', req.params.id)
    .eq('vendor_id', req.user!.vendorId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Deleted' })
})

export default router
