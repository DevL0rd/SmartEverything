import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MCP_TOKEN, createMcpToken, hashMcpToken } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { isMissing } from '../fs-util';

const LINK_TOKEN_NAME = 'SmartEverything link';

const LINK_TOKEN_FILE = 'link.token';

const BRIDGE_TOKEN_NAME = 'Claude Code on this computer';

export interface LinkCredential {
  readonly verify: (bearer: string | null) => Promise<boolean>;
  readonly read: () => Promise<string | null>;
  readonly ensure: () => Promise<string>;
  readonly revoke: () => Promise<void>;
  readonly retireBridge: () => Promise<number>;
}

export class LinkToken {
  constructor(
    private readonly store: Pick<Store, 'host'>,
    private readonly directory: string,
  ) {}

  private get file(): string {
    return join(this.directory, LINK_TOKEN_FILE);
  }

  async verify(bearer: string | null): Promise<boolean> {
    if (bearer === null || !MCP_TOKEN.safeParse(bearer).success) {
      return false;
    }
    const row = await this.store.host.call(
      'oauth',
      'activePersonalTokenByHash',
      hashMcpToken(bearer),
    );
    return row?.name === LINK_TOKEN_NAME;
  }

  async read(): Promise<string | null> {
    try {
      const token = (await readFile(this.file, 'utf8')).trim();
      return (await this.verify(token)) ? token : null;
    } catch (cause) {
      if (!isMissing(cause)) {
        throw cause;
      }
      return null;
    }
  }

  async ensure(): Promise<string> {
    const known = await this.read();
    if (known !== null) {
      return known;
    }
    await this.revokeRows();
    const token = createMcpToken();
    await this.store.host.call('oauth', 'createPersonalToken', {
      name: LINK_TOKEN_NAME,
      tokenHash: hashMcpToken(token),
      localOnly: true,
      access: 'control',
    });
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(`${this.file}.tmp`, `${token}\n`, { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
    return token;
  }

  async revoke(): Promise<void> {
    await this.revokeRows();
    await rm(this.file, { force: true });
  }

  retireBridge(): Promise<number> {
    return this.revokeNamed(BRIDGE_TOKEN_NAME);
  }

  private async revokeRows(): Promise<void> {
    await this.revokeNamed(LINK_TOKEN_NAME);
  }

  private async revokeNamed(name: string): Promise<number> {
    const { host } = this.store;
    const rows = (await host.call('oauth', 'personalTokens')).filter(
      (row) => row.name === name && row.revoked_at === null,
    );
    for (const row of rows) await host.call('oauth', 'revokePersonalToken', row.id);
    return rows.length;
  }
}
