import { API_ENDPOINTS } from '../api/endpoints';
import type { EndpointName } from '../api/endpoints';
import type { EndpointShape } from '../api/endpoint';
import type { McpToolArea } from './areas';
import { mcpOperationArea } from './operations';

export const OPEN_OPERATIONS = [
  'session',
  'readSnapshot',
  'hubConnection',
  'reportClientFailures',
  'readSettings',
  'readLayout',
  'saveLayout',
  'savePushTarget',
  'removePushTarget',
  'readExchangeRates',
  'refreshExchangeRates',
  'readSharedClipboard',
  'writeSharedClipboard',
  'updateProfile',
  'selectProfile',
  'createAccessRequest',
  'listAccessRequests',
] as const satisfies readonly EndpointName[];

const OPEN: ReadonlySet<EndpointShape> = new Set(
  OPEN_OPERATIONS.map((name) => API_ENDPOINTS[name]),
);

export function endpointAccessArea(endpoint: EndpointShape): McpToolArea | null {
  return OPEN.has(endpoint) ? null : mcpOperationArea(endpoint);
}
