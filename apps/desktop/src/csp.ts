function originText(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function socketOriginText(url: URL): string {
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}`;
}

export function buildContentSecurityPolicy(serverUrl: string, mediaOrigin?: string): string {
  const server = new URL(serverUrl);
  const origin = originText(server);
  const media = mediaOrigin === undefined ? [] : [mediaOrigin];
  const directives: readonly (readonly string[])[] = [
    ['default-src', "'self'"],
    ['script-src', "'self'", "'wasm-unsafe-eval'"],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', origin, ...media],
    ['font-src', "'self'", 'data:'],
    ['media-src', "'self'", 'blob:', origin, ...media],
    ['connect-src', "'self'", origin, socketOriginText(server), ...media],
    ['worker-src', "'self'", 'blob:'],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
    ['frame-ancestors', "'none'"],
  ];
  return directives.map((directive) => directive.join(' ')).join('; ');
}

export const OVERLAY_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
