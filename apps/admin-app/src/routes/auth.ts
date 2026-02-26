import { Router, Request, Response } from 'express';
import { isEntraConfigured, getMsalClient, getRedirectUri, cryptoProvider, EntraUser } from '../middleware/entraAuth';
import { config } from '../config';

const router = Router();

router.get('/login', async (req: Request, res: Response) => {
  if (!isEntraConfigured()) {
    res.status(503).json({ error: 'Entra ID authentication not configured' });
    return;
  }

  try {
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = cryptoProvider.createNewGuid();

    (req.session as any).pkceCodes = { verifier, challenge };
    (req.session as any).authState = state;

    const authUrl = await getMsalClient()!.getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email'],
      redirectUri: getRedirectUri(),
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state,
    });

    res.redirect(authUrl);
  } catch (err: any) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Failed to initiate login' });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  await handleCallback(req, res);
});

router.post('/callback', async (req: Request, res: Response) => {
  await handleCallback(req, res);
});

async function handleCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.body?.code || req.query?.code;
    if (!code) {
      const error = req.body?.error_description || req.query?.error_description || 'No authorization code received';
      console.error('Auth callback error:', error);
      res.redirect('/auth/login-error?reason=' + encodeURIComponent(error as string));
      return;
    }

    const pkceCodes = (req.session as any).pkceCodes;
    const tokenResponse = await getMsalClient()!.acquireTokenByCode({
      code: code as string,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: getRedirectUri(),
      codeVerifier: pkceCodes?.verifier,
    });

    const claims = tokenResponse.idTokenClaims as any;
    const user: EntraUser = {
      oid: claims.oid || claims.sub || '',
      displayName: claims.name || '',
      email: claims.preferred_username || claims.email || '',
      upn: claims.preferred_username || claims.upn || '',
      groups: Array.isArray(claims.groups) ? claims.groups : [],
    };

    // Check admin group membership
    const adminGroupId = config.entra.adminGroupId;
    if (adminGroupId && !user.groups.includes(adminGroupId)) {
      console.warn(`Access denied for ${user.email} - not in admin group ${adminGroupId}`);
      req.session.destroy(() => {});
      res.status(403).send(`
        <!DOCTYPE html>
        <html><head><title>Access Denied</title>
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0}
        .box{text-align:center;padding:2rem;border:1px solid #333;border-radius:8px;max-width:500px}
        h1{color:#e74c3c;margin-bottom:.5rem}a{color:#3498db}</style></head>
        <body><div class="box"><h1>Access Denied</h1>
        <p>Your account <strong>${user.email}</strong> is not a member of the admin group.</p>
        <p>Contact your administrator to request access.</p>
        <p><a href="/auth/logout">Sign out</a></p></div></body></html>
      `);
      return;
    }

    (req.session as any).user = user;
    console.log(`User authenticated: ${user.displayName} (${user.email})`);
    res.redirect('/');
  } catch (err: any) {
    console.error('Auth callback failed:', err.message);
    res.redirect('/auth/login-error?reason=' + encodeURIComponent(err.message));
  }
}

router.get('/login-error', (req: Request, res: Response) => {
  const reason = req.query.reason || 'Authentication failed';
  res.status(401).json({ error: 'Authentication failed', details: reason });
});

router.get('/logout', (req: Request, res: Response) => {
  const tenantId = config.entra.tenantId;
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    const postLogoutUri = encodeURIComponent(req.protocol + '://' + req.get('host') + '/');
    res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogoutUri}`);
  });
});

router.get('/status', (req: Request, res: Response) => {
  const user = (req.session as any)?.user as EntraUser | undefined;
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
