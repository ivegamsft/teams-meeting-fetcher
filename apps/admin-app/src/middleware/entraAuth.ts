import passport from 'passport';
import { OIDCStrategy, IOIDCStrategyOptionWithRequest, IProfile } from 'passport-azure-ad';
import { config } from '../config';

export interface EntraUser {
  oid: string;
  displayName: string;
  email: string;
  upn: string;
}

export function initializeEntraAuth(): void {
  const { tenantId, clientId, clientSecret, redirectUri } = config.entra;

  if (!tenantId || !clientId || !clientSecret) {
    console.error('Entra ID configuration missing: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and ENTRA_CLIENT_SECRET are required');
    return;
  }

  // Auto-discover public IP for redirect URI when not explicitly configured
  discoverRedirectUri(redirectUri, config.port).then((resolvedRedirectUri) => {
    const options: IOIDCStrategyOptionWithRequest = {
      identityMetadata: `https://login.microsoftonline.com/${tenantId}/.well-known/openid-configuration`,
      clientID: clientId,
      clientSecret: clientSecret,
      responseType: 'code',
      responseMode: 'form_post',
      redirectUrl: resolvedRedirectUri,
      allowHttpForRedirectUrl: config.nodeEnv !== 'production',
      scope: ['openid', 'profile', 'email'],
      passReqToCallback: true,
    };

    const strategy = new OIDCStrategy(
      options,
      (req: any, iss: string, sub: string, profile: IProfile, accessToken: string, refreshToken: string, done: Function) => {
        const user: EntraUser = {
          oid: profile.oid || sub,
          displayName: profile.displayName || '',
          email: (profile._json?.email as string) || (profile._json?.preferred_username as string) || '',
          upn: (profile.upn as string) || (profile._json?.preferred_username as string) || '',
        };
        return done(null, user);
      }
    );

    passport.use(strategy);
    console.log(`Entra ID OIDC authentication configured (redirect: ${resolvedRedirectUri})`);
  });

  passport.serializeUser((user: any, done: Function) => {
    done(null, user);
  });

  passport.deserializeUser((user: any, done: Function) => {
    done(null, user);
  });
}

async function discoverRedirectUri(configuredUri: string, port: number): Promise<string> {
  if (configuredUri) return configuredUri;

  try {
    const response = await fetch('http://checkip.amazonaws.com');
    const ip = (await response.text()).trim();
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      return `http://${ip}:${port}/auth/callback`;
    }
  } catch {
    // Fall through to default
  }
  return `http://localhost:${port}/auth/callback`;
}

export function isEntraConfigured(): boolean {
  const { tenantId, clientId, clientSecret } = config.entra;
  return !!(tenantId && clientId && clientSecret);
}
