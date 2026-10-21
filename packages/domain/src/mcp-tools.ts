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
