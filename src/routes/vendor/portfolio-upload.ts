import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middlewares/auth'
import { requireRole } from '../../middlewares/roleCheck'
import { supabase } from '../../lib/supabase'

const router = Router()

router.use(requireAuth, requireRole('vendor'))

router.post('/upload', async (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || ''
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'multipart/form-data required' })
  }

  const chunks: Buffer[] = []
  let filename = `portfolio-${req.user!.vendorId}-${Date.now()}.jpg`
  let mimeType = 'image/jpeg'

  await new Promise<void>((resolve) => {
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', resolve)
  })

  const buffer = Buffer.concat(chunks)

  const { data, error } = await supabase.storage
    .from('portfolios')
    .upload(`${req.user!.vendorId}/${filename}`, buffer, { contentType: mimeType, upsert: false })

  if (error) return res.status(500).json({ error: error.message })

  const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(data.path)

  res.json({ url: urlData.publicUrl, path: data.path })
})

export default router
