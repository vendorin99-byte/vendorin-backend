import { Request, Response, NextFunction } from 'express'
import { UserRole } from '../types'

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const whitelist = (process.env.ADMIN_IP_WHITELIST || '').split(',')
  const ip = req.ip || req.socket.remoteAddress || ''
  if (!whitelist.includes(ip)) {
    return res.status(403).json({ error: 'Access denied' })
  }
  next()
}
