import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from '@azure/functions';
import {
  authorizeUrl, exchangeCode, getAccessToken, getOrgUrn, listAdminOrgs, refreshTokens, setOrgUrn,
  tokenStatus, verifyState,
} from '../linkedin/tokens';
import { createDocumentPost, createOrgComment, deletePost, uploadDocument } from '../linkedin/publish';

const json = (status: number, body: unknown): HttpResponseInit => ({
  status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const authorized = (req: HttpRequest) => {
  const key = req.headers.get('x-api-key') ?? req.query.get('key');
  return !!key && key === process.env.CAROUSEL_API_KEY;
};

/** Step 1 of the one-time consent: redirects the admin to LinkedIn. */
app.http('linkedinAuth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (req): Promise<HttpResponseInit> => {
    if (!authorized(req)) return json(401, { error: 'Unauthorized' });
    return { status: 302, headers: { Location: await authorizeUrl() } };
  },
});

/** Step 2: LinkedIn redirects here with ?code. Stores tokens in Key Vault and lists admin pages. */
app.http('linkedinCallback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (req, context): Promise<HttpResponseInit> => {
    const error = req.query.get('error');
    if (error) return json(400, { error, description: req.query.get('error_description') });
    const code = req.query.get('code');
    if (!code || !verifyState(req.query.get('state'))) return json(400, { error: 'Invalid or expired state/code' });

    try {
      await exchangeCode(code);
      const orgs = await listAdminOrgs(await getAccessToken()).catch(err => {
        context.warn('organizationAcls failed:', err);
        return [] as string[];
      });
      if (orgs.length === 1 && !(await getOrgUrn())) await setOrgUrn(orgs[0]);
      return json(200, {
        message: 'LinkedIn connected. Tokens stored in Key Vault.',
        adminOrganizations: orgs,
        next: orgs.length === 1
          ? 'Organization saved automatically.'
          : 'Store the right URN with: az keyvault secret set --vault-name <kv> --name linkedin-org-urn --value <urn>',
      });
    } catch (err) {
      context.error('linkedinCallback error:', err);
      return json(500, { error: (err as Error).message });
    }
  },
});

/** Daily refresh: renews the access token once it has under 15 days left. */
app.timer('linkedinTokenRefresh', {
  schedule: '0 0 6 * * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    const status = await tokenStatus();
    if (!status.hasAccess) return context.log('LinkedIn not connected; skipping refresh.');
    const daysLeft = status.accessExpiresAt ? (status.accessExpiresAt - Date.now()) / 86_400_000 : 0;
    if (daysLeft < 15) {
      await refreshTokens();
      context.log('LinkedIn tokens refreshed.');
    }
    const refreshDays = status.refreshExpiresAt ? (status.refreshExpiresAt - Date.now()) / 86_400_000 : undefined;
    if (refreshDays !== undefined && refreshDays < 30) {
      context.warn(`LinkedIn refresh token expires in ${refreshDays.toFixed(0)} days. Re-run /api/linkedinAuth.`);
    }
  },
});

/**
 * POST { pdf_base64, caption, title?, dryRun? } -> publishes a PDF carousel to the company page.
 * DELETE ?post=<urn> removes a post (used for testing).
 */
app.http('postLinkedIn', {
  methods: ['POST', 'DELETE'],
  authLevel: 'anonymous',
  handler: async (req, context): Promise<HttpResponseInit> => {
    if (!authorized(req)) return json(401, { error: 'Unauthorized' });
    try {
      const token = await getAccessToken();

      if (req.method === 'DELETE') {
        const post = req.query.get('post');
        if (!post) return json(400, { error: 'post query parameter required' });
        await deletePost(token, post);
        return json(200, { deleted: post });
      }

      const body = (await req.json()) as { pdf_base64?: string; caption?: string; title?: string; dryRun?: boolean; first_comment?: string };
      if (!body.pdf_base64 || !body.caption) return json(400, { error: 'pdf_base64 and caption are required' });
      const owner = await getOrgUrn();
      if (!owner) return json(409, { error: 'linkedin-org-urn is not set in Key Vault.' });

      const pdf = Buffer.from(body.pdf_base64, 'base64');
      if (pdf.length > 100 * 1024 * 1024) return json(413, { error: 'PDF exceeds LinkedIn 100MB limit' });
      if (body.dryRun) return json(200, { dryRun: true, owner, pdfBytes: pdf.length });

      const documentUrn = await uploadDocument(token, owner, pdf);
      const postUrn = await createDocumentPost(token, owner, body.caption, documentUrn, body.title ?? 'Carousel');
      context.log(`Published LinkedIn carousel ${postUrn}`);
      let comment: { ok: boolean; urn?: string; error?: string } | undefined;
      if (body.first_comment) {
        try {
          comment = { ok: true, urn: await createOrgComment(token, owner, postUrn, body.first_comment) };
        } catch (err) {
          context.error('first comment failed:', err);
          comment = { ok: false, error: (err as Error).message };
        }
      }
      return json(201, { postUrn, documentUrn, comment });
    } catch (err) {
      context.error('postLinkedIn error:', err);
      return json(502, { error: (err as Error).message });
    }
  },
});

/** GET -> token expiry, for the daily carousel health check. Never returns a token. */
app.http('linkedinStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (req): Promise<HttpResponseInit> => {
    if (!authorized(req)) return json(401, { error: 'Unauthorized' });
    const s = await tokenStatus();
    return json(200, {
      connected: s.hasAccess,
      accessExpiresAt: s.accessExpiresAt ?? null,
      refreshExpiresAt: s.refreshExpiresAt ?? null,
      orgSet: !!(await getOrgUrn()),
    });
  },
});
