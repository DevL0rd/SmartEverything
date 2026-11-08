import type { FetchLike } from '../../../src/plugins/builtin/fetch-like';
import type { AccountRegistry } from './account';
import type { FaultInjector } from './faults';
import type { OAuthServer } from './oauth';
import { HttpFailure, apiFailure, type Reply } from './reply';
import { bodyText, type RequestContext } from './request';
import type { Route } from './route';

export interface RecordedRequest {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly ifMatch: string | null;
  readonly status: number;
}

export interface DispatchDeps {
  readonly routes: readonly Route[];
  readonly oauth: OAuthServer;
  readonly accounts: AccountRegistry;
  readonly faults: FaultInjector;
  readonly requests: RecordedRequest[];
}

function findRoute(
  routes: readonly Route[],
  method: string,
  url: URL,
): { readonly route: Route; readonly groups: readonly string[] } | null {
  for (const route of routes) {
    if (route.method !== method || route.host !== url.host) continue;
    const match = route.pattern.exec(url.pathname);
    if (match !== null) return { route, groups: match.slice(1) };
  }
  return null;
}

function toResponse(reply: Reply): Response {
  const body = reply.body === null ? null : JSON.stringify(reply.body);
  return new Response(body, {
    status: reply.status,
    headers: { 'content-type': 'application/json; charset=UTF-8', ...reply.headers },
  });
}

function dispatch(deps: DispatchDeps, url: URL, init: RequestInit): Reply {
  const method = (init.method ?? 'GET').toUpperCase();
  const found = findRoute(deps.routes, method, url);
  const injected = deps.faults.take(url.host, method, url.pathname);
  if (injected !== null) throw injected;
  if (found === null) throw apiFailure(404, 'Not Found', 'notFound');
  const context: RequestContext = {
    method,
    url,
    query: url.searchParams,
    headers: new Headers(init.headers),
    body: bodyText(init.body),
    groups: found.groups,
  };
  const { route } = found;
  if (route.auth === null) return route.handle(context);
  const email = deps.oauth.authenticate(context.headers, route.auth);
  return route.handle(context, deps.accounts.forEmail(email));
}

function respond(deps: DispatchDeps, input: string, init: RequestInit): Response {
  const url = new URL(input);
  if (!deps.routes.some((route) => route.host === url.host)) {
    throw new Error(`The fake Google server has no host ${url.host}.`);
  }
  let reply: Reply;
  try {
    reply = dispatch(deps, url, init);
  } catch (error) {
    if (!(error instanceof HttpFailure)) throw error;
    reply = { status: error.status, body: error.body, headers: error.headers };
  }
  deps.requests.push({
    method: (init.method ?? 'GET').toUpperCase(),
    host: url.host,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    ifMatch: new Headers(init.headers).get('if-match'),
    status: reply.status,
  });
  return toResponse(reply);
}

export function createFetch(deps: DispatchDeps): FetchLike {
  return (input, init) =>
    new Promise((resolve) => {
      resolve(respond(deps, input, init));
    });
}
