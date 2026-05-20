import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/', async (req, res) => {
  const { status = 'pending', page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('vendor_bank_accounts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status === 'pending') query = query.eq('is_verified', false)
  else if (status === 'verified') query = query.eq('is_verified', true)

  const { data: accounts, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  if (!accounts?.length) return res.json({ data: [], total: 0 })

  // Fetch vendor names
  const vendorIds = [...new Set(accounts.map((a: any) => a.vendor_id).filter(Boolean))]
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, business_name, user_id')
    .in('id', vendorIds)

  const userIds = (vendors || []).map((v: any) => v.user_id).filter(Boolean)
  const { data: users } = await supabase
    .from('users')
    .select('id, email, name')
    .in('id', userIds)

  const vendorMap = Object.fromEntries((vendors || []).map((v: any) => [v.id, v]))
  const userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]))

  const data = accounts.map((a: any) => ({
    ...a,
    account_number_masked: `****${a.account_number.slice(-4)}`,
    vendor: vendorMap[a.vendor_id]
      ? { ...vendorMap[a.vendor_id], user: userMap[vendorMap[a.vendor_id].user_id] }
      : null,
  }))

  res.json({ data, total: count })
})

router.patch('/:id/verify', async (req, res) => {
  const { error } = await supabase
    .from('vendor_bank_accounts')
    .update({ is_verified: true })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('admin_logs').insert({
    admin_id: req.user!.id,
    action: 'bank_account_verified',
    target_type: 'bank_account',
    target_id: req.params.id,
    ip_address: req.ip,
  })

  res.json({ message: 'Rekening berhasil diverifikasi' })
})

router.patch('/:id/reject', async (req, res) => {
  const { error } = await supabase
    .from('vendor_bank_accounts')
    .update({ is_verified: false })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Rekening ditolak' })
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('vendor_bank_accounts')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Rekening dihapus' })
})

export default router
