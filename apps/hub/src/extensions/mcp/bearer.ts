import {
  COMPUTER_MCP_TOKEN,
  MCP_SCOPE,
  MCP_TOKEN,
  hashMcpToken,
  type McpToolArea,
} from '@smarteverything/domain';
import { computerMcpGrant } from '../../computers/node-mcp-grant';
import type { OAuthTokenRow } from '../../store/repositories/oauth';
import type { Store } from '../../store/store';
import { ACCESS_TOKEN_PREFIX, hashSecret } from './secrets';
import type { Site } from './site';

export type McpCaller =
  | {
      readonly kind: 'accepted';
      readonly via: 'personal' | 'oauth' | 'plugin' | 'computer';
      readonly id: string;
      readonly localOnly: boolean;
      readonly readOnly: boolean;
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
        readOnly: false,
        areas: row.areas.filter((area) => area !== 'plugins'),
      };
}

function computerCaller(store: Store, token: string): McpCaller | null {
  const grant = computerMcpGrant(store, token);
  if (grant !== null) {
    return {
      kind: 'accepted',
      via: 'computer',
      id: grant.deviceId,
      localOnly: grant.localOnly,
      readOnly: false,
      areas: grant.areas,
    };
  }
  const known =
    COMPUTER_MCP_TOKEN.safeParse(token).success ||
    (MCP_TOKEN.safeParse(token).success &&
      store.computerNativeMcpPolicy.localGrant(hashMcpToken(token)) !== undefined);
  return known
    ? { kind: 'refused', reason: 'This computer MCP grant was revoked, disabled or never existed' }
    : null;
}

function personal(store: Store, token: string): McpCaller {
  const row = store.oauth.activePersonalTokenByHash(hashMcpToken(token));
  if (row === undefined) {
    return { kind: 'refused', reason: 'This personal token was revoked or never existed' };
  }
  store.oauth.personalTokenUsed(row.id);
  return {
    kind: 'accepted',
    via: 'personal',
    id: row.id,
    localOnly: store.oauth.personalTokenIsLocalOnly(row.id),
    readOnly: row.access === 'read',
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
  return { kind: 'accepted', via: 'oauth', id: row.client_id, localOnly: false, readOnly: false };
}

export function callerFor(check: BearerCheck, token: string): McpCaller {
  const computer = computerCaller(check.store, token);
  if (computer !== null) {
    return computer;
  }
  if (MCP_TOKEN.safeParse(token).success) {
    return pluginCaller(check.store, token) ?? personal(check.store, token);
  }
  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    return delegated(check, token);
  }
  return {
    kind: 'refused',
    reason:
      'Only OAuth access tokens, personal MCP tokens and scoped computer grants are accepted here',
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
