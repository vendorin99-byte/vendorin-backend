import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole, requireAdmin } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'
import { sendVendorApprovedEmail, sendVendorRejectedEmail } from '../../services/email'

const router = Router()

router.use(requireAdmin, requireAuth, requireRole('admin'))

router.get('/', async (req, res) => {
  const { status = 'pending', page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  const filter = status === 'all' ? {} : { verified: status === 'approved', rejected_reason: status === 'rejected' ? 'not.is.null' : undefined }

  const { data, error, count } = await supabase
    .from('vendors')
    .select('*, users(email, name)', { count: 'exact' })
    .eq('verified', status === 'approved')
    .is('rejected_reason', status === 'pending' ? null : undefined)
    .range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('vendors')
    .select('*, users(email, name, phone)')
    .eq('id', req.params.id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Not found' })

  const ktpSignedUrl = data.ktp_url
    ? await supabase.storage.from('private-docs').createSignedUrl(data.ktp_url, 3600)
    : null

  res.json({ ...data, ktp_signed_url: ktpSignedUrl?.data?.signedUrl })
})

router.post('/:id/approve', async (req, res) => {
  const { data: vendor, error } = await supabase
    .from('vendors')
    .update({ verified: true, verified_at: new Date().toISOString(), verified_by: req.user!.id, rejected_reason: null })
    .eq('id', req.params.id)
    .select('*, users(email, name)')
    .single()

  if (error || !vendor) return res.status(404).json({ error: 'Not found' })

  await supabase.from('admin_logs').insert({
    admin_id: req.user!.id,
    action: 'vendor_approved',
    target_type: 'vendor',
    target_id: req.params.id,
    ip_address: req.ip,
  })

  await sendVendorApprovedEmail((vendor as any).users.email, vendor.business_name)
  res.json({ message: 'Vendor approved' })
})

router.post('/:id/reject', async (req, res) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ error: 'reason required' })

  const { data: vendor, error } = await supabase
    .from('vendors')
    .update({ verified: false, rejected_reason: reason })
    .eq('id', req.params.id)
    .select('*, users(email, name)')
    .single()

  if (error || !vendor) return res.status(404).json({ error: 'Not found' })

  await supabase.from('admin_logs').insert({
    admin_id: req.user!.id,
    action: 'vendor_rejected',
    target_type: 'vendor',
    target_id: req.params.id,
    ip_address: req.ip,
    notes: reason,
  })

  await sendVendorRejectedEmail((vendor as any).users.email, vendor.business_name, reason)
  res.json({ message: 'Vendor rejected' })
})

export default router
