import { z } from 'zod';
import { SubscriptionProviderError } from '../providers/errors';

export const SIWC_ISSUER = 'https://auth.openai.com';
export const SIWC_RESOURCE = 'https://api.openai.com/v1';
export const SIWC_AUTHORIZE = `${SIWC_ISSUER}/api/accounts/authorize`;
export const SIWC_TOKEN = `${SIWC_ISSUER}/api/accounts/oauth/token`;
export const SIWC_SCOPES =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const SIWC_TOKEN_RESPONSE = z.object({
  access_token: z
    .string()
    .min(1)
    .max(32768)
    .refine((value) => !value.startsWith('sk-')),
  refresh_token: z.string().min(1).max(32768),
  id_token: z.string().min(1).max(32768).optional(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  scope: z.string().min(1),
  earliest_refresh_at: z.number().int().nonnegative().optional(),
});
export const SIWC_DISCOVERY = z.object({
  issuer: z.literal(SIWC_ISSUER),
  authorization_endpoint: z.literal(SIWC_AUTHORIZE),
  token_endpoint: z.literal(SIWC_TOKEN),
  jwks_uri: z.url().refine((value) => new URL(value).origin === SIWC_ISSUER),
  revocation_endpoint: z.url().refine((value) => new URL(value).origin === SIWC_ISSUER),
});
export const SIWC_IDENTITY = z.object({
  sub: z.string().min(1).max(500),
  nonce: z.string().min(1),
  email: z.string().max(500).optional(),
});
export const SIWC_REFRESH_IDENTITY = SIWC_IDENTITY.omit({ nonce: true });
export type SiwcTokens = z.infer<typeof SIWC_TOKEN_RESPONSE>;

export function assertPlanScope(scope: string): readonly string[] {
  const scopes = scope.split(/\s+/);
  if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke'))
    throw new SubscriptionProviderError(
      'AUTH_DENIED',
      'ChatGPT plan authorization scopes were not granted.',
    );
  return scopes;
}
