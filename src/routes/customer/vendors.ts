import { Router } from 'express'
import { supabase } from '../../lib/supabase'

const router = Router()

router.get('/', async (req, res) => {
  const { category, city, lat, lng, radius = '10', search, sort = 'rating', page = '1' } = req.query
  const limit = 20
  const offset = (parseInt(page as string) - 1) * limit

  let query = supabase
    .from('vendors')
    .select(`
      id, business_name, category, sub_categories, city, lat, lng,
      avg_rating, total_reviews, wallet_balance,
      subscription, verified,
      portfolios(image_url, sort_order),
      services(id, name, price, is_active)
    `)
    .eq('verified', true)
    .eq('is_active', true)
    .range(offset, offset + limit - 1)

  if (category) query = query.eq('category', category)
  if (city) query = query.ilike('city', `%${city}%`)
  if (search) query = query.ilike('business_name', `%${search}%`)
  if (sort === 'rating') query = query.order('avg_rating', { ascending: false })
  if (sort === 'price') query = query.order('services.price', { ascending: true })

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  res.json({ data, total: count, page: parseInt(page as string), limit })
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('vendors')
    .select(`
      *,
      portfolios(id, image_url, caption, sort_order),
      services(id, name, description, price, dp_percent, duration, is_active),
      reviews(id, rating, comment, created_at, users(name, avatar_url))
    `)
    .eq('id', req.params.id)
    .eq('verified', true)
    .single()

  if (error) return res.status(404).json({ error: 'Vendor not found' })
  res.json(data)
})

router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = '10', category } = req.query
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' })

  const { data, error } = await supabase.rpc('vendors_within_radius', {
    p_lat: parseFloat(lat as string),
    p_lng: parseFloat(lng as string),
    p_radius_km: parseFloat(radius as string),
    p_category: category || null,
  })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
