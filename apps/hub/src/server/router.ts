import { withRequestSignal } from './request-signal';
import { assertOwnerRoute } from './owner-route';
import { assertScopeRoute } from './person-scope';
import { withControlCaller } from './local-control-context';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
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
import type { TreadmillEndpointName } from '../local/treadmill/routes';
import type { BrushEndpointName } from '../local/toothbrush/routes';
import type { BottleEndpointName } from '../local/bottle/routes';
import type { Store } from '../store/store';
import { beginHandler, type HandlerRun } from './handlers/handler-log';
import { RouteIndex, type Found } from './route-index';
import { authenticate, roleOfCaller, type Caller } from './auth';
import { InvalidResponseError } from './errors';
import { invalid } from './invalid';
import { requestBodyOf } from './request-body';
import { noteCaller, noteRoute } from './request-trace';
import { sendTagged } from './entity-tag';
import {
  BODY_LIMIT,
  PUBLIC_BODY_LIMIT,
  assertJsonBody,
  readBody,
  remoteOf,
  sendJsonText,
} from './http';
import { checkedResponse } from './responses/check';
import { endpointNameOf, type ResponseEncoder } from './responses/encoder';

export interface HandlerInput<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> {
  readonly params: z.output<P>;
  readonly query: z.output<Q>;
  readonly body: z.output<B>;
  readonly caller: Caller;
  readonly remote: string;
  readonly headers: IncomingHttpHeaders;
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
  readonly headers: IncomingHttpHeaders;
}

export interface ServedInput extends Omit<RawInput, 'body'> {
  readonly body: Uint8Array | undefined;
}

export interface Served {
  readonly value: unknown;
  readonly text: string;
}

export interface Bound<S extends EndpointShape = EndpointShape> {
  readonly endpoint: S;
  readonly run: (caller: Caller, raw: RawInput, log: Logger) => Promise<unknown>;
  readonly serve: (caller: Caller, raw: ServedInput, encoder: ResponseEncoder) => Promise<Served>;
  readonly entityTag?: (response: unknown) => string;
}

export function tagged<S extends EndpointShape>(
  route: Bound<S>,
  entityTag: (response: unknown) => string,
): Bound<S> {
  return { ...route, entityTag };
}

function roleFor(caller: Caller, access: EndpointShape['access']): ClientRow['role'] | null {
  const role = caller.kind === 'client' || caller.kind === 'service' ? roleOfCaller(caller) : null;
  if (access === 'owner' && role !== 'owner')
    throw new ApiError('forbidden', 'Only an owner may do this.');
  return role;
}

function validResponse(endpoint: EndpointShape, result: unknown, member: boolean): unknown {
  const check = checkedResponse(endpoint, result, member);
  if (check.valid) return check.value;
  throw new InvalidResponseError(endpoint.path, check.issueCodes);
}

async function encodedResponse(
  encoder: ResponseEncoder,
  endpoint: EndpointShape,
  handled: Handled,
): Promise<string> {
  const encoded = await encoder.encode(endpoint, JSON.stringify(handled.value), handled.member);
  if (encoded.valid) return encoded.text;
  throw new InvalidResponseError(endpoint.path, encoded.issueCodes);
}

type BodyOf<B extends z.ZodType> = (run: HandlerRun) => Promise<z.output<B>> | z.output<B>;

async function validated<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
  endpoint: Typed<P, Q, B, z.ZodType>,
  raw: Omit<RawInput, 'body'>,
  run: HandlerRun,
  bodyOf: BodyOf<B>,
): Promise<{ params: z.output<P>; query: z.output<Q>; body: z.output<B> }> {
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
  return { params: params.data, query: query.data, body: await bodyOf(run) };
}

function checkedBody<B extends z.ZodType>(schema: B, value: unknown): BodyOf<B> {
  return (run) => {
    const body = schema.safeParse(value);
    if (body.success) return body.data;
    run.rejected('body', body.error);
    throw invalid('body', body.error);
  };
}

function decodedBody<B extends z.ZodType>(
  endpoint: EndpointShape & { readonly body: B },
  bytes: Uint8Array | undefined,
  encoder: ResponseEncoder,
): BodyOf<B> {
  if (bytes === undefined) return checkedBody(endpoint.body, undefined);
  return async (run) => {
    try {
      return await requestBodyOf(encoder, endpoint, bytes);
    } catch (cause) {
      run.rejected('body', cause);
      throw cause;
    }
  };
}

interface Handled {
  readonly value: unknown;
  readonly member: boolean;
  readonly run: HandlerRun;
  readonly handlerMs: number;
}

type Handler<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, R extends z.ZodType> = (
  input: HandlerInput<P, Q, B>,
) => z.input<R> | Promise<z.input<R>>;

