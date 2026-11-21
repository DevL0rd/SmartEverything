import { COMPUTER_MCP_TOKEN, MCP_SCOPE, MCP_TOKEN, hashMcpToken } from '@smarteverything/domain';
import { computerMcpGrant } from '../../computers/node-mcp-grant';
import { storeUnit } from '../../store/host/unit';
import type { OAuthTokenRow } from '../../store/repositories/oauth';
import type { Store } from '../../store/store';
import type { McpCaller } from './bearer';
import { ACCESS_TOKEN_PREFIX, hashSecret } from './secrets';

export interface BearerRead {
  readonly token: string;
  readonly resource: string;
  readonly now: string;
}

export interface BearerFound {
  readonly caller: McpCaller;
  readonly personalTokenId: string | null;
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

function personal(store: Store, token: string): BearerFound {
  const row = store.oauth.activePersonalTokenByHash(hashMcpToken(token));
  if (row === undefined) {
    return {
      caller: { kind: 'refused', reason: 'This personal token was revoked or never existed' },
      personalTokenId: null,
    };
  }
  return {
    caller: {
      kind: 'accepted',
      via: 'personal',
      id: row.id,
      localOnly: store.oauth.personalTokenIsLocalOnly(row.id),
      readOnly: row.access === 'read',
    },
    personalTokenId: row.id,
  };
}

function delegated(store: Store, check: BearerRead): McpCaller {
  const row = store.oauth.token(hashSecret(check.token));
  if (row?.kind !== 'access') {
    return { kind: 'refused', reason: 'This access token is not known to this server' };
  }
  if (Date.parse(row.expires_at) <= Date.parse(check.now)) {
    return { kind: 'refused', reason: 'This access token has expired; refresh it' };
  }
  if (row.resource !== check.resource) {
    return { kind: 'refused', reason: `This access token was issued for ${row.resource}` };
  }
  if (!row.scopes.includes(MCP_SCOPE) || !grantStillHolds(store, row)) {
    return { kind: 'refused', reason: 'The owner revoked this assistant; connect it again' };
  }
  return { kind: 'accepted', via: 'oauth', id: row.client_id, localOnly: false, readOnly: false };
}

export const MCP_BEARER_UNIT = storeUnit((store, check: BearerRead): BearerFound => {
  const computer = computerCaller(store, check.token);
  if (computer !== null) return { caller: computer, personalTokenId: null };
  if (MCP_TOKEN.safeParse(check.token).success) {
    const plugin = pluginCaller(store, check.token);
    return plugin === null
      ? personal(store, check.token)
      : { caller: plugin, personalTokenId: null };
  }
  if (check.token.startsWith(ACCESS_TOKEN_PREFIX)) {
    return { caller: delegated(store, check), personalTokenId: null };
  }
  return {
    caller: {
      kind: 'refused',
      reason:
        'Only OAuth access tokens, personal MCP tokens and scoped computer grants are accepted here',
    },
    personalTokenId: null,
  };
});
