import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

const bankSchema = z.object({
  bank_code: z.string(),
  account_number: z.string().min(6),
  account_name: z.string().min(3),
})

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('vendor_bank_accounts')
    .select('id, bank_code, account_number, account_name, is_default, is_verified')
    .eq('vendor_id', req.user!.vendorId)

  if (error) return res.status(500).json({ error: error.message })

  const masked = data?.map(b => ({
    ...b,
    account_number: `****${b.account_number.slice(-4)}`,
  }))

  res.json(masked)
})

router.post('/', async (req, res) => {
  const parsed = bankSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('vendor_bank_accounts')
    .insert({ ...parsed.data, vendor_id: req.user!.vendorId, is_verified: false })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ...data, account_number: `****${data.account_number.slice(-4)}` })
})

router.patch('/:id/default', async (req, res) => {
  await supabase.from('vendor_bank_accounts').update({ is_default: false }).eq('vendor_id', req.user!.vendorId)

  const { error } = await supabase
    .from('vendor_bank_accounts')
    .update({ is_default: true })
    .eq('id', req.params.id)
    .eq('vendor_id', req.user!.vendorId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Default updated' })
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('vendor_bank_accounts')
    .delete()
    .eq('id', req.params.id)
    .eq('vendor_id', req.user!.vendorId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Deleted' })
})

export default router
