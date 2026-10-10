import type { SMARTTHINGS_TOKEN_SCOPES } from '@smarteverything/domain';

export type TokenScope = (typeof SMARTTHINGS_TOKEN_SCOPES)[number];

export const SCOPE_LABELS: Readonly<Record<TokenScope, string>> = {
  'r:apps:*': 'Apps: read',
  'w:apps:*': 'Apps: write',
};

export type SmartThingsStep =
  | {
      readonly kind: 'token';
      readonly notice: string | null;
      readonly missing: readonly TokenScope[];
    }
  | { readonly kind: 'creating'; readonly confirmedBefore: string | null }
  | { readonly kind: 'not_confirmed'; readonly reason: string }
  | { readonly kind: 'signin'; readonly baseline: string | null };

export const FIRST_STEP: SmartThingsStep = { kind: 'token', notice: null, missing: [] };
