import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()
router.use(requireAuth, requireRole('customer'))

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, avatar_url, referral_code, affiliate_balance, created_at')
    .eq('id', req.user!.id)
    .single()

  if (error) return res.status(404).json({ error: 'User not found' })
  res.json(data)
})

router.put('/', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('users')
    .update(parsed.data)
    .eq('id', req.user!.id)
    .select('id, name, email, phone')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/change-password', async (req, res) => {
  const { old_password, new_password } = req.body
  if (!old_password || !new_password) return res.status(400).json({ error: 'old_password dan new_password wajib diisi' })
  if (new_password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' })

  const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user!.id).single()
  if (!user?.password_hash) return res.status(400).json({ error: 'Akun tidak menggunakan password' })

  const valid = await bcrypt.compare(old_password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Password lama salah' })

  const password_hash = await bcrypt.hash(new_password, 10)
  await supabase.from('users').update({ password_hash }).eq('id', req.user!.id)
  res.json({ message: 'Password berhasil diubah' })
})

// ── Affiliate ────────────────────────────────────────────────────────────────

router.get('/affiliate', async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('referral_code, affiliate_balance')
    .eq('id', req.user!.id)
    .single()

  const { data: referred, count: totalReferrals } = await supabase
    .from('users')
    .select('id', { count: 'exact' })
    .eq('referred_by', req.user!.id)

  const { data: txns } = await supabase
    .from('affiliate_transactions')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(20)

  res.json({
    referral_code: user?.referral_code,
    referral_link: `${process.env.FRONTEND_URL || 'https://web-henna-five-13.vercel.app'}/daftar?ref=${user?.referral_code}`,
    balance: user?.affiliate_balance || 0,
    total_referrals: totalReferrals || 0,
    transactions: txns || [],
  })
})

export default router
