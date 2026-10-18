import { withRequestSignal } from './request-signal';
import { assertOwnerRoute } from './owner-route';
import { assertScopeRoute } from './person-scope';
import { withControlCaller } from './local-control-context';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  API_ENDPOINTS,
  ApiError,
  NO_BODY,
  type ApiEndpoints,
  type ClientRow,
  type EndpointName,
  type EndpointShape,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { ComputerEndpointName } from '../computers/computer-routes';
import type { PhoneEndpointName } from '../phones/phone-routes';
import type { Store } from '../store/store';
import { beginHandler, type HandlerRun } from './handlers/handler-log';
import { memberEngineProjection } from './member-engine';
import { RouteIndex, type Found } from './route-index';
import { authenticate, roleOfCaller, type Caller } from './auth';
import { invalid, issuesOf } from './errors';
import { noteCaller, noteRoute } from './request-trace';
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

export interface Bound<S extends EndpointShape = EndpointShape> {
  readonly endpoint: S;
  readonly run: (caller: Caller, raw: RawInput, log: Logger) => Promise<unknown>;
}

function roleFor(caller: Caller, access: EndpointShape['access']): ClientRow['role'] | null {
  const role = caller.kind === 'client' || caller.kind === 'service' ? roleOfCaller(caller) : null;
  if (access === 'owner' && role !== 'owner')
    throw new ApiError('forbidden', 'Only an owner may do this.');
  return role;
}

function validResponse(endpoint: EndpointShape, result: unknown, log: Logger): unknown {
  const response = endpoint.response.safeParse(result);
  if (response.success) return response.data;
  log.error('response.invalid', undefined, {
    path: endpoint.path,
    issues: issuesOf(response.error),
  });
  throw new ApiError('internal', `The server built an invalid response for ${endpoint.path}.`);
}

function validated<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
  endpoint: Typed<P, Q, B, z.ZodType>,
  raw: RawInput,
  run: HandlerRun,
): { params: z.output<P>; query: z.output<Q>; body: z.output<B> } {
  const params = endpoint.params.safeParse(raw.params);
  if (!params.success) {
    run.rejected('path', params.error);
    throw invalid('path', params.error);
  }
  const query = endpoint.query.safeParse(raw.query);
  if (!query.success) {
    run.rejected('query', query.error);
    throw invalid('query', query.error);
  }
  const body = endpoint.body.safeParse(raw.body);
  if (!body.success) {
    run.rejected('body', body.error);
    throw invalid('body', body.error);
  }
  return { params: params.data, query: query.data, body: body.data };
}

export function bound<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
  S extends EndpointShape,
>(
  endpoint: S & Typed<P, Q, B, R>,
  handler: (input: HandlerInput<P, Q, B>) => z.input<R> | Promise<z.input<R>>,
): Bound<S> {
  return {
    endpoint,
    run: async (caller, raw, log): Promise<unknown> => {
      const run = beginHandler(`${endpoint.method} ${endpoint.path}`, endpoint.access, caller);
      try {
        const role = roleFor(caller, endpoint.access);
        const input = validated(endpoint, raw, run);
        const startedAt = performance.now();
        const result = await withControlCaller(caller, () =>
          handler({ ...input, caller, remote: raw.remote }),
        );
        const response = validResponse(endpoint, result, log);
        run.finished(Math.round((performance.now() - startedAt) * 100) / 100);
        return caller.kind === 'client' && role !== 'owner'
          ? memberEngineProjection(response)
          : response;
      } catch (cause) {
        run.failed(cause);
        throw cause;
      }
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
  | 'reportClientFailures'
  | 'readMachineUpdate'
  | ComputerEndpointName;

export type RouteOf<N extends EndpointName> = Bound<ApiEndpoints[N]>;

export type Routes<K extends EndpointName> = {
  readonly [N in K]: RouteOf<N>;
};

export type RouteTable = Routes<Exclude<EndpointName, ExtensionEndpointName>>;

export type ExtensionRouteTable = Partial<Routes<ExtensionEndpointName>>;

export type Matched = Found<Bound>;

export class Router {
  private readonly index = new RouteIndex<Bound>();

  constructor(
    table: RouteTable & ExtensionRouteTable,
    private readonly store: Store,
    private readonly log: Logger,
  ) {
    for (const entry of Object.values<Bound | undefined>(table)) {
      if (entry !== undefined) {
        this.index.add(entry.endpoint.method, entry.endpoint.path, entry);
      }
    }
  }

  match(method: string, pathname: string): Matched | 'wrong_method' | null {
    return this.index.find(method, pathname);
  }

  async dispatch(
    matched: Matched,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const endpoint = matched.value.endpoint;
    noteRoute(response, `${endpoint.method} ${endpoint.path}`, endpoint.access);
    const caller = authenticate(
      this.store,
      request,
      endpoint.access,
      endpoint === API_ENDPOINTS.session,
    );
    noteCaller(response, caller);
    assertOwnerRoute(this.store, caller, endpoint);
    assertScopeRoute(this.store, caller, endpoint, matched.params);
    const limit = endpoint.access === 'public' ? PUBLIC_BODY_LIMIT : BODY_LIMIT;
    const body = parseJsonBody(request, await readBody(request, limit));
    if (endpoint.body === NO_BODY && body !== undefined) {
      throw new ApiError('invalid_request', `${endpoint.method} ${endpoint.path} takes no body.`);
    }
    const url = new URL(request.url ?? '/', 'http://server');
    const result = await withRequestSignal(request, response, () =>
      matched.value.run(
        caller,
        {
          params: matched.params,
          query: Object.fromEntries(url.searchParams),
          body,
          remote: remoteOf(request),
        },
        this.log,
      ),
    );
    sendJson(response, 200, result);
  }
}
