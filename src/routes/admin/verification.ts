import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'
import { sendVendorApprovedEmail, sendVendorRejectedEmail } from '../../services/email'

const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/', async (req, res) => {
  const { status = 'pending', page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('vendors')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status === 'approved') {
    query = query.eq('verified', true)
  } else if (status === 'rejected') {
    query = query.not('rejected_reason', 'is', null)
  } else {
    // pending: verified is false or null, and no rejected_reason
    query = query.or('verified.eq.false,verified.is.null').is('rejected_reason', null)
  }

  const { data: vendors, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  if (!vendors?.length) return res.json({ data: [], total: 0 })

  const userIds = vendors.map((v: any) => v.user_id).filter(Boolean)
  const { data: users } = await supabase
    .from('users')
    .select('id, email, name')
    .in('id', userIds)

  const userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]))
  const data = vendors.map((v: any) => ({ ...v, users: userMap[v.user_id] || null }))

  res.json({ data, total: count })
})

router.get('/:id', async (req, res) => {
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error || !vendor) return res.status(404).json({ error: 'Not found' })

  const { data: user } = await supabase
    .from('users')
    .select('email, name, phone')
    .eq('id', vendor.user_id)
    .single()

  const [ktpSigned, nibSigned] = await Promise.all([
    vendor.ktp_url ? supabase.storage.from('private-docs').createSignedUrl(vendor.ktp_url, 3600) : null,
    vendor.nib_url ? supabase.storage.from('private-docs').createSignedUrl(vendor.nib_url, 3600) : null,
  ])

  res.json({
    ...vendor,
    users: user,
    ktp_signed_url: ktpSigned?.data?.signedUrl,
    nib_signed_url: nibSigned?.data?.signedUrl,
  })
})

router.post('/:id/approve', async (req, res) => {
  const { data: vendor, error } = await supabase
    .from('vendors')
    .update({ verified: true, verified_at: new Date().toISOString(), verified_by: req.user!.id, rejected_reason: null })
    .eq('id', req.params.id)
    .select('*')
    .single()

  if (error || !vendor) return res.status(404).json({ error: 'Not found' })

  const { data: user } = await supabase.from('users').select('email').eq('id', vendor.user_id).single()

  await supabase.from('admin_logs').insert({
    admin_id: req.user!.id,
    action: 'vendor_approved',
    target_type: 'vendor',
    target_id: req.params.id,
    ip_address: req.ip,
  })

  if (user?.email) await sendVendorApprovedEmail(user.email, vendor.business_name)
  res.json({ message: 'Vendor approved' })
})

router.post('/:id/reject', async (req, res) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ error: 'reason required' })

  const { data: vendor, error } = await supabase
    .from('vendors')
    .update({ verified: false, rejected_reason: reason })
    .eq('id', req.params.id)
    .select('*')
    .single()

  if (error || !vendor) return res.status(404).json({ error: 'Not found' })

  const { data: user } = await supabase.from('users').select('email').eq('id', vendor.user_id).single()

  await supabase.from('admin_logs').insert({
    admin_id: req.user!.id,
    action: 'vendor_rejected',
    target_type: 'vendor',
    target_id: req.params.id,
    ip_address: req.ip,
    notes: reason,
  })

  if (user?.email) await sendVendorRejectedEmail(user.email, vendor.business_name, reason)
  res.json({ message: 'Vendor rejected' })
})

export default router
