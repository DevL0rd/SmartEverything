import type { z } from 'zod';
import { messageOf } from '@smarteverything/logging';

const TIMEOUT_MS = 10_000;

export interface ProviderRequest {
  readonly fetch: typeof fetch;
  readonly version: string;
}

export class ProviderError extends Error {
  override readonly name = 'ProviderError';
}

function issuesOf(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function userAgentOf(request: ProviderRequest): string {
  return `SmartEverything/${request.version} (self-hosted smart home hub)`;
}

export async function fetchJson<T>(
  request: ProviderRequest,
  provider: string,
  url: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await request.fetch(url, {
      headers: { 'User-Agent': userAgentOf(request) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = messageOf(cause);
    throw new ProviderError(`Couldn’t reach ${provider} (${reason}).`);
  }
  if (response.status !== 200) {
    throw new ProviderError(`${provider} answered HTTP ${String(response.status)}.`);
  }
  return readAs(provider, schema, 'answer', await response.json());
}

export function readAs<T>(provider: string, schema: z.ZodType<T>, what: string, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderError(
      `${provider} sent a ${what} this app can’t read (${issuesOf(parsed.error)}).`,
    );
  }
  return parsed.data;
}
