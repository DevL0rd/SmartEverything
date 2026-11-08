import { createHash, randomBytes } from 'node:crypto';
import {
  ApiError,
  MCP_TOOL_AREAS,
  COMPUTER_MCP_TOKEN,
  MCP_TOKEN,
  type COMPUTER_MCP_GRANT_REQUEST,
  type COMPUTER_MCP_GRANT_RESPONSE,
  type ComputerNodeRow,
  type ComputerAiRuntime,
  type McpToolArea,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { HubConnections } from '../network/connections';
import type { Store } from '../store/store';

type GrantResponse = z.infer<typeof COMPUTER_MCP_GRANT_RESPONSE>;
type GrantAddress = Pick<GrantResponse, 'url' | 'pin'>;

function hashComputerMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function computerMcpGrant(
  store: Store,
  token: string,
): {
  readonly deviceId: string;
  readonly runtime: ComputerAiRuntime;
  readonly areas: readonly McpToolArea[];
  readonly localOnly: boolean;
} | null {
  const hash = hashComputerMcpToken(token);
  const node = COMPUTER_MCP_TOKEN.safeParse(token).success
    ? store.computerNodes.byRuntimeMcpToken(hash)
    : undefined;
  const local = MCP_TOKEN.safeParse(token).success
    ? store.computerNativeMcpPolicy.localGrant(hash)
    : undefined;
  const target = node === undefined ? local : { device_id: node.device_id, runtime: node.runtime };
  if (target === undefined) return null;
  const policy = store.computerNativeMcpPolicy.read(target);
  if (!policy.enabled || policy.areas?.length === 0) return null;
  return {
    deviceId: target.device_id,
    runtime: target.runtime,
    localOnly: local !== undefined,
    areas: policy.areas ?? MCP_TOOL_AREAS,
  };
}
function computerMcpGrantAddress(
  store: Store,
  connections: HubConnections | undefined,
  node: ComputerNodeRow,
): GrantAddress {
  const settings = store.settings.read();
  if (settings.public_url !== null && settings.public_url_verified_at !== null)
    return { url: new URL('/mcp', settings.public_url).href, pin: null };
  if (connections === undefined)
    throw new ApiError(
      'upstream_failed',
      'This hub has no public address and no connection identity to pin its own address.',
    );
  return {
    url: new URL('/mcp', node.hub_url).href,
    pin: connections.publicIdentity().identity.id,
  };
}
export function manageComputerMcpGrant(
  context: { readonly store: Store; readonly connections?: HubConnections | undefined },
  node: ComputerNodeRow,
  request: z.infer<typeof COMPUTER_MCP_GRANT_REQUEST>,
  runtime: ComputerAiRuntime = 'claude',
): GrantResponse {
  const { store } = context;
  const address = computerMcpGrantAddress(store, context.connections, node);
  if (request.action === 'revoke') {
    store.computerNodes.setRuntimeMcpToken(node.device_id, runtime, null);
    return { token: null, ...address, valid: false };
  }
  if (request.action === 'verify') {
    const grant = computerMcpGrant(store, request.token);
    return {
      token: null,
      ...address,
      valid: grant?.deviceId === node.device_id && grant.runtime === runtime,
    };
  }
  const policy = store.computerNativeMcpPolicy.read({ device_id: node.device_id, runtime });
  if (!policy.enabled || policy.areas?.length === 0)
    throw new ApiError(
      'forbidden',
      'The owner must enable native MCP and grant areas for this computer and runtime first.',
    );
  const token = `scg_${randomBytes(32).toString('base64url')}`;
  store.computerNodes.setRuntimeMcpToken(node.device_id, runtime, hashComputerMcpToken(token));
  return { token, ...address, valid: true };
}
