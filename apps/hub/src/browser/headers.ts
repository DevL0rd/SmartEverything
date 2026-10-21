import type { OutgoingHttpHeaders } from 'node:http';

const ASSET_SOURCES = "'self' http: https: ws: wss: data: blob:";

export function frameAncestors(ancestors: readonly string[]): string {
  return `frame-ancestors ${ancestors.join(' ')}`;
}

export function previewCsp(ancestors: readonly string[]): string {
  return [
    `default-src ${ASSET_SOURCES} 'unsafe-inline' 'unsafe-eval'`,
    `connect-src ${ASSET_SOURCES}`,
    "object-src 'none'",
    "base-uri 'self'",
    frameAncestors(ancestors),
  ].join('; ');
}

export function pageHeaders(ancestors: readonly string[]): OutgoingHttpHeaders {
  return {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': previewCsp(ancestors),
  };
}
