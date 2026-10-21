import {
  API_ENDPOINTS,
  MCP_ROUTES,
  isMcpToolName,
  mcpToolOperation,
  partsOf,
  type EndpointName,
} from '@smarteverything/domain';

export const NATIVE_BRIDGE_REFUSAL =
  'Hub conversations cannot access the hub-local native desktop session bridge.';

export function reachesNativeBridge(name: string): boolean {
  const route = isMcpToolName(name) ? MCP_ROUTES.get(name) : undefined;
  const parts = route === undefined ? [name] : partsOf(route);
  return parts.some((part) => {
    const operation = mcpToolOperation(part);
    return operation !== undefined && nativeBridgeOperation(operation);
  });
}

export function nativeBridgeOperation(operation: EndpointName): boolean {
  return API_ENDPOINTS[operation].path.startsWith('/api/claude/');
}
