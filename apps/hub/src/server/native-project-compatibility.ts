import type { IncomingHttpHeaders } from 'node:http';
import {
  NATIVE_MANAGED_PROJECT_HEADER_VALUE,
  nativeProjectProjection,
} from '@smarteverything/domain';
export function nativeProjectResponse(value: unknown, headers: IncomingHttpHeaders): unknown {
  const accept = headers.accept;
  const accepted =
    typeof accept === 'string' &&
    accept
      .split(',')
      .map((part) => part.trim())
      .includes(NATIVE_MANAGED_PROJECT_HEADER_VALUE);
  return nativeProjectProjection(value, accepted);
}
