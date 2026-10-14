import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError } from '@smarteverything/domain';
import type { ViewerLease } from './leases';
import { serveProjectAsset } from './project-response';
import { isHtmlPreview } from './sources';
export async function servePreviewHtml(
  request: IncomingMessage,
  response: ServerResponse,
  input: {
    readonly path: string;
    readonly lease: ViewerLease;
    readonly ancestors: readonly string[];
  },
): Promise<boolean> {
  const { path, lease, ancestors } = input;
  if (!isHtmlPreview(lease.publication)) return false;
  if (lease.publication.readAsset !== undefined) {
    await serveProjectAsset(request, response, {
      publication: lease.publication,
      path,
      signal: lease.abort.signal,
      ancestors,
    });
    return true;
  }
  if (!['GET', 'HEAD'].includes(request.method ?? ''))
    throw new ApiError('forbidden', 'Standalone HTML previews only serve their published content.');
  if (new URL(path, `https://${lease.host}`).pathname !== '/')
    throw new ApiError('not_found', 'This standalone HTML has no published asset at that path.');
  const html = await lease.publication.readHtml();
  lease.abort.signal.throwIfAborted();
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors ${ancestors.join(' ')}`,
  });
  response.end(request.method === 'HEAD' ? undefined : html);
  return true;
}
