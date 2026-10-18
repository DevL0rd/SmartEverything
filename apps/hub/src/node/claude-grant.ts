import type { NodeMcpTransport } from '../client-network/node-transport';
import { readNodeMcpPolicy } from './native-mcp-policy';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  COMPUTER_MCP_GRANT_PATH,
  COMPUTER_MCP_GRANT_RESPONSE,
  COMPUTER_MCP_TOKEN,
} from '@smarteverything/domain';
import { isMissing } from '../fs-util';

export class NodeClaudeGrant {
  private stopped = false;
  constructor(
    private readonly options: {
      readonly hubUrl: string;
      readonly token: string;
      readonly fetcher?: typeof fetch;
      readonly mcp?: NodeMcpTransport;
      readonly directory: string;
    },
  ) {}

  async endpoint(): Promise<string | null> {
    this.assertActive();
    const policy = await readNodeMcpPolicy(this.options, 'claude');
    this.assertActive();
    if (!policy.enabled || policy.areas?.length === 0) {
      await this.revoke();
      return null;
    }
    const known = await this.read();
    const grant =
      known === null
        ? await this.request({ action: 'issue' })
        : await this.request({ action: 'verify', token: known });
    const valid = grant.valid ? grant : await this.request({ action: 'issue' });
    if (!valid.valid) throw new NodeGrantError('The hub did not issue a scoped Claude MCP grant.');
    const token = valid.token ?? known;
    if (token === null) throw new NodeGrantError('The scoped Claude MCP grant is missing.');
    await this.write(token);
    this.assertActive();
    return this.options.mcp === undefined
      ? valid.url
      : this.options.mcp.endpoint('claude', valid.url, token);
  }

  private async write(token: string): Promise<void> {
    this.assertActive();
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    this.assertActive();
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${token}\n`, { mode: 0o600 });
      this.assertActive();
      await rename(temporary, this.file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  private assertActive(): void {
    if (this.stopped) throw new NodeGrantError('Native MCP owner stopped.');
  }

  stop(): void {
    this.stopped = true;
    this.options.mcp?.revoke('claude');
  }

  async revoke(): Promise<void> {
    this.options.mcp?.revoke('claude');
    await this.request({ action: 'revoke' });
    await rm(this.file, { force: true });
  }

  private async read(): Promise<string | null> {
    try {
      return COMPUTER_MCP_TOKEN.parse((await readFile(this.file, 'utf8')).trim());
    } catch (cause) {
      if (isMissing(cause)) return null;
      throw cause;
    }
  }
  private async request(
    body:
      | { readonly action: 'issue' | 'revoke' }
      | { readonly action: 'verify'; readonly token: string },
  ): Promise<ReturnType<typeof COMPUTER_MCP_GRANT_RESPONSE.parse>> {
    this.assertActive();
    const response = await (this.options.fetcher ?? fetch)(
      new URL(COMPUTER_MCP_GRANT_PATH, this.options.hubUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      throw new NodeGrantError(
        `The hub refused the Claude grant (HTTP ${String(response.status)}).`,
      );
    return COMPUTER_MCP_GRANT_RESPONSE.parse(await response.json());
  }
  private get file(): string {
    return join(this.options.directory, 'mcp.token');
  }
}
class NodeGrantError extends Error {
  override readonly name = 'NodeGrantError';
}
