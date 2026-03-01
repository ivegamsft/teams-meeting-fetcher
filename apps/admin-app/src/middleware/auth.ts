import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.webhook.authSecret) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Bearer token required' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== config.webhook.authSecret) {
    res.status(403).json({ error: 'Invalid bearer token' });
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

  if ((req as any).isAuthenticated?.()) {
    next();
    return;
  }

  if ((req.session as any)?.user) {
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required' });
}

/**
 * Global auth gate — protects ALL routes (static + API) except explicit exemptions.
 * Must be mounted AFTER /auth routes and BEFORE static file serving.
 */
export function globalAuth(req: Request, res: Response, next: NextFunction): void {
  // Health check — unprotected for ECS/ALB health probes
  if (req.path === '/health') {
    next();
    return;
  }

  // Webhook routes use their own Bearer token auth (webhookAuth middleware)
  if (req.path.startsWith('/api/webhooks')) {
    next();
    return;
  }

  // Auth status endpoint — needed by unauthenticated UI to check login state
  if (req.path === '/api/auth/status') {
    next();
    return;
  }

  // API key auth
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && apiKey === config.auth.apiKey) {
    next();
    return;
  }

  // Passport session auth
  if ((req as any).isAuthenticated?.()) {
    next();
    return;
  }

  // Express-session auth (Entra ID MSAL flow)
  if ((req.session as any)?.user) {
    next();
    return;
  }

  // Not authenticated — API routes get 401 JSON, everything else redirects to login
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  res.redirect('/auth/login');
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && apiKey === config.auth.apiKey) {
    (req as any).authenticated = true;
  }

  if ((req as any).isAuthenticated?.()) {
    (req as any).authenticated = true;
  }

  if ((req.session as any)?.user) {
    (req as any).authenticated = true;
  }

  next();
}
