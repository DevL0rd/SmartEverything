import {
  MCP_TOKEN_ROW,
  OAUTH_CLIENT_ROW,
  type McpTokenAccess,
  type McpTokenRow,
  type OAuthClientRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

export const OAUTH_AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const;

type OAuthAuthMethod = (typeof OAUTH_AUTH_METHODS)[number];

export interface NewOAuthClient {
  readonly name: string;
  readonly uri: string | null;
  readonly logoUri: string | null;
  readonly redirectUris: readonly string[];
  readonly scopes: readonly string[];
  readonly authMethod: OAuthAuthMethod;
  readonly secretHash: string | null;
}

export interface OAuthClientAuth {
  readonly row: OAuthClientRow;
  readonly authMethod: OAuthAuthMethod;
  readonly secretHash: string | null;
}

const OAUTH_TOKEN_KINDS = ['access', 'refresh'] as const;

export interface NewOAuthToken {
  readonly tokenHash: string;
  readonly kind: (typeof OAUTH_TOKEN_KINDS)[number];
  readonly clientId: string;
  readonly family: string;
  readonly scopes: readonly string[];
  readonly resource: string;
  readonly expiresAt: string;
}

const MOMENT = z.iso.datetime({ offset: true });

const OAUTH_TOKEN_ROW = z.strictObject({
  token_hash: z.string().min(1),
  kind: z.enum(OAUTH_TOKEN_KINDS),
  client_id: z.string().min(1),
  family: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  resource: z.string().min(1),
  created_at: MOMENT,
  expires_at: MOMENT,
  used_at: MOMENT.nullable(),
});

export type OAuthTokenRow = z.infer<typeof OAUTH_TOKEN_ROW>;

const STORED_CLIENT = storedRow(OAUTH_CLIENT_ROW, { json: ['redirect_uris', 'scopes'] });

const STORED_CLIENT_AUTH = storedRow(
  OAUTH_CLIENT_ROW.extend({
    auth_method: z.enum(OAUTH_AUTH_METHODS),
    secret_hash: z.string().nullable(),
  }),
  { json: ['redirect_uris', 'scopes'] },
);

const LOCAL_ONLY = storedRow(z.strictObject({ local_only: z.boolean() }), {
  flags: ['local_only'],
});

const STORED_TOKEN = storedRow(OAUTH_TOKEN_ROW, { json: ['scopes'] });

const COUNT = z.object({ count: z.number().int() });

const CLIENT_COLUMNS =
  'id, name, uri, logo_uri, redirect_uris, scopes, created_at, granted_at, revoked_at';

const TOKEN_COLUMNS =
  'token_hash, kind, client_id, family, scopes, resource, created_at, expires_at, used_at';

const MCP_TOKEN_COLUMNS = 'id, name, access, created_at, last_used_at, revoked_at';

export interface PersonalToken {
  readonly name: string;
  readonly tokenHash: string;
  readonly localOnly: boolean;
  readonly access: McpTokenAccess;
}

export class OAuthRepository {
  constructor(private readonly context: StoreContext) {}

  register(client: NewOAuthClient): OAuthClientRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'register the OAuth client',
        `insert into oauth_clients
           (id, name, uri, logo_uri, redirect_uris, scopes, created_at, auth_method, secret_hash)
         values ($id, $name, $uri, $logoUri, $redirectUris, $scopes, $now, $authMethod, $secretHash)`,
        {
          id,
          name: client.name,
          uri: client.uri,
          logoUri: client.logoUri,
          redirectUris: jsonText(client.redirectUris),
          scopes: jsonText(client.scopes),
          now: this.context.now(),
          authMethod: client.authMethod,
          secretHash: client.secretHash,
        },
      );
      const row = this.client(id);
      this.context.changed('oauth_clients', 'INSERT', row, null);
      return row;
    });
  }

  findClient(id: string): OAuthClientAuth | undefined {
    const stored = this.context.sql.get(
      STORED_CLIENT_AUTH,
      `select ${CLIENT_COLUMNS}, auth_method, secret_hash from oauth_clients where id = $id`,
      { id },
    );
    if (stored === undefined) {
      return undefined;
    }
    const { auth_method: authMethod, secret_hash: secretHash, ...row } = stored;
    return { row, authMethod, secretHash };
  }

  grant(id: string, scopes: readonly string[]): OAuthClientRow {
    return this.context.write(() => {
      const before = this.client(id);
      this.context.sql.run(
        'grant the OAuth client',
        `update oauth_clients set granted_at = $now, revoked_at = null, scopes = $scopes
         where id = $id`,
        { id, now: this.context.now(), scopes: jsonText(scopes) },
      );
      const after = this.client(id);
      this.context.changed('oauth_clients', 'UPDATE', after, before);
      return after;
    });
  }

  unapprovedSince(moment: string): number {
    return found(
      this.context.sql.get(
        COUNT,
        'select count(*) as count from oauth_clients where granted_at is null and created_at >= $moment',
        { moment },
      ),
      'count of unapproved OAuth clients',
      moment,
    ).count;
  }

  forgetUnapprovedBefore(moment: string): number {
    return this.context.write(() => {
      const stale = this.context.sql.all(
        STORED_CLIENT,
        `select ${CLIENT_COLUMNS} from oauth_clients where granted_at is null and created_at < $moment`,
        { moment },
      );
      for (const row of stale) {
        this.context.sql.run(
          'forget the OAuth client',
          'delete from oauth_clients where id = $id',
          {
            id: row.id,
          },
        );
        this.context.changed('oauth_clients', 'DELETE', null, row);
      }
      return stale.length;
    });
  }

  issue(tokens: readonly NewOAuthToken[]): void {
    this.context.write(() => {
      for (const token of tokens) {
        this.context.sql.run(
          'issue the OAuth token',
          `insert into oauth_tokens
             (token_hash, kind, client_id, family, scopes, resource, created_at, expires_at)
           values ($tokenHash, $kind, $clientId, $family, $scopes, $resource, $now, $expiresAt)`,
          {
            tokenHash: token.tokenHash,
            kind: token.kind,
            clientId: token.clientId,
            family: token.family,
            scopes: jsonText(token.scopes),
            resource: token.resource,
            now: this.context.now(),
            expiresAt: token.expiresAt,
          },
        );
      }
    });
  }

  token(tokenHash: string): OAuthTokenRow | undefined {
    return this.context.sql.get(
      STORED_TOKEN,
      `select ${TOKEN_COLUMNS} from oauth_tokens where token_hash = $tokenHash`,
      { tokenHash },
    );
  }

  useRefreshToken(tokenHash: string): boolean {
    return this.context.write(
      () =>
        this.context.sql.run(
          'use the refresh token',
          `update oauth_tokens set used_at = $now
           where token_hash = $tokenHash and kind = 'refresh' and used_at is null`,
          { tokenHash, now: this.context.now() },
        ) === 1,
    );
  }

  revokeFamily(family: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'revoke the OAuth token family',
        'delete from oauth_tokens where family = $family',
        { family },
      ),
    );
  }

  revokeToken(tokenHash: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'revoke the OAuth token',
        'delete from oauth_tokens where token_hash = $tokenHash',
        { tokenHash },
      ),
    );
  }

  forgetExpiredTokens(): number {
    return this.context.write(() =>
      this.context.sql.run(
        'forget expired OAuth tokens',
        'delete from oauth_tokens where expires_at < $now',
        { now: this.context.now() },
      ),
    );
  }

  personalTokens(): McpTokenRow[] {
    return this.context.sql.all(
      MCP_TOKEN_ROW,
      `select ${MCP_TOKEN_COLUMNS} from mcp_tokens order by created_at desc, rowid desc`,
    );
  }

  personalToken(id: string): McpTokenRow {
    return found(
      this.context.sql.get(
        MCP_TOKEN_ROW,
        `select ${MCP_TOKEN_COLUMNS} from mcp_tokens where id = $id`,
        { id },
      ),
      'MCP token',
      id,
    );
  }

  activePersonalTokenByHash(tokenHash: string): McpTokenRow | undefined {
    return this.context.sql.get(
      MCP_TOKEN_ROW,
      `select ${MCP_TOKEN_COLUMNS} from mcp_tokens where token_hash = $tokenHash and revoked_at is null`,
      { tokenHash },
    );
  }

  createPersonalToken(token: PersonalToken): McpTokenRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the MCP token',
        `insert into mcp_tokens (id, name, token_hash, created_at, local_only, access)
         values ($id, $name, $tokenHash, $now, $localOnly, $access)`,
        {
          id,
          name: token.name,
          tokenHash: token.tokenHash,
          now: this.context.now(),
          localOnly: flag(token.localOnly),
          access: token.access,
        },
      );
      const row = this.personalToken(id);
      this.context.changed('mcp_tokens', 'INSERT', row, null);
      return row;
    });
  }

  personalTokenIsLocalOnly(id: string): boolean {
    return (
      this.context.sql.get(LOCAL_ONLY, 'select local_only from mcp_tokens where id = $id', { id })
        ?.local_only === true
    );
  }

  revokePersonalToken(id: string): McpTokenRow {
    return this.context.write(() => {
      const before = this.personalToken(id);
      this.context.sql.run(
        'revoke the MCP token',
        'update mcp_tokens set revoked_at = coalesce(revoked_at, $now) where id = $id',
        { id, now: this.context.now() },
      );
      const after = this.personalToken(id);
      this.context.changed('mcp_tokens', 'UPDATE', after, before);
      return after;
    });
  }

  personalTokenUsed(id: string): McpTokenRow {
    return this.context.write(() => {
      const before = this.personalToken(id);
      this.context.sql.run(
        'record the MCP token use',
        'update mcp_tokens set last_used_at = $now where id = $id',
        { id, now: this.context.now() },
      );
      const after = this.personalToken(id);
      this.context.changed('mcp_tokens', 'UPDATE', after, before);
      return after;
    });
  }

  grants(): OAuthClientRow[] {
    return this.context.sql.all(
      STORED_CLIENT,
      `select ${CLIENT_COLUMNS} from oauth_clients
       where granted_at is not null and revoked_at is null order by granted_at desc`,
    );
  }

  revokeGrant(id: string): void {
    this.context.write(() => {
      const before = this.client(id);
      this.context.sql.run(
        'revoke the assistant',
        'update oauth_clients set revoked_at = coalesce(revoked_at, $now) where id = $id',
        { id, now: this.context.now() },
      );
      this.context.changed('oauth_clients', 'UPDATE', this.client(id), before);
    });
  }

  client(id: string): OAuthClientRow {
    return found(
      this.context.sql.get(
        STORED_CLIENT,
        `select ${CLIENT_COLUMNS} from oauth_clients where id = $id`,
        { id },
      ),
      'OAuth client',
      id,
    );
  }
}
