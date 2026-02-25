import { ConfidentialClientApplication, Configuration, CryptoProvider } from '@azure/msal-node';
import { config } from '../config';

export interface EntraUser {
  oid: string;
  displayName: string;
  email: string;
  upn: string;
}

let msalClient: ConfidentialClientApplication | null = null;
let redirectUri = '';
const cryptoProvider = new CryptoProvider();

export async function initializeEntraAuth(): Promise<void> {
  const { tenantId, clientId, clientSecret, redirectUri: configuredUri } = config.entra;

  if (!tenantId || !clientId || !clientSecret) {
    console.error('Entra ID configuration missing: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and ENTRA_CLIENT_SECRET are required');
    return;
  }

  redirectUri = await discoverRedirectUri(configuredUri, config.port);

  const msalConfig: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
    system: {
      loggerOptions: {
        logLevel: 3, // Error only
      },
    },
  };

  msalClient = new ConfidentialClientApplication(msalConfig);
  console.log(`Entra ID MSAL authentication configured (redirect: ${redirectUri})`);
}

export function getMsalClient(): ConfidentialClientApplication | null {
  return msalClient;
}

export function getRedirectUri(): string {
  return redirectUri;
}

export function isEntraConfigured(): boolean {
  return msalClient !== null;
}

export { cryptoProvider };

async function discoverRedirectUri(configuredUri: string, port: number): Promise<string> {
  if (configuredUri) return configuredUri;

  try {
    const response = await fetch('http://checkip.amazonaws.com');
    const ip = (await response.text()).trim();
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      return `https://${ip}:${port}/auth/callback`;
    }
  } catch {
    // Fall through to default
  }
  return `https://localhost:${port}/auth/callback`;
}
