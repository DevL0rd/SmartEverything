import { z } from 'zod';
import { publicBrowserUrl, type AiPreviewPublication } from '@smarteverything/domain';
export type BrowserAddress =
  | { readonly kind: 'preview'; readonly publication: AiPreviewPublication; readonly path: string }
  | { readonly kind: 'public'; readonly url: string }
  | { readonly kind: 'rejected'; readonly reason: string };
export function browserAddress(
  value: string,
  selected: AiPreviewPublication | null,
  publications: readonly AiPreviewPublication[],
): BrowserAddress {
  if (selected !== null && value.startsWith('/') && !value.startsWith('//'))
    return previewPath(selected, value);
  const parsed = z.url().safeParse(value.includes('://') ? value : `https://${value}`);
  if (!parsed.success)
    return {
      kind: 'rejected',
      reason: 'Enter a published service address, a relative path, or a public HTTPS address.',
    };
  const url = new URL(parsed.data);
  if (!cleanAddress(url, value))
    return { kind: 'rejected', reason: 'Use an address without credentials or backslashes.' };
  const origin = canonicalPreviewOrigin(url.href);
  const publication = publications.find(
    (row) => canonicalPreviewOrigin(row.source_origin) === origin,
  );
  if (publication !== undefined) return previewPath(publication, url.href);
  if (publicBrowserUrl(url.href)) return { kind: 'public', url: url.href };
  return { kind: 'rejected', reason: 'This service has not been shared with this chat.' };
}
function previewPath(publication: AiPreviewPublication, value: string): BrowserAddress {
  const url = new URL(value, publication.source_origin);
  if (canonicalPreviewOrigin(url.href) !== canonicalPreviewOrigin(publication.source_origin))
    return { kind: 'rejected', reason: 'This service has not been shared with this chat.' };
  return { kind: 'preview', publication, path: `${url.pathname}${url.search}${url.hash}` };
}
export function displayPreviewAddress(
  publication: AiPreviewPublication,
  currentUrl: string,
): string {
  const source = publication.source_origin.replace('127.0.0.1', 'localhost');
  if (currentUrl === '') return `${source}${publication.initial_path}`;
  const url = new URL(currentUrl);
  if (url.pathname === '/.se-preview/bootstrap') return `${source}${publication.initial_path}`;
  return `${source}${url.pathname}${url.search}${url.hash}`;
}

function canonicalPreviewOrigin(value: string): string {
  const url = new URL(value);
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.origin;
}

function cleanAddress(url: URL, value: string): boolean {
  return url.username === '' && url.password === '' && !value.includes('\\');
}
