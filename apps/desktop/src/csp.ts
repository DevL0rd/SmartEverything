function originText(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function socketOriginText(url: URL): string {
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}`;
}

export function buildContentSecurityPolicy(serverUrl: string): string {
  const server = new URL(serverUrl);
  const origin = originText(server);
  const directives: readonly (readonly string[])[] = [
    ['default-src', "'self'"],
    ['script-src', "'self'", "'wasm-unsafe-eval'"],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', origin],
    ['font-src', "'self'", 'data:'],
    ['media-src', "'self'", 'blob:', origin],
    ['connect-src', "'self'", origin, socketOriginText(server)],
    ['worker-src', "'self'", 'blob:'],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
    ['frame-ancestors', "'none'"],
  ];
  return directives.map((directive) => directive.join(' ')).join('; ');
}
