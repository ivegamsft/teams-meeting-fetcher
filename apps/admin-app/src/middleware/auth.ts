import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function dashboardAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/auth/status' || req.path === '/health') {
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && apiKey === config.auth.apiKey) {
    next();
    return;
  }

  if ((req.session as any)?.user) {
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required' });
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && apiKey === config.auth.apiKey) {
    (req as any).authenticated = true;
  }

  if ((req.session as any)?.user) {
    (req as any).authenticated = true;
  }

  next();
}
