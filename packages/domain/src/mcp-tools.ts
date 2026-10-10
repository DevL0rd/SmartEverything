import { API_ENDPOINTS } from './api/endpoints';
import type { McpToolSummary } from './mcp/areas';
import { MCP_CORE_TOOLS } from './mcp/catalogue';
import { MCP_OPERATION_TOOLS, type McpPartName } from './mcp/names';
import { isAdminOperation, mcpOperationArea } from './mcp/operations';

type McpPartText = McpToolSummary<McpPartName>;

const ADMIN_NOTE = ' Not available to a plugin’s request.';

function titleOf(name: string): string {
  const words = name.replaceAll('_', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

const OPERATION_TOOLS: readonly McpPartText[] = MCP_OPERATION_TOOLS.map(([name, operation]) => {
  const endpoint = API_ENDPOINTS[operation];
  const admin = isAdminOperation(operation) ? ADMIN_NOTE : '';
  return {
    name,
    title: titleOf(name),
    description: `${endpoint.summary}.${admin}`,
    access: endpoint.method === 'GET' ? 'read' : 'control',
    area: mcpOperationArea(endpoint),
  };
});

export const MCP_PART_TEXTS: readonly McpPartText[] = [...MCP_CORE_TOOLS, ...OPERATION_TOOLS];

export const MCP_PATHS = {
  mcp: '/mcp',
  resourceMetadata: '/.well-known/oauth-protected-resource',
  mcpResourceMetadata: '/.well-known/oauth-protected-resource/mcp',
  serverMetadata: '/.well-known/oauth-authorization-server',
  register: '/oauth/register',
  authorize: '/oauth/authorize',
  token: '/oauth/token',
  revoke: '/oauth/revoke',
} as const;

export const MCP_SCOPE = 'mcp';
