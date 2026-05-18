import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM || 'VendorApp <onboarding@resend.dev>'

function getClient() {
  const key = process.env.RESEND_API_KEY
  if (!key || key === 'placeholder') return null
  return new Resend(key)
}

async function send(payload: Parameters<Resend['emails']['send']>[0]) {
  const client = getClient()
  if (!client) {
    console.log('[email] Resend not configured, skipping:', payload.subject)
    return
  }
  console.log('[email] Sending to:', payload.to, '| Subject:', payload.subject, '| From:', payload.from)
  const result = await client.emails.send(payload)
  if ((result as any).error) {
    console.error('[email] Resend error:', JSON.stringify((result as any).error))
  } else {
    console.log('[email] Sent OK, id:', (result as any).data?.id)
  }
  return result
}

export async function sendOTPEmail(to: string, name: string, otp: string) {
  return send({
    from: FROM, to,
    subject: `Kode Verifikasi VendorIn: ${otp}`,
    html: `<p>Halo ${name},</p><p>Kode OTP Anda: <strong>${otp}</strong></p><p>Berlaku 10 menit.</p>`,
  })
}

export async function sendVendorApprovedEmail(to: string, businessName: string) {
  return send({
    from: FROM, to,
    subject: 'Akun Vendor Anda Telah Disetujui ✅',
    html: `<p>Halo ${businessName},</p><p>Akun vendor Anda telah diverifikasi. Silakan login di vendorin.id/mitra</p>`,
  })
}

export async function sendVendorRejectedEmail(to: string, businessName: string, reason: string) {
  return send({
    from: FROM, to,
    subject: 'Dokumen Anda Perlu Diperbaiki',
    html: `<p>Halo ${businessName},</p><p>Dokumen Anda ditolak karena: <strong>${reason}</strong></p>`,
  })
}

export async function sendWithdrawalSuccessEmail(to: string, amount: number, bankLast4: string) {
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount)
  return send({
    from: FROM, to,
    subject: 'Pencairan Dana Berhasil',
    html: `<p>${formatted} berhasil dicairkan ke rekening ****${bankLast4}.</p>`,
  })
}

export async function sendWithdrawalFailedEmail(to: string, amount: number, reason: string) {
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount)
  return send({
    from: FROM, to,
    subject: 'Pencairan Dana Gagal',
    html: `<p>Pencairan ${formatted} gagal: ${reason}. Saldo telah dikembalikan ke dompet Anda.</p>`,
  })
}

export async function sendWelcomeCustomerEmail(to: string, name: string, otp: string) {
  return send({
    from: FROM, to,
    subject: `${otp} — Kode Verifikasi VendorApp`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#3B5BDB">Selamat datang di VendorApp, ${name}!</h2>
        <p>Masukkan kode OTP berikut untuk verifikasi akun Anda:</p>
        <div style="background:#EEF2FF;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#3B5BDB">${otp}</span>
        </div>
        <p style="color:#6B7280;font-size:13px">Kode berlaku 10 menit. Jangan bagikan kode ini kepada siapapun.</p>
      </div>`,
  })
}

export async function sendVendorWelcomeEmail(to: string, businessName: string) {
  const webUrl = process.env.FRONTEND_URL || 'https://web-henna-five-13.vercel.app'
  return send({
    from: FROM, to,
    subject: 'Pendaftaran Vendor VendorApp Diterima ✅',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#3B5BDB">Halo, ${businessName}!</h2>
        <p>Terima kasih telah mendaftar sebagai vendor di VendorApp.</p>
        <p>Dokumen Anda sedang dalam proses <strong>verifikasi oleh tim kami</strong> (1–2 hari kerja). Kami akan kirim email setelah akun Anda disetujui.</p>
        <a href="${webUrl}/mitra/login" style="display:inline-block;background:#3B5BDB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px">Cek Status di Dashboard</a>
      </div>`,
  })
}

export async function sendPasswordResetEmail(to: string, name: string, code: string) {
  return send({
    from: FROM, to,
    subject: `${code} — Kode Reset Password VendorApp`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#3B5BDB">Reset Password</h2>
        <p>Halo ${name}, masukkan kode berikut untuk reset password akun Anda:</p>
        <div style="background:#EEF2FF;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#3B5BDB">${code}</span>
        </div>
        <p style="color:#6B7280;font-size:13px">Kode berlaku 1 jam. Jika Anda tidak meminta reset password, abaikan email ini.</p>
      </div>`,
  })
}
