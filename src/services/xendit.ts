import { Invoice, Payout } from 'xendit-node'

const invoiceClient = new Invoice({ secretKey: process.env.XENDIT_API_KEY || 'xnd_development_placeholder' })
const payoutClient = new Payout({ secretKey: process.env.XENDIT_API_KEY || 'xnd_development_placeholder' })

export async function createInvoice(params: {
  externalId: string
  amount: number
  payerEmail: string
  description: string
  successRedirectUrl?: string
}) {
  return invoiceClient.createInvoice({
    data: {
      externalId: params.externalId,
      amount: params.amount,
      payerEmail: params.payerEmail,
      description: params.description,
      successRedirectUrl: params.successRedirectUrl,
      currency: 'IDR',
    },
  })
}

export async function createDisbursement(params: {
  externalId: string
  bankCode: string
  accountHolderName: string
  accountNumber: string
  description: string
  amount: number
}) {
  return payoutClient.createPayout({
    idempotencyKey: params.externalId,
    data: {
      referenceId: params.externalId,
      channelCode: params.bankCode,
      channelProperties: {
        accountHolderName: params.accountHolderName,
        accountNumber: params.accountNumber,
      },
      description: params.description,
      amount: params.amount,
      currency: 'IDR',
    },
  })
}

export function validateXenditWebhook(token: string): boolean {
  return token === process.env.XENDIT_WEBHOOK_TOKEN
}
