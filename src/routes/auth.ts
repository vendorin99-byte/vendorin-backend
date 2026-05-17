import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { supabase } from '../lib/supabase'

const router = Router()

function signToken(payload: object) {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30d' })
}

// ── Customer register (OTP-based, no password) ──────────────────────────────
router.post('/register', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(2),
    phone: z.string().optional(),
    password: z.string().min(8),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { email, name, phone, password } = parsed.data
  const password_hash = await bcrypt.hash(password, 10)

  const { error } = await supabase.from('users').insert({
    email, name, phone, role: 'customer',
    password_hash, is_verified: true,
  })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Akun berhasil dibuat' })
})

// ── Vendor register ──────────────────────────────────────────────────────────
router.post('/register-vendor', async (req, res) => {
  const { business_name, name, email, phone, category, city, password } = req.body

  if (!email || !password || !business_name || !name || !category) {
    return res.status(400).json({ error: 'Semua field wajib diisi' })
  }

  const existing = await supabase.from('users').select('id').eq('email', email).single()
  if (existing.data) return res.status(400).json({ error: 'Email sudah terdaftar' })

  const password_hash = await bcrypt.hash(password, 10)

  // Create user first
  const { data: user, error: userErr } = await supabase.from('users').insert({
    email, name, phone, role: 'vendor', password_hash, is_verified: false,
  }).select().single()

  if (userErr || !user) return res.status(500).json({ error: userErr?.message || 'Gagal membuat akun' })

  // Create vendor profile
  const { data: vendor, error: vendorErr } = await supabase.from('vendors').insert({
    user_id: user.id,
    business_name,
    category,
    city,
  }).select().single()

  if (vendorErr || !vendor) return res.status(500).json({ error: vendorErr?.message || 'Gagal membuat profil vendor' })

  // Link vendor_id back to user
  await supabase.from('users').update({ vendor_id: vendor.id }).eq('id', user.id)

  res.status(201).json({ message: 'Pendaftaran berhasil, menunggu verifikasi admin' })
})

// ── Login (admin, vendor, customer) ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' })

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !user) return res.status(401).json({ error: 'Email atau password salah' })
  if (!user.password_hash) return res.status(401).json({ error: 'Akun ini tidak menggunakan login password' })

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Email atau password salah' })

  if (!user.is_active) return res.status(403).json({ error: 'Akun dinonaktifkan' })

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    vendorId: user.vendor_id,
  })

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  })
})

// ── Create admin account (one-time setup, hanya dari localhost) ───────────────
router.post('/setup-admin', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || ''
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  if (!isLocal) return res.status(403).json({ error: 'Forbidden' })

  const { email, password, name } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email dan password wajib' })

  const password_hash = await bcrypt.hash(password, 10)
  const { error } = await supabase.from('users').upsert({
    email, name: name || 'Admin', role: 'admin',
    password_hash, is_verified: true, is_active: true,
  }, { onConflict: 'email' })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Admin account created/updated' })
})

export default router