async function handledBy<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
>(
  endpoint: Typed<P, Q, B, R>,
  handler: Handler<P, Q, B, R>,
  caller: Caller,
  request: { readonly raw: Omit<RawInput, 'body'>; readonly bodyOf: BodyOf<B> },
): Promise<Handled> {
  const { raw, bodyOf } = request;
  const run = beginHandler(`${endpoint.method} ${endpoint.path}`, endpoint.access, caller);
  try {
    const role = roleFor(caller, endpoint.access);
    const input = await validated(endpoint, raw, run, bodyOf);
    const startedAt = performance.now();
    const value: unknown = await withControlCaller(caller, () =>
      handler({ ...input, caller, remote: raw.remote, headers: raw.headers }),
    );
    const handlerMs = Math.round((performance.now() - startedAt) * 100) / 100;
    return { value, member: caller.kind === 'client' && role !== 'owner', run, handlerMs };
  } catch (cause) {
    run.failed(cause);
    throw cause;
  }
}

async function finished<T>(handled: Handled, finish: () => T | Promise<T>): Promise<T> {
  try {
    const result = await finish();
    handled.run.finished(handled.handlerMs);
    return result;
  } catch (cause) {
    handled.run.failed(cause);
    throw cause;
  }
}

export function bound<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
  S extends EndpointShape,
>(endpoint: S & Typed<P, Q, B, R>, handler: Handler<P, Q, B, R>): Bound<S> {
  return {
    endpoint,
    run: async (caller, raw): Promise<unknown> => {
      const handled = await handledBy(endpoint, handler, caller, {
        raw,
        bodyOf: checkedBody(endpoint.body, raw.body),
      });
      return finished(handled, () => validResponse(endpoint, handled.value, handled.member));
    },
    serve: async (caller, raw, encoder): Promise<Served> => {
      const handled = await handledBy(endpoint, handler, caller, {
        raw,
        bodyOf: decodedBody(endpoint, raw.body, encoder),
      });
      const text = await finished(handled, () => encodedResponse(encoder, endpoint, handled));
      return { value: handled.value, text };
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
  | TreadmillEndpointName
  | BrushEndpointName
  | BottleEndpointName
  | 'reportClientPerf'
  | 'readUpdateRevisions'
  | 'readMachineUpdate'
  | 'publishMachineUpdate'
  | 'rollbackMachineUpdate'
  | 'withdrawMachineUpdate'
  | 'beginReleaseUpload'
  | 'listReleaseUploads'
  | 'readReleaseUpload'
  | 'finishReleaseUpload'
  | 'readAppUpdate'
  | 'listAppUpdates'
  | 'publishAppUpdate'
  | 'promoteAppUpdate'
  | 'rollbackAppUpdate'
  | 'withdrawAppUpdate'
  | 'pruneAppUpdateBlobs'
  | 'readAppUpdateKey'
  | 'readAndroidAppBuild'
  | 'readAndroidAppBuilds'
  | 'readAndroidApkOffer'
  | 'readAndroidUpdateHistory'
  | 'reportAppUpdate'
  | 'reportAndroidAppBuild'
  | 'uploadModelAsset'
  | 'readModelAsset'
  | 'uploadHomeMapScan'
  | 'homeMapScanLink'
  | 'removeHomeMapScan'
  | 'importPlannerCalendar'
  | 'exportPlannerCalendar'
  | 'exportPlannerItem'
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
    private readonly encoder: ResponseEncoder,
  ) {
    for (const entry of Object.values<Bound | undefined>(table)) {
      if (entry !== undefined) {
        endpointNameOf(entry.endpoint);
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
    const caller = await authenticate(
      this.store,
      request,
      endpoint.access,
      endpoint === API_ENDPOINTS.session,
    );
    noteCaller(response, caller);
    assertOwnerRoute(this.store, caller, endpoint);
    await assertScopeRoute(this.store, caller, endpoint, matched.params);
    const limit = endpoint.access === 'public' ? PUBLIC_BODY_LIMIT : BODY_LIMIT;
    const raw = await readBody(request, limit);
    const body = raw.byteLength === 0 ? undefined : raw;
    if (endpoint.body === NO_BODY && body !== undefined) {
      throw new ApiError('invalid_request', `${endpoint.method} ${endpoint.path} takes no body.`);
    }
    if (body !== undefined) assertJsonBody(request);
    const url = new URL(request.url ?? '/', 'http://server');
    const served = await withRequestSignal(request, response, () =>
      matched.value.serve(
        caller,
        {
          params: matched.params,
          query: Object.fromEntries(url.searchParams),
          body,
          remote: remoteOf(request),
          headers: request.headers,
        },
        this.encoder,
      ),
    );
    const { entityTag } = matched.value;
    if (entityTag === undefined) {
      sendJsonText(response, 200, served.text);
      return;
    }
    sendTagged(request, response, served.text, entityTag(served.value));
  }
}
