import {
  MCP_TOKEN_ROW,
  OAUTH_CLIENT_ROW,
  type McpTokenRow,
  type OAuthClientRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';

const LOCAL_ONLY = storedRow(z.strictObject({ local_only: z.boolean() }), {
  flags: ['local_only'],
});

const STORED_OAUTH_CLIENT = storedRow(OAUTH_CLIENT_ROW, { json: ['redirect_uris', 'scopes'] });

const TOKEN_COLUMNS = 'id, name, created_at, last_used_at, revoked_at';

const OAUTH_COLUMNS =
  'id, name, uri, logo_uri, redirect_uris, scopes, created_at, granted_at, revoked_at';

export class AssistantRepository {
  constructor(private readonly context: StoreContext) {}

  tokens(): McpTokenRow[] {
    return this.context.sql.all(
      MCP_TOKEN_ROW,
      `select ${TOKEN_COLUMNS} from mcp_tokens order by created_at desc, rowid desc`,
    );
  }

  token(id: string): McpTokenRow {
    return found(
      this.context.sql.get(
        MCP_TOKEN_ROW,
        `select ${TOKEN_COLUMNS} from mcp_tokens where id = $id`,
        { id },
      ),
      'MCP token',
      id,
    );
  }

  activeTokenByHash(tokenHash: string): McpTokenRow | undefined {
    return this.context.sql.get(
      MCP_TOKEN_ROW,
      `select ${TOKEN_COLUMNS} from mcp_tokens where token_hash = $tokenHash and revoked_at is null`,
      { tokenHash },
    );
  }

  createToken(name: string, tokenHash: string, localOnly = false): McpTokenRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the MCP token',
        `insert into mcp_tokens (id, name, token_hash, created_at, local_only)
         values ($id, $name, $tokenHash, $now, $localOnly)`,
        { id, name, tokenHash, now: this.context.now(), localOnly: localOnly ? 1 : 0 },
      );
      const row = this.token(id);
      this.context.changed('mcp_tokens', 'INSERT', row, null);
      return row;
    });
  }

  localOnly(id: string): boolean {
    const row = this.context.sql.get(
      LOCAL_ONLY,
      'select local_only from mcp_tokens where id = $id',
      { id },
    );
    return row?.local_only === true;
  }

  revokeToken(id: string): McpTokenRow {
    return this.context.write(() => {
      const before = this.token(id);
      this.context.sql.run(
        'revoke the MCP token',
        'update mcp_tokens set revoked_at = coalesce(revoked_at, $now) where id = $id',
        { id, now: this.context.now() },
      );
      const after = this.token(id);
      this.context.changed('mcp_tokens', 'UPDATE', after, before);
      return after;
    });
  }

  grants(): OAuthClientRow[] {
    return this.context.sql.all(
      STORED_OAUTH_CLIENT,
      `select ${OAUTH_COLUMNS} from oauth_clients
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
        STORED_OAUTH_CLIENT,
        `select ${OAUTH_COLUMNS} from oauth_clients where id = $id`,
        { id },
      ),
      'OAuth client',
      id,
    );
  }
}
