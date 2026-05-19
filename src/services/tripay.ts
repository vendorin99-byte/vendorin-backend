import crypto from 'crypto'
import axios from 'axios'

const SANDBOX = process.env.TRIPAY_SANDBOX !== 'false'
const BASE_URL = SANDBOX ? 'https://tripay.co.id/api-sandbox' : 'https://tripay.co.id/api'
const MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE || ''
const API_KEY = process.env.TRIPAY_API_KEY || ''
const PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY || ''

function signature(merchantRef: string, amount: number) {
  return crypto.createHmac('sha256', PRIVATE_KEY)
    .update(MERCHANT_CODE + merchantRef + amount)
    .digest('hex')
}

export async function createTransaction(params: {
  merchantRef: string
  amount: number
  customerName: string
  customerEmail: string
  customerPhone: string
  itemName: string
  channel?: string
}) {
  const expiredTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60

  const payload = {
    method: params.channel || 'QRIS',
    merchant_ref: params.merchantRef,
    amount: params.amount,
    customer_name: params.customerName,
    customer_email: params.customerEmail,
    customer_phone: params.customerPhone || '08000000000',
    order_items: [{ name: params.itemName, price: params.amount, quantity: 1 }],
    return_url: process.env.APP_URL ? `${process.env.APP_URL}/payment/success` : '',
    expired_time: expiredTime,
    signature: signature(params.merchantRef, params.amount),
  }

  const { data } = await axios.post(`${BASE_URL}/transaction/create`, payload, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })

  if (!data.success) throw new Error(data.message || 'Tripay error')
  return data.data as {
    reference: string
    merchant_ref: string
    payment_method: string
    payment_name: string
    checkout_url: string
    status: string
    amount: number
    fee_merchant: number
    fee_customer: number
    total_fee: number
    amount_received: number
    pay_code?: string
    pay_url?: string
    qr_url?: string
    expired_time: number
  }
}

export async function createDisbursement(params: {
  externalId: string
  bankCode: string
  accountNumber: string
  accountName: string
  amount: number
  note?: string
}) {
  const { data } = await axios.post(`${BASE_URL}/disbursement/request`, {
    uuid: params.externalId,
    bank_code: params.bankCode,
    bank_account_number: params.accountNumber,
    bank_account_name: params.accountName,
    amount: params.amount,
    note: params.note || 'VendorApp Disbursement',
  }, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })

  if (!data.success) throw new Error(data.message || 'Tripay disbursement error')
  return data.data as { uuid: string; status: string }
}

export function validateWebhookSignature(body: string, receivedSignature: string): boolean {
  const sig = crypto.createHmac('sha256', PRIVATE_KEY).update(body).digest('hex')
  return sig === receivedSignature
}
