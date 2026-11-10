import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { createHmac, timingSafeEqual } from 'crypto';

export const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION ?? '202609';
export const SCOPES = ['w_organization_social', 'r_organization_social', 'rw_organization_admin'];

const SECRETS = {
  clientId: 'linkedin-client-id',
  clientSecret: 'linkedin-client-secret',
  access: 'linkedin-access-token',
  refresh: 'linkedin-refresh-token',
  accessExp: 'linkedin-access-expires-at',
  refreshExp: 'linkedin-refresh-expires-at',
  orgUrn: 'linkedin-org-urn',
} as const;

let client: SecretClient | undefined;
function kv(): SecretClient {
  const url = process.env.KEY_VAULT_URL;
  if (!url) throw new Error('KEY_VAULT_URL is not configured.');
  return (client ??= new SecretClient(url, new DefaultAzureCredential()));
}

async function get(name: string): Promise<string | undefined> {
  try {
    return (await kv().getSecret(name)).value;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return undefined;
    throw err;
  }
}

export const getOrgUrn = () => get(SECRETS.orgUrn);
export const setOrgUrn = (urn: string) => kv().setSecret(SECRETS.orgUrn, urn);

export function redirectUri(): string {
  return process.env.LINKEDIN_REDIRECT_URI ?? 'https://flowintelli-carousel.azurewebsites.net/api/linkedinCallback';
}

async function credentials() {
  const [id, secret] = await Promise.all([get(SECRETS.clientId), get(SECRETS.clientSecret)]);
  if (!id || !secret) throw new Error('linkedin-client-id / linkedin-client-secret are missing from Key Vault.');
  return { id, secret };
}

export async function authorizeUrl(): Promise<string> {
  const { id } = await credentials();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    redirect_uri: redirectUri(),
    state: signState(),
    scope: SCOPES.join(' '),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

function sign(ts: string): string {
  return createHmac('sha256', process.env.CAROUSEL_API_KEY ?? '').update(ts).digest('hex');
}

export function signState(): string {
  const ts = Date.now().toString();
  return `${ts}.${sign(ts)}`;
}

/** State is valid for 10 minutes and must carry our HMAC (CSRF protection). */
export function verifyState(state: string | null): boolean {
  if (!state) return false;
  const [ts, mac] = state.split('.');
  if (!ts || !mac || Date.now() - Number(ts) > 10 * 60 * 1000) return false;
  const expected = Buffer.from(sign(ts));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

async function tokenRequest(form: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = await credentials();
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...form, client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new Error(`LinkedIn token endpoint ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

async function save(t: TokenResponse): Promise<void> {
  const now = Date.now();
  const writes = [
    kv().setSecret(SECRETS.access, t.access_token),
    kv().setSecret(SECRETS.accessExp, String(now + t.expires_in * 1000)),
  ];
  if (t.refresh_token) {
    writes.push(kv().setSecret(SECRETS.refresh, t.refresh_token));
    if (t.refresh_token_expires_in) {
      writes.push(kv().setSecret(SECRETS.refreshExp, String(now + t.refresh_token_expires_in * 1000)));
    }
  }
  await Promise.all(writes);
}

export async function exchangeCode(code: string): Promise<void> {
  await save(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() }));
}

export async function refreshTokens(): Promise<void> {
  const refresh = await get(SECRETS.refresh);
  if (!refresh) throw new Error('No LinkedIn refresh token stored. Run /api/linkedinAuth first.');
  await save(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh }));
}

export interface TokenStatus {
  hasAccess: boolean;
  accessExpiresAt?: number;
  refreshExpiresAt?: number;
}

export async function tokenStatus(): Promise<TokenStatus> {
  const [access, accessExp, refreshExp] = await Promise.all([
    get(SECRETS.access),
    get(SECRETS.accessExp),
    get(SECRETS.refreshExp),
  ]);
  return {
    hasAccess: !!access,
    accessExpiresAt: accessExp ? Number(accessExp) : undefined,
    refreshExpiresAt: refreshExp ? Number(refreshExp) : undefined,
  };
}

/** Returns a valid access token, refreshing it first if it expires within a day. */
export async function getAccessToken(): Promise<string> {
  const status = await tokenStatus();
  if (!status.hasAccess) throw new Error('LinkedIn is not authorized. Open /api/linkedinAuth first.');
  if (status.accessExpiresAt && status.accessExpiresAt - Date.now() < 24 * 60 * 60 * 1000) {
    await refreshTokens();
  }
  const token = await get(SECRETS.access);
  if (!token) throw new Error('LinkedIn access token missing after refresh.');
  return token;
}

export function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Linkedin-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

export async function listAdminOrgs(token: string): Promise<string[]> {
  const res = await fetch(
    'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
    { headers: apiHeaders(token) },
  );
  if (!res.ok) throw new Error(`organizationAcls ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { elements?: { organization: string }[] };
  return (data.elements ?? []).map(e => e.organization);
}
