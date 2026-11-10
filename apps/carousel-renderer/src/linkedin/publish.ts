import { apiHeaders } from './tokens';

const API = 'https://api.linkedin.com/rest';

/** LinkedIn "little text" reserves these characters; '#' is left alone so hashtags still work. */
export function escapeCommentary(text: string): string {
  return text.replace(/([\\|{}@[\]()<>*_~])/g, '\\$1');
}

async function ensureOk(res: Response, step: string): Promise<void> {
  if (!res.ok) throw new Error(`${step} failed (${res.status}): ${await res.text()}`);
}

export async function uploadDocument(token: string, owner: string, pdf: Buffer): Promise<string> {
  const init = await fetch(`${API}/documents?action=initializeUpload`, {
    method: 'POST',
    headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  await ensureOk(init, 'documents.initializeUpload');
  const { value } = (await init.json()) as { value: { uploadUrl: string; document: string } };

  const put = await fetch(value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(pdf),
  });
  await ensureOk(put, 'document upload');
  return value.document;
}

export async function createDocumentPost(
  token: string,
  author: string,
  commentary: string,
  documentUrn: string,
  title: string,
): Promise<string> {
  const res = await fetch(`${API}/posts`, {
    method: 'POST',
    headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author,
      commentary: escapeCommentary(commentary),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { title, id: documentUrn } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  await ensureOk(res, 'posts.create');
  return res.headers.get('x-restli-id') ?? '';
}

export async function deletePost(token: string, postUrn: string): Promise<void> {
  const res = await fetch(`${API}/posts/${encodeURIComponent(postUrn)}`, {
    method: 'DELETE',
    headers: apiHeaders(token),
  });
  await ensureOk(res, 'posts.delete');
}

/**
 * Posts a comment as the company page. The actor is always the organization URN, never a person; the response is
 * checked and the comment is deleted again if LinkedIn reports any other actor.
 */
export async function createOrgComment(token: string, orgUrn: string, postUrn: string, text: string): Promise<string> {
  const base = `${API}/socialActions/${encodeURIComponent(postUrn)}/comments`;
  const res = await fetch(base, {
    method: 'POST',
    headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: orgUrn, object: postUrn, message: { text: escapeCommentary(text) } }),
  });
  await ensureOk(res, 'comments.create');
  const body = (await res.json().catch(() => ({}))) as { actor?: string; $URN?: string; id?: string };
  const commentUrn = body.$URN ?? body.id ?? res.headers.get('x-restli-id') ?? '';
  if (body.actor && body.actor !== orgUrn) {
    if (commentUrn) {
      await fetch(`${base}/${encodeURIComponent(commentUrn)}?actor=${encodeURIComponent(body.actor)}`, { method: 'DELETE', headers: apiHeaders(token) });
    }
    throw new Error(`comment was attributed to ${body.actor}, not the company page; removed`);
  }
  return commentUrn;
}
