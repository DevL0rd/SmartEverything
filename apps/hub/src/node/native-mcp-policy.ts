import {
  COMPUTER_NATIVE_MCP_POLICY,
  type ComputerAiRuntime,
  type ComputerNativeMcpPolicy,
} from '@smarteverything/domain';

export async function readNodeMcpPolicy(
  options: { readonly hubUrl: string; readonly token: string; readonly fetcher?: typeof fetch },
  runtime: ComputerAiRuntime,
): Promise<ComputerNativeMcpPolicy> {
  const response = await (options.fetcher ?? fetch)(
    new URL(`/api/nodes/ai/${runtime}/mcp-policy`, options.hubUrl),
    {
      headers: { authorization: `Bearer ${options.token}` },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    },
  );
  if (!response.ok) throw new NodeMcpPolicyError(runtime, response.status);
  return COMPUTER_NATIVE_MCP_POLICY.parse(await response.json());
}
class NodeMcpPolicyError extends Error {
  override readonly name = 'NodeMcpPolicyError';
  constructor(
    readonly runtime: ComputerAiRuntime,
    readonly status: number,
  ) {
    super(`The hub refused the ${runtime} MCP policy (HTTP ${String(status)}).`);
  }
}
