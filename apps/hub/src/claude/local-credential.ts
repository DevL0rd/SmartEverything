import { timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MCP_TOKEN, createMcpToken } from '@smarteverything/domain';
import type { LinkCredential } from './link-token';
import { isMissing } from '../fs-util';

export class LocalLinkCredential implements LinkCredential {
  private token: string | null = null;
  constructor(private readonly directory: string) {}

  verify(bearer: string | null): boolean {
    return (
      bearer !== null &&
      MCP_TOKEN.safeParse(bearer).success &&
      this.token !== null &&
      bearer.length === this.token.length &&
      timingSafeEqual(Buffer.from(bearer), Buffer.from(this.token))
    );
  }

  async read(): Promise<string | null> {
    try {
      this.token = MCP_TOKEN.parse((await readFile(this.file, 'utf8')).trim());
      await chmod(this.file, 0o600);
      return this.token;
    } catch (cause) {
      if (isMissing(cause)) {
        return null;
      }
      throw cause;
    }
  }

  async ensure(): Promise<string> {
    const known = await this.read();
    if (known !== null) return known;
    const token = createMcpToken();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(`${this.file}.tmp`, `${token}\n`, { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
    this.token = token;
    return token;
  }

  async revoke(): Promise<void> {
    this.token = null;
    await rm(this.file, { force: true });
  }

  retireBridge(): number {
    return 0;
  }
  private get file(): string {
    return join(this.directory, 'link.token');
  }
}
