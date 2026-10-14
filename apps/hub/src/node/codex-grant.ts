import type { NodeMcpTransport } from '../client-network/node-transport';
import { readNodeMcpPolicy } from './native-mcp-policy';
import { COMPUTER_MCP_GRANT_RESPONSE } from '@smarteverything/domain';
import type { CodexAiSettings } from '@smarteverything/domain';
import type { CodexNativeGrant, CodexNativeGrantResolver } from '../codex/native-grant';
import { CodexRuntimeError } from '../codex/errors';
export class NodeCodexGrant implements CodexNativeGrantResolver {
  private grant: CodexNativeGrant | null = null;
  private stopped = false;
  constructor(
    private readonly options: {
      readonly hubUrl: string;
      readonly token: string;
      readonly fetcher?: typeof fetch;
      readonly mcp?: NodeMcpTransport;
    },
  ) {}
  async resolve(_settings: CodexAiSettings): Promise<CodexNativeGrant | null> {
    this.assertActive();
    const policy = await readNodeMcpPolicy(this.options, 'codex');
    this.assertActive();
    if (!policy.enabled || policy.areas?.length === 0) {
      await this.revoke();
      return null;
    }
    if (this.grant !== null) {
      const verified = await this.request({ action: 'verify', token: this.grant.token });
      if (verified.valid) return this.present(this.grant);
    }
    const issued = await this.request({ action: 'issue' });
    if (!issued.valid || issued.token === null)
      throw new CodexRuntimeError(
        'mcp',
        'The hub did not issue a computer/runtime-scoped Codex MCP grant.',
      );
    this.grant = { url: issued.url, token: issued.token };
    return this.present(this.grant);
  }
  private assertActive(): void {
    if (this.stopped) throw new CodexRuntimeError('mcp', 'Native MCP owner stopped.');
  }
  stop(): void {
    this.stopped = true;
    this.options.mcp?.revoke('codex');
  }
  async revoke(): Promise<void> {
    this.options.mcp?.revoke('codex');
    if (this.grant === null) return;
    await this.request({ action: 'revoke' });
    this.grant = null;
  }
  private present(grant: CodexNativeGrant): CodexNativeGrant {
    this.assertActive();
    if (this.options.mcp === undefined) return grant;
    return { ...grant, url: this.options.mcp.endpoint('codex', grant.url, grant.token) };
  }
  private async request(
    body:
      | { readonly action: 'issue' | 'revoke' }
      | { readonly action: 'verify'; readonly token: string },
  ): Promise<ReturnType<typeof COMPUTER_MCP_GRANT_RESPONSE.parse>> {
    this.assertActive();
    const response = await (this.options.fetcher ?? fetch)(
      new URL('/api/nodes/ai/codex/grant', this.options.hubUrl),
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
      throw new CodexRuntimeError(
        'mcp',
        `The hub refused the Codex MCP grant (HTTP ${String(response.status)}).`,
      );
    return COMPUTER_MCP_GRANT_RESPONSE.parse(await response.json());
  }
}
