import { MCP_SCOPE, MCP_TOKEN, hashMcpToken, type McpToolArea } from '@smarteverything/domain';
import type { OAuthTokenRow } from '../../store/repositories/oauth';
import type { Store } from '../../store/store';
import { ACCESS_TOKEN_PREFIX, hashSecret } from './secrets';
import type { Site } from './site';

export type McpCaller =
  | {
      readonly kind: 'accepted';
      readonly via: 'personal' | 'oauth' | 'plugin';
      readonly id: string;
      readonly localOnly: boolean;
      readonly areas?: readonly McpToolArea[];
    }
  | { readonly kind: 'refused'; readonly reason: string };

export type AcceptedCaller = Extract<McpCaller, { readonly kind: 'accepted' }>;

export interface BearerCheck {
  readonly store: Store;
  readonly site: Site;
  readonly now: Date;
}

export function grantStillHolds(store: Store, token: OAuthTokenRow): boolean {
  const client = store.oauth.findClient(token.client_id);
  return (
    client?.row.revoked_at === null &&
    client.row.granted_at !== null &&
    token.created_at >= client.row.granted_at
  );
}

function pluginCaller(store: Store, token: string): McpCaller | null {
  const row = store.plugins.tokenByHash(hashMcpToken(token));
  return row === undefined
    ? null
    : {
        kind: 'accepted',
        via: 'plugin',
        id: row.pluginId,
        localOnly: true,
        areas: row.areas.filter((area) => area !== 'plugins'),
      };
}

function personal(store: Store, token: string): McpCaller {
  const row = store.assistant.activeTokenByHash(hashMcpToken(token));
  if (row === undefined) {
    return { kind: 'refused', reason: 'This personal token was revoked or never existed' };
  }
  store.oauth.personalTokenUsed(row.id);
  return {
    kind: 'accepted',
    via: 'personal',
    id: row.id,
    localOnly: store.assistant.localOnly(row.id),
  };
}

function delegated(check: BearerCheck, token: string): McpCaller {
  const row = check.store.oauth.token(hashSecret(token));
  if (row?.kind !== 'access') {
    return { kind: 'refused', reason: 'This access token is not known to this server' };
  }
  if (Date.parse(row.expires_at) <= check.now.getTime()) {
    return { kind: 'refused', reason: 'This access token has expired; refresh it' };
  }
  if (row.resource !== check.site.resource) {
    return { kind: 'refused', reason: `This access token was issued for ${row.resource}` };
  }
  if (!row.scopes.includes(MCP_SCOPE) || !grantStillHolds(check.store, row)) {
    return { kind: 'refused', reason: 'The owner revoked this assistant; connect it again' };
  }
  return { kind: 'accepted', via: 'oauth', id: row.client_id, localOnly: false };
}

export function callerFor(check: BearerCheck, token: string): McpCaller {
  if (MCP_TOKEN.safeParse(token).success) {
    return pluginCaller(check.store, token) ?? personal(check.store, token);
  }
  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    return delegated(check, token);
  }
  return {
    kind: 'refused',
    reason: 'Only OAuth access tokens and personal MCP tokens are accepted here',
  };
}

export function challenge(site: Site, error: 'invalid_token' | null): string {
  const parameters = [
    ...(error === null ? [] : [`error="${error}"`]),
    `resource_metadata="${site.resourceMetadata}"`,
    `scope="${MCP_SCOPE}"`,
  ];
  return `Bearer ${parameters.join(', ')}`;
}
