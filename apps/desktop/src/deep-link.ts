import { parsePairingInvitation } from '@smarteverything/domain';
import { DEEP_LINK_SCHEME } from './origin.js';

const DEEP_LINK_ROUTES = ['auth/callback', 'pair'] as const;

const MAX_DEEP_LINK_LENGTH = 4096;

export type DeepLinkParse =
  | { readonly kind: 'accepted'; readonly url: string }
  | { readonly kind: 'refused'; readonly reason: string; readonly received: string };

function routeOf(url: URL): string {
  return `${url.host}${url.pathname}`.replace(/\/+$/u, '');
}

export function parseDeepLink(candidate: string): DeepLinkParse {
  if (candidate.length > MAX_DEEP_LINK_LENGTH) {
    return { kind: 'refused', reason: 'the link is too long', received: '[redacted deep link]' };
  }
  if (!URL.canParse(candidate)) {
    return { kind: 'refused', reason: 'the link is not a URL', received: '[redacted deep link]' };
  }
  const url = new URL(candidate);
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) {
    return {
      kind: 'refused',
      reason: `the scheme is not ${DEEP_LINK_SCHEME}:`,
      received: '[redacted deep link]',
    };
  }
  const route = routeOf(url);
  if (!DEEP_LINK_ROUTES.some((known) => known === route)) {
    return {
      kind: 'refused',
      reason: 'the route is not handled',
      received: '[redacted deep link]',
    };
  }
  if (route === 'pair' && !parsePairingInvitation(candidate).ok)
    return {
      kind: 'refused',
      reason: 'the pairing invitation is invalid',
      received: '[redacted deep link]',
    };
  return { kind: 'accepted', url: url.toString() };
}

export function deepLinkInArguments(argv: readonly string[]): string | undefined {
  return argv.find((argument) => argument.startsWith(`${DEEP_LINK_SCHEME}://`));
}
