import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!config.webhook.authSecret) {
    next();
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  if (token !== config.webhook.authSecret) {
    res.status(403).json({ error: 'Invalid authentication token' });
    return;
  }

  next();
}

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

  if (req.isAuthenticated && req.isAuthenticated()) {
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

  if (req.isAuthenticated && req.isAuthenticated()) {
    (req as any).authenticated = true;
  }

  next();
}
