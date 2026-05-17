import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

const serviceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  dp_percent: z.number().min(20).max(50).default(30),
  duration: z.string().optional(),
})

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('vendor_id', req.user!.vendorId)
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('services')
    .insert({ ...parsed.data, vendor_id: req.user!.vendorId })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const parsed = serviceSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('services')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('vendor_id', req.user!.vendorId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', req.params.id)
    .eq('vendor_id', req.user!.vendorId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Deleted' })
})

export default router
