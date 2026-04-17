/**
 * Instagram Graph API service
 *
 * Mock mode when INSTAGRAM_APP_SECRET is not set — all calls are no-ops
 * that return success so local development works without a Meta App.
 */

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION ?? "v20.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

const isMock = !process.env.INSTAGRAM_APP_SECRET;

if (isMock && process.env.NODE_ENV !== "test") {
  console.warn("[instagram] INSTAGRAM_APP_SECRET not set — running in mock mode");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IgSendDMResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IgReplyCommentResult {
  success: boolean;
  commentId?: string;
  error?: string;
}

export interface IgUserInfo {
  id: string;
  name?: string;
  username?: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function graphPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<T> {
  const url = `${BASE_URL}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });

  const json = (await res.json()) as { error?: { message: string } } & T;

  if (!res.ok || (json as { error?: { message: string } }).error) {
    throw new Error(
      (json as { error?: { message: string } }).error?.message ??
        `Graph API error ${res.status}`
    );
  }

  return json;
}

// ─── Public service ───────────────────────────────────────────────────────────

/**
 * Send a DM to an Instagram user.
 *
 * recipient can be:
 *   { id: "IG_USER_ID" }           — known user ID
 *   { comment_id: "COMMENT_ID" }   — commenter (Graph resolves the user)
 */
export async function sendInstagramDM(
  recipient: { id: string } | { comment_id: string },
  message: string,
  accessToken: string
): Promise<IgSendDMResult> {
  if (isMock) {
    console.log("[instagram/mock] sendDM →", { recipient, message });
    return { success: true, messageId: `mock_${Date.now()}` };
  }

  try {
    const result = await graphPost<{ message_id: string }>(
      "me/messages",
      { recipient, message: { text: message } },
      accessToken
    );
    return { success: true, messageId: result.message_id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[instagram] sendDM failed:", error);
    return { success: false, error };
  }
}

/**
 * Reply to a comment on an Instagram post.
 */
export async function replyToComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<IgReplyCommentResult> {
  if (isMock) {
    console.log("[instagram/mock] replyToComment →", { commentId, message });
    return { success: true, commentId: `mock_${Date.now()}` };
  }

  try {
    const result = await graphPost<{ id: string }>(
      `${commentId}/replies`,
      { message },
      accessToken
    );
    return { success: true, commentId: result.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[instagram] replyToComment failed:", error);
    return { success: false, error };
  }
}

/**
 * Refresh a long-lived access token (valid for 60 days, refresh before expiry).
 * Returns the new token string, or throws on failure.
 */
export async function refreshLongLivedToken(
  currentToken: string
): Promise<string> {
  if (isMock) {
    console.log("[instagram/mock] refreshToken → noop");
    return currentToken;
  }

  const url = new URL(`${BASE_URL}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);

  const res = await fetch(url.toString());
  const json = (await res.json()) as {
    access_token?: string;
    error?: { message: string };
  };

  if (!json.access_token) {
    throw new Error(json.error?.message ?? "Failed to refresh token");
  }

  return json.access_token;
}

/**
 * Verify a webhook hub.challenge. Returns true if the verify_token matches.
 */
export function verifyWebhookToken(providedToken: string): boolean {
  const expected = process.env.INSTAGRAM_VERIFY_TOKEN;
  if (!expected) return isMock; // in mock mode always allow
  return providedToken === expected;
}
