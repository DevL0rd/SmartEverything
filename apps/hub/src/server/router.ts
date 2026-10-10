import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  API_ENDPOINTS,
  ApiError,
  NO_BODY,
  matchPath,
  type EndpointName,
  type EndpointShape,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { ComputerEndpointName } from '../computers/computer-routes';
import type { PhoneEndpointName } from '../phones/phone-routes';
import type { Store } from '../store/store';
import { authenticate, type Caller } from './auth';
import { invalid, issuesOf } from './errors';
import { BODY_LIMIT, PUBLIC_BODY_LIMIT, parseJsonBody, readBody, remoteOf, sendJson } from './http';

export interface HandlerInput<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> {
  readonly params: z.output<P>;
  readonly query: z.output<Q>;
  readonly body: z.output<B>;
  readonly caller: Caller;
  readonly remote: string;
}

interface Typed<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
> extends EndpointShape {
  readonly params: P;
  readonly query: Q;
  readonly body: B;
  readonly response: R;
}

interface RawInput {
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
  readonly remote: string;
}

export interface Bound {
  readonly endpoint: EndpointShape;
  readonly run: (caller: Caller, raw: RawInput, log: Logger) => Promise<unknown>;
}

export function bound<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
>(
  endpoint: Typed<P, Q, B, R>,
  handler: (input: HandlerInput<P, Q, B>) => z.input<R> | Promise<z.input<R>>,
): Bound {
  return {
    endpoint,
    run: async (caller, raw, log): Promise<unknown> => {
      const params = endpoint.params.safeParse(raw.params);
      if (!params.success) {
        throw invalid('path', params.error);
      }
      const query = endpoint.query.safeParse(raw.query);
      if (!query.success) {
        throw invalid('query', query.error);
      }
      const body = endpoint.body.safeParse(raw.body);
      if (!body.success) {
        throw invalid('body', body.error);
      }
      const result = await handler({
        params: params.data,
        query: query.data,
        body: body.data,
        caller,
        remote: raw.remote,
      });
      const response = endpoint.response.safeParse(result);
      if (!response.success) {
        log.error('response.invalid', undefined, {
          path: endpoint.path,
          issues: issuesOf(response.error),
        });
        throw new ApiError(
          'internal',
          `The server built an invalid response for ${endpoint.path}.`,
        );
      }
      return response.data;
    },
  };
}

export const DONE_REPLY = { ok: true } as const;

type ExtensionEndpointName =
  | 'readPushStatus'
  | 'readSmartThingsApp'
  | 'setUpSmartThings'
  | 'authorizeSmartThings'
  | 'createApprovalCode'
  | 'updateMcpTools'
  | 'listMcpConsents'
  | 'decideMcpConsent'
  | PhoneEndpointName
  | ComputerEndpointName;

export type RouteTable = Readonly<Record<Exclude<EndpointName, ExtensionEndpointName>, Bound>>;

export type ExtensionRouteTable = Readonly<Partial<Record<ExtensionEndpointName, Bound>>>;

class RouteTableError extends Error {
  override readonly name = 'RouteTableError';

  constructor(name: string) {
    super(`The handler registered as ${name} implements a different endpoint.`);
  }
}

interface Route {
  readonly name: string;
  readonly bound: Bound;
  readonly literals: number;
}

export interface Matched {
  readonly route: Route;
  readonly params: Readonly<Record<string, string>>;
}

function literalCount(path: string): number {
  return path.split('/').filter((segment) => segment !== '' && !segment.startsWith(':')).length;
}

export class Router {
  private readonly routes: readonly Route[];

  constructor(
    table: RouteTable & ExtensionRouteTable,
    private readonly store: Store,
    private readonly log: Logger,
  ) {
    this.routes = Object.entries(table)
      .map(([name, entry]: [string, Bound]) => {
        const declared: unknown = Object.entries(API_ENDPOINTS).find(([key]) => key === name)?.[1];
        if (declared !== entry.endpoint) {
          throw new RouteTableError(name);
        }
        return { name, bound: entry, literals: literalCount(entry.endpoint.path) };
      })
      .sort((left, right) => right.literals - left.literals);
  }

  match(method: string, pathname: string): Matched | 'wrong_method' | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const params = matchPath(route.bound.endpoint.path, pathname);
      if (params === null) {
        continue;
      }
      pathMatched = true;
      if (route.bound.endpoint.method === method) {
        return { route, params };
      }
    }
    return pathMatched ? 'wrong_method' : null;
  }

  async dispatch(
    matched: Matched,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const endpoint = matched.route.bound.endpoint;
    const caller = authenticate(this.store, request, endpoint.access);
    const limit = endpoint.access === 'public' ? PUBLIC_BODY_LIMIT : BODY_LIMIT;
    const body = parseJsonBody(request, await readBody(request, limit));
    if (endpoint.body === NO_BODY && body !== undefined) {
      throw new ApiError('invalid_request', `${endpoint.method} ${endpoint.path} takes no body.`);
    }
    const url = new URL(request.url ?? '/', 'http://server');
    const result = await matched.route.bound.run(
      caller,
      {
        params: matched.params,
        query: Object.fromEntries(url.searchParams),
        body,
        remote: remoteOf(request),
      },
      this.log,
    );
    sendJson(response, 200, result);
  }
}
