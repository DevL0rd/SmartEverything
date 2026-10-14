import type { IncomingHttpHeaders } from 'node:http';
import {
  NATIVE_MANAGED_PROJECT_HEADER_VALUE,
  nativeProjectProjection,
} from '@smarteverything/domain';
export function nativeProjectResponse(
  value: unknown,
  headers: IncomingHttpHeaders,
  endpoint?: string,
): unknown {
  const accept = headers.accept;
  const accepted =
    typeof accept === 'string' &&
    accept
      .split(',')
      .map((part) => part.trim())
      .includes(NATIVE_MANAGED_PROJECT_HEADER_VALUE);
  return nativeProjectProjection(value, accepted, projectionFor(endpoint));
}
function projectionFor(
  endpoint: string | undefined,
): Parameters<typeof nativeProjectProjection>[2] {
  switch (endpoint) {
    case undefined:
    case 'readComputerAi':
    case 'updateComputerAi':
    case 'readComputerRuntime':
    case 'updateComputerRuntime':
      return 'status';
    case 'readAiEngineCatalogue':
      return 'catalogue';
    case 'readAiChatProvider':
      return 'provider';
    case 'readComputerRuntimeState':
    case 'executeComputerRuntime':
      return 'reply';
    default:
      return 'opaque';
  }
}
