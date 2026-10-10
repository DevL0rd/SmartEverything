import { z } from 'zod';

export const TOKEN_PATH = '/v1.0/token';

export const TOKEN_QUERY: Readonly<Record<string, string>> = { grant_type: '1' };

export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export const TOKEN_RESULT = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expire_time: z.number().int().positive(),
});

export interface CloudToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export function tokenFrom(result: z.output<typeof TOKEN_RESULT>, receivedAt: number): CloudToken {
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: receivedAt + result.expire_time * 1000,
  };
}

export function needsRefresh(token: CloudToken, now: number): boolean {
  return now >= token.expiresAt - TOKEN_REFRESH_MARGIN_MS;
}

export function refreshPath(token: CloudToken): string {
  return `${TOKEN_PATH}/${token.refreshToken}`;
}
