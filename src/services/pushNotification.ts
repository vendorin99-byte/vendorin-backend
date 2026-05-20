import axios from 'axios'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export async function sendPushNotification(params: {
  to: string | string[]
  title: string
  body: string
  data?: Record<string, any>
}) {
  const tokens = Array.isArray(params.to) ? params.to : [params.to]
  const validTokens = tokens.filter((t) => t?.startsWith('ExponentPushToken[') || t?.startsWith('ExpoPushToken['))
  if (!validTokens.length) return

  const messages = validTokens.map((token) => ({
    to: token,
    title: params.title,
    body: params.body,
    data: params.data || {},
    sound: 'default',
    priority: 'high',
  }))

  try {
    await axios.post(EXPO_PUSH_URL, messages, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    })
  } catch (e: any) {
    console.error('[push] Error:', e.message)
  }
}
