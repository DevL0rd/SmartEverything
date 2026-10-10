import { DEEP_LINK_SCHEME } from './origin.js';

const DEEP_LINK_ROUTES = ['auth/callback'] as const;

const MAX_DEEP_LINK_LENGTH = 4096;

export type DeepLinkParse =
  | { readonly kind: 'accepted'; readonly url: string }
  | { readonly kind: 'refused'; readonly reason: string; readonly received: string };

function routeOf(url: URL): string {
  return `${url.host}${url.pathname}`.replace(/\/+$/u, '');
}

export function parseDeepLink(candidate: string): DeepLinkParse {
  if (candidate.length > MAX_DEEP_LINK_LENGTH) {
    return { kind: 'refused', reason: 'the link is too long', received: candidate.slice(0, 64) };
  }
  if (!URL.canParse(candidate)) {
    return { kind: 'refused', reason: 'the link is not a URL', received: candidate };
  }
  const url = new URL(candidate);
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) {
    return {
      kind: 'refused',
      reason: `the scheme is not ${DEEP_LINK_SCHEME}:`,
      received: candidate,
    };
  }
  const route = routeOf(url);
  if (!DEEP_LINK_ROUTES.some((known) => known === route)) {
    return { kind: 'refused', reason: `the route ${route} is not handled`, received: candidate };
  }
  return { kind: 'accepted', url: url.toString() };
}

export function deepLinkInArguments(argv: readonly string[]): string | undefined {
  return argv.find((argument) => argument.startsWith(`${DEEP_LINK_SCHEME}://`));
}
