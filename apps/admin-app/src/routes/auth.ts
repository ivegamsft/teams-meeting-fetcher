import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { isEntraConfigured, EntraUser } from '../middleware/entraAuth';

const router = Router();

router.get('/login', (req: Request, res: Response, next: NextFunction) => {
  if (!isEntraConfigured()) {
    res.status(503).json({ error: 'Entra ID authentication not configured' });
    return;
  }
  passport.authenticate('azuread-openidconnect', {
    failureRedirect: '/auth/login-error',
  } as any)(req, res, next);
});

router.post('/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('azuread-openidconnect', {
      failureRedirect: '/auth/login-error',
    } as any)(req, res, next);
  },
  (req: Request, res: Response) => {
    res.redirect('/');
  }
);

router.get('/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('azuread-openidconnect', {
      failureRedirect: '/auth/login-error',
    } as any)(req, res, next);
  },
  (req: Request, res: Response) => {
    res.redirect('/');
  }
);

router.get('/login-error', (req: Request, res: Response) => {
  res.status(401).json({ error: 'Authentication failed. Please try again.' });
});

router.get('/logout', (req: Request, res: Response) => {
  const user = req.user as EntraUser | undefined;
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error('Session destroy error:', sessionErr);
      }
      const tenantId = require('../config').config.entra.tenantId;
      const postLogoutUri = encodeURIComponent(req.protocol + '://' + req.get('host') + '/');
      res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogoutUri}`);
    });
  });
});

router.get('/status', (req: Request, res: Response) => {
  const user = req.user as EntraUser | undefined;
  if (user) {
    res.json({
      authenticated: true,
      user: {
        displayName: user.displayName,
        email: user.email || user.upn,
      },
    });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;
