import path from 'node:path';

export const OVERLAY_SCHEME = 'smarteverything-overlay';
const OVERLAY_HOST = 'page';
export const OVERLAY_PAGE_URL = `${OVERLAY_SCHEME}://${OVERLAY_HOST}/overlay.html`;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
};

export type OverlayAssetPlan =
  | { readonly kind: 'file'; readonly filePath: string; readonly contentType: string }
  | { readonly kind: 'refused'; readonly status: number; readonly reason: string };

export function planOverlayAsset(root: string, requestUrl: string): OverlayAssetPlan {
  const url = new URL(requestUrl);
  if (url.host !== OVERLAY_HOST) {
    return { kind: 'refused', status: 404, reason: `unknown overlay host ${url.host}` };
  }
  const absoluteRoot = path.resolve(root);
  const filePath = path.resolve(
    absoluteRoot,
    `.${path.posix.normalize(decodeURIComponent(url.pathname))}`,
  );
  const relative = path.relative(absoluteRoot, filePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { kind: 'refused', status: 403, reason: `${url.pathname} leaves the overlay assets` };
  }
  const contentType = CONTENT_TYPES[path.extname(filePath)];
  if (contentType === undefined) {
    return { kind: 'refused', status: 404, reason: `${url.pathname} is not an overlay asset type` };
  }
  return { kind: 'file', filePath, contentType };
}
