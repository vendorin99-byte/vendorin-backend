import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/auth'
import vendorRoutes from './routes/customer/vendors'
import bookingRoutes from './routes/customer/bookings'
import orderRoutes from './routes/vendor/orders'
import serviceRoutes from './routes/vendor/services'
import portfolioRoutes from './routes/vendor/portfolio'
import portfolioUploadRoutes from './routes/vendor/portfolio-upload'
import vendorProfileRoutes from './routes/vendor/profile'
import walletRoutes from './routes/vendor/wallet'
import withdrawalRoutes from './routes/vendor/withdrawals'
import bankAccountRoutes from './routes/vendor/bank-accounts'
import chatRoutes from './routes/shared/chat'
import adminDisputeRoutes from './routes/admin/disputes'
import adminVerificationRoutes from './routes/admin/verification'
import adminWithdrawalRoutes from './routes/admin/withdrawals'
import adminUserRoutes from './routes/admin/users'
import adminTransactionRoutes from './routes/admin/transactions'
import adminReportRoutes from './routes/admin/reports'
import xenditWebhookRoutes from './routes/webhooks/xendit'

const app = express()
const PORT = process.env.PORT || 4000

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }))
app.use(express.json())

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use(limiter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api/auth', authRoutes)
app.use('/api/vendors', vendorRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/vendor/orders', orderRoutes)
app.use('/api/vendor/services', serviceRoutes)
app.use('/api/vendor/portfolio', portfolioRoutes)
app.use('/api/vendor/portfolio', portfolioUploadRoutes)
app.use('/api/vendor/profile', vendorProfileRoutes)
app.use('/api/vendor/wallet', walletRoutes)
app.use('/api/vendor/withdrawals', withdrawalRoutes)
app.use('/api/vendor/bank-accounts', bankAccountRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/admin/disputes', adminDisputeRoutes)
app.use('/api/admin/verification', adminVerificationRoutes)
app.use('/api/admin/withdrawals', adminWithdrawalRoutes)
app.use('/api/admin/users', adminUserRoutes)
app.use('/api/admin/transactions', adminTransactionRoutes)
app.use('/api/admin/reports', adminReportRoutes)
app.use('/api/webhooks/xendit', xenditWebhookRoutes)

app.listen(PORT, () => {
  console.log(`VendorIn backend running on port ${PORT}`)
})

export default app
