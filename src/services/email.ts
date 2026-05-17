import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'VendorIn <noreply@vendorin.id>'

export async function sendOTPEmail(to: string, name: string, otp: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Kode Verifikasi VendorIn: ${otp}`,
    html: `<p>Halo ${name},</p><p>Kode OTP Anda: <strong>${otp}</strong></p><p>Berlaku 10 menit.</p>`,
  })
}

export async function sendVendorApprovedEmail(to: string, businessName: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Akun Vendor Anda Telah Disetujui ✅',
    html: `<p>Halo ${businessName},</p><p>Akun vendor Anda telah diverifikasi. Silakan login di vendorin.id/mitra</p>`,
  })
}

export async function sendVendorRejectedEmail(to: string, businessName: string, reason: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Dokumen Anda Perlu Diperbaiki',
    html: `<p>Halo ${businessName},</p><p>Dokumen Anda ditolak karena: <strong>${reason}</strong></p><p>Silakan upload ulang.</p>`,
  })
}

export async function sendWithdrawalSuccessEmail(to: string, amount: number, bankLast4: string) {
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount)
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Pencairan Dana Berhasil',
    html: `<p>${formatted} berhasil dicairkan ke rekening ****${bankLast4}.</p>`,
  })
}

export async function sendWithdrawalFailedEmail(to: string, amount: number, reason: string) {
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount)
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Pencairan Dana Gagal',
    html: `<p>Pencairan ${formatted} gagal: ${reason}. Saldo telah dikembalikan ke dompet Anda.</p>`,
  })
}
