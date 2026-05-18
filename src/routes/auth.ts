import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { supabase } from '../lib/supabase'
import {
  sendWelcomeCustomerEmail,
  sendVendorWelcomeEmail,
  sendPasswordResetEmail,
} from '../services/email'

const router = Router()

function signToken(payload: object) {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30d' })
}

function generateReferralCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// ── Customer register ────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(2),
    phone: z.string().optional(),
    password: z.string().min(8),
    ref: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { email, name, phone, password, ref } = parsed.data

  const { data: existing } = await supabase.from('users').select('id, is_verified').eq('email', email).maybeSingle()
  if (existing) {
    if (!existing.is_verified) return res.status(400).json({ error: 'Email sudah terdaftar tapi belum diverifikasi. Gunakan tombol "Kirim Ulang OTP".' })
    return res.status(400).json({ error: 'Email sudah terdaftar' })
  }

  let referred_by: string | null = null
  if (ref) {
    const { data: referrer } = await supabase.from('users').select('id').eq('referral_code', ref).maybeSingle()
    if (referrer) referred_by = referrer.id
  }

  const password_hash = await bcrypt.hash(password, 10)
  const referral_code = generateReferralCode()

  const { error } = await supabase.from('users').insert({
    email, name, phone, role: 'customer',
    password_hash, is_verified: false,
    referral_code, referred_by,
  })

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Email sudah terdaftar' })
    return res.status(400).json({ error: error.message })
  }

  // Generate & store OTP
  const otp = generateOTP()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await supabase.from('user_otps').upsert({ email, otp, expires_at }, { onConflict: 'email' })

  // Send email (fire & forget)
  sendWelcomeCustomerEmail(email, name, otp).catch(console.error)

  res.json({ message: 'OTP dikirim ke email Anda' })
})

// ── Vendor register ──────────────────────────────────────────────────────────
router.post('/register-vendor', async (req, res) => {
  const { business_name, name, email, phone, category, city, password } = req.body

  if (!email || !password || !business_name || !name || !category) {
    return res.status(400).json({ error: 'Semua field wajib diisi' })
  }

  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
  if (existing) return res.status(400).json({ error: 'Email sudah terdaftar' })

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

  // Send welcome email
  sendVendorWelcomeEmail(email, business_name).catch(console.error)

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

// ── Verify OTP ───────────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body
  if (!email || !otp) return res.status(400).json({ error: 'Email dan OTP wajib diisi' })

  const { data: record } = await supabase
    .from('user_otps').select('*').eq('email', email).single()

  if (!record) return res.status(400).json({ error: 'OTP tidak ditemukan, minta kirim ulang' })
  if (record.otp !== otp) return res.status(400).json({ error: 'Kode OTP salah' })
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'Kode OTP sudah kadaluarsa' })

  await supabase.from('users').update({ is_verified: true }).eq('email', email)
  await supabase.from('user_otps').delete().eq('email', email)

  const { data: user } = await supabase.from('users').select('*').eq('email', email).single()
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' })

  const token = signToken({ id: user.id, email: user.email, role: user.role, vendorId: user.vendor_id })
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
})

// ── Resend OTP ────────────────────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email wajib diisi' })

  const { data: user } = await supabase.from('users').select('name, is_verified').eq('email', email).single()
  if (!user) return res.status(404).json({ error: 'Email tidak ditemukan' })
  if (user.is_verified) return res.status(400).json({ error: 'Akun sudah terverifikasi' })

  const otp = generateOTP()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await supabase.from('user_otps').upsert({ email, otp, expires_at }, { onConflict: 'email' })

  sendWelcomeCustomerEmail(email, user.name, otp).catch(console.error)
  res.json({ message: 'OTP dikirim ulang' })
})

// ── Forgot password (kirim kode 6 digit ke email) ────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email wajib diisi' })

  const { data: user } = await supabase.from('users').select('id, name').eq('email', email).single()
  if (!user) return res.json({ message: 'Jika email terdaftar, kode reset akan dikirim' })

  const code = generateOTP()
  const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  await supabase.from('password_resets').upsert(
    { user_id: user.id, token: code, expires_at, used: false },
    { onConflict: 'user_id' }
  )

  sendPasswordResetEmail(email, user.name, code).catch(console.error)
  res.json({ message: 'Kode reset dikirim ke email Anda' })
})

// ── Reset password (pakai kode 6 digit + email) ───────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { email, code, password } = req.body
  if (!email || !code || !password) return res.status(400).json({ error: 'Email, kode, dan password wajib diisi' })
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' })

  const { data: user } = await supabase.from('users').select('id').eq('email', email).single()
  if (!user) return res.status(400).json({ error: 'Email tidak ditemukan' })

  const { data: record } = await supabase
    .from('password_resets').select('*')
    .eq('user_id', user.id).eq('token', code).eq('used', false).single()

  if (!record) return res.status(400).json({ error: 'Kode tidak valid atau sudah digunakan' })
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'Kode sudah kadaluarsa, minta ulang' })

  const password_hash = await bcrypt.hash(password, 10)
  await supabase.from('users').update({ password_hash }).eq('id', user.id)
  await supabase.from('password_resets').update({ used: true }).eq('user_id', user.id)

  res.json({ message: 'Password berhasil diubah' })
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
