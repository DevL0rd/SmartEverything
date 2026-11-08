function originText(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function socketOriginText(url: URL): string {
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}`;
}

export function buildContentSecurityPolicy(serverUrl: string | null, mediaOrigin?: string): string {
  const server = serverUrl === null ? null : new URL(serverUrl);
  const origins = server === null ? [] : [originText(server)];
  const sockets = server === null ? [] : [socketOriginText(server)];
  const media = mediaOrigin === undefined ? [] : [mediaOrigin];
  const directives: readonly (readonly string[])[] = [
    ['default-src', "'self'"],
    ['script-src', "'self'", "'wasm-unsafe-eval'"],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', ...origins, ...media],
    ['font-src', "'self'", 'data:'],
    ['media-src', "'self'", 'blob:', ...origins, ...media],
    ['connect-src', "'self'", ...origins, ...sockets, ...media],
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
