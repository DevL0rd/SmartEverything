import {
  browsableUrl,
  browserAllows,
  publicBrowserUrl,
  type BrowserTarget,
} from '@smarteverything/domain';

export interface BrowserRequest {
  readonly url: string;
  readonly resourceType: string;
}
export function policyUrl(value: string): string {
  return value.replace(/^ws(s?):/u, 'http$1:');
}
export function browserRequestAllowed(
  target: BrowserTarget | undefined,
  request: BrowserRequest,
): boolean {
  const value = policyUrl(request.url);
  if (target === undefined) return browsableUrl(value);
  const inline =
    target.kind === 'project' && ['data:', 'blob:'].some((scheme) => value.startsWith(scheme));
  const external =
    target.kind === 'project' && request.resourceType !== 'mainFrame' && publicBrowserUrl(value);
  return inline || external || browserAllows(target, value);
}
