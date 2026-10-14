import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MCP_TOKEN, createMcpToken, hashMcpToken } from '@smarteverything/domain';
import type { Store } from '../store/store';

const LINK_TOKEN_NAME = 'SmartEverything link';

const LINK_TOKEN_FILE = 'link.token';

const BRIDGE_TOKEN_NAME = 'Claude Code on this computer';

export interface LinkCredential {
  readonly verify: (bearer: string | null) => boolean;
  readonly read: () => Promise<string | null>;
  readonly ensure: () => Promise<string>;
  readonly revoke: () => Promise<void>;
  readonly retireBridge: () => number;
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

export class LinkToken {
  constructor(
    private readonly store: Store,
    private readonly directory: string,
  ) {}

  private get file(): string {
    return join(this.directory, LINK_TOKEN_FILE);
  }

  verify(bearer: string | null): boolean {
    if (bearer === null || !MCP_TOKEN.safeParse(bearer).success) {
      return false;
    }
    return this.store.assistant.activeTokenByHash(hashMcpToken(bearer))?.name === LINK_TOKEN_NAME;
  }

  async read(): Promise<string | null> {
    try {
      const token = (await readFile(this.file, 'utf8')).trim();
      return this.verify(token) ? token : null;
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
    this.revokeRows();
    const token = createMcpToken();
    this.store.assistant.createToken(LINK_TOKEN_NAME, hashMcpToken(token), true);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(`${this.file}.tmp`, `${token}\n`, { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
    return token;
  }

  async revoke(): Promise<void> {
    this.revokeRows();
    await rm(this.file, { force: true });
  }

  retireBridge(): number {
    const rows = this.store.assistant
      .tokens()
      .filter((row) => row.name === BRIDGE_TOKEN_NAME && row.revoked_at === null);
    for (const row of rows) {
      this.store.assistant.revokeToken(row.id);
    }
    return rows.length;
  }

  private revokeRows(): void {
    for (const row of this.store.assistant.tokens()) {
      if (row.name === LINK_TOKEN_NAME && row.revoked_at === null) {
        this.store.assistant.revokeToken(row.id);
      }
    }
  }
}
