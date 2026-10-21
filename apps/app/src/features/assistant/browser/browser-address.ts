import { z } from 'zod';
import { browsableUrl } from '@smarteverything/domain';
export type BrowserAddress =
  | { readonly kind: 'public'; readonly url: string }
  | { readonly kind: 'rejected'; readonly reason: string };
export function browserAddress(value: string): BrowserAddress {
  const parsed = z.url().safeParse(value.includes('://') ? value : `https://${value}`);
  if (!parsed.success) return { kind: 'rejected', reason: 'Enter a web address.' };
  const url = new URL(parsed.data);
  if (url.username !== '' || url.password !== '' || value.includes('\\'))
    return { kind: 'rejected', reason: 'Use an address without credentials or backslashes.' };
  if (!browsableUrl(url.href))
    return { kind: 'rejected', reason: 'Enter an http or https web address.' };
  return { kind: 'public', url: url.href };
}
