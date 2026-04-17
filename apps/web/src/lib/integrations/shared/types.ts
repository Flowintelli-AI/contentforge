// ─── Shared integration types ───────────────────────────────────────────────

export type ServiceMode = "live" | "mock";

export type IntegrationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retryable: boolean };

export function ok<T>(data: T): IntegrationResult<T> {
  return { ok: true, data };
}

export function fail(error: string, retryable = false): IntegrationResult<never> {
  return { ok: false, error, retryable };
}

export interface WebhookVerificationError extends Error {
  statusCode: number;
}
