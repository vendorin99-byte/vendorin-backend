import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('vendors')
    .select('*, users(email, name, phone)')
    .eq('id', req.user!.vendorId)
    .single()

  if (error) return res.status(404).json({ error: 'Vendor not found' })
  res.json(data)
})

const profileSchema = z.object({
  business_name: z.string().min(2).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  whatsapp: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  operating_hours: z.record(z.string()).optional(),
})

router.put('/', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('vendors')
    .update(parsed.data)
    .eq('id', req.user!.vendorId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
