import { z } from 'zod';
import {
  API_ENDPOINTS as E,
  LIVE_SEQUENCE_HEADER,
  SEQ,
  apiErrorOf,
  buildPath,
  encodeQuery,
  type EndpointShape,
  type NativeHubResourcePurpose,
} from '@smarteverything/domain';
import { jsonText } from '../../format/json-text';
import { WIRE_QUERY, wireQueryOf, type CallInput, type TypedEndpoint } from './request';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../format/errors';
import { readLeniently, readTablesLeniently } from './readable';
import { assertHubLease, type HubRouteLease } from './active-route';
import { hubNetwork } from './route-platform';
import { presentMediaResource } from './media-resources';
import { RequestTrace, noteSendFailure } from './request-log';

const log = new Logger('app.api');

export class ServerUnreachableError extends Error {
  override readonly name = 'ServerUnreachableError';

  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`The SmartEverything server at ${url} could not be reached: ${reason}.`);
  }
}

export class UnreadableAnswerError extends Error {
  override readonly name = 'UnreadableAnswerError';

  constructor(
    readonly route: string,
    readonly issues: string,
  ) {
    super(`The server answered ${route} with something this app cannot read: ${issues}.`);
  }
}

export class InvalidRequestError extends Error {
  override readonly name = 'InvalidRequestError';

  constructor(
    readonly route: string,
    readonly part: string,
    readonly issues: string,
  ) {
    super(`The app built an invalid ${part} for ${route}: ${issues}.`);
  }
}

const PATH_PARAMS = z.record(z.string(), z.string());
const HEADER_SEQUENCE = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .transform(Number)
  .pipe(SEQ);

function sequenceOf(response: Response): number | null {
  const value = response.headers.get(LIVE_SEQUENCE_HEADER);
  return value === null ? null : HEADER_SEQUENCE.parse(value);
}

function issuesOf(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'value'} ${issue.message}`)
    .join('; ');
}

function checked<S extends z.ZodType>(
  route: string,
  part: string,
  schema: S,
  value: unknown,
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    log.warn('api.request_invalid', { route, part, issues: issuesOf(parsed.error) });
    throw new InvalidRequestError(route, part, issuesOf(parsed.error));
  }
  return parsed.data;
}

const warned = new Set<string>();

function noteIgnored(route: string, ignored: readonly string[]): void {
  if (ignored.length > 0 && !warned.has(route)) {
    warned.add(route);
    log.warn('api.newer_fields_ignored', { route, fields: ignored.slice(0, 10).join(', ') });
  }
}

function answered<S extends z.ZodType>(route: string, schema: S, value: unknown): z.output<S> {
  const read = readLeniently(schema, value);
  if (!read.ok) {
    log.warn('api.answer_unreadable', { route, issues: issuesOf(read.error) });
    throw new UnreadableAnswerError(route, issuesOf(read.error));
  }
  noteIgnored(route, read.ignored);
  return read.data;
}

export interface TablesAnswer<T> {
  readonly data: T;
  readonly skipped: readonly string[];
}

function answeredTables<S extends z.ZodType>(
  route: string,
  schema: S,
  value: unknown,
  roots: readonly string[],
): TablesAnswer<z.output<S>> {
  const read = readTablesLeniently(schema, value, roots);
  if (!read.ok) {
    log.warn('api.answer_unreadable', { route, issues: issuesOf(read.error), roots });
    throw new UnreadableAnswerError(route, issuesOf(read.error));
  }
  noteIgnored(route, read.ignored);
  read.dropped.forEach((rows) => {
    log.warn('api.rows_skipped', {
      route,
      table: rows.table,
      rows: rows.count,
      reason: rows.reason,
    });
  });
  const wholly = read.skipped.filter((table) => !read.dropped.some((rows) => rows.table === table));
  if (wholly.length > 0) {
    log.warn('api.tables_skipped', { route, tables: wholly.join(', ') });
  }
  return { data: read.data, skipped: read.skipped };
}

function routeOf(endpoint: EndpointShape): string {
  return `${endpoint.method} ${endpoint.path}`;
}

async function bodyOf(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return null;
  }
  const read = jsonText(text);
  return read.ok ? read.value : text;
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly token: string | null;
  readonly fetch: typeof fetch;
  readonly onUnauthorized: () => void;
  readonly route?: () => HubRouteLease;
  readonly ready?: () => Promise<void>;
  readonly mediaRoute?: () => HubRouteLease;
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  urlOf(path: string): string {
    return `${this.options.mediaRoute?.().baseUrl ?? this.baseUrl}${path}`;
  }

  async resourceUrl(
    path: string,
    expiresAt: string,
    purpose: NativeHubResourcePurpose,
  ): Promise<string> {
    const lease = this.options.mediaRoute?.();
    return presentMediaResource(lease, this.urlOf(path), expiresAt, purpose);
  }

  forMedia(streamed = true): ApiClient {
    const select =
      streamed && hubNetwork().capabilities.httpMedia === true
        ? this.options.route
        : this.options.mediaRoute;
    if (select === undefined) return this;
    let pinned: HubRouteLease | null = null;
    const route = (): HubRouteLease => {
      pinned ??= select();
      assertHubLease(pinned, 'GET');
      return pinned;
    };
    return new ApiClient({ ...this.options, route, mediaRoute: route });
  }

  async call<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, R extends z.ZodType>(
    endpoint: TypedEndpoint<P, Q, B, R>,
    input: CallInput<P, Q, B>,
    options: {
      readonly signal?: AbortSignal;
      readonly onSequence?: (seq: number | null) => void;
    } = {},
  ): Promise<z.output<R>> {
    let sequence: number | null = null;
    const answer = await this.answerOf(endpoint, input, options.signal, (value) => {
      sequence = value;
    });
    const result = answered(routeOf(endpoint), endpoint.response, answer);
    options.onSequence?.(sequence);
    return result;
  }

  async callTables<
    P extends z.ZodType,
    Q extends z.ZodType,
    B extends z.ZodType,
    R extends z.ZodType,
  >(
    endpoint: TypedEndpoint<P, Q, B, R>,
    input: CallInput<P, Q, B>,
    roots: readonly string[],
  ): Promise<TablesAnswer<z.output<R>>> {
    const answer = await this.answerOf(endpoint, input);
    return answeredTables(routeOf(endpoint), endpoint.response, answer, roots);
  }

  private async answerOf<
    P extends z.ZodType,
    Q extends z.ZodType,
    B extends z.ZodType,
    R extends z.ZodType,
  >(
    endpoint: TypedEndpoint<P, Q, B, R>,
    input: CallInput<P, Q, B>,
    signal?: AbortSignal,
    sequence?: (seq: number | null) => void,
  ): Promise<unknown> {
    const route = routeOf(endpoint);
    const params = PATH_PARAMS.parse(checked(route, 'path', endpoint.params, input.params ?? {}));
    const query = wireQueryOf(WIRE_QUERY.parse(input.query ?? {}));
    checked(route, 'query', endpoint.query, query);
    const body: unknown = checked(route, 'body', endpoint.body, input.body);
    const path = `${buildPath(endpoint.path, params)}${encodeQuery(query)}`;
    return this.exchange(path, endpoint.method, body, {
      route: endpoint.path === E.reportClientFailures.path ? null : route,
      authenticated: endpoint.access !== 'public',
      signal,
      sequence,
    });
  }

  private async exchange(
    path: string,
    method: string,
    body: unknown,
    options: {
      readonly route: string | null;
      readonly authenticated: boolean;
      readonly signal: AbortSignal | undefined;
      readonly sequence: ((seq: number | null) => void) | undefined;
    },
  ): Promise<unknown> {
    const trace = new RequestTrace(options.route, method, options.signal);
    try {
      await this.options.ready?.();
      trace.ready();
      assertRequestActive(options.signal);
      const lease = this.options.route?.();
      trace.lease = lease;
      const baseUrl = lease?.baseUrl ?? this.options.baseUrl;
      const response = await this.send(`${baseUrl}${path}`, method, body, {
        lease,
        signal: options.signal,
      });
      trace.status = response.status;
      const answer = await bodyOf(response);
      if (!response.ok) {
        const refusal = apiErrorOf(response.status, answer);
        if (refusal.code === 'unauthorized' && options.authenticated) {
          log.warn('api.unauthorized', { route: options.route, status: trace.status });
          this.options.onUnauthorized();
        }
        throw refusal;
      }
      options.sequence?.(sequenceOf(response));
      trace.finish();
      return answer;
    } catch (error) {
      trace.finish(error);
      throw error;
    }
  }

  private async send(
    url: string,
    method: string,
    body: unknown,
    options: {
      readonly lease: HubRouteLease | undefined;
      readonly signal: AbortSignal | undefined;
    },
  ): Promise<Response> {
    const { lease, signal } = options;
    const token = this.options.token;
    try {
      const response = await (lease?.fetch ?? this.options.fetch)(url, {
        method,
        redirect: 'error',
        ...(signal === undefined ? {} : { signal }),
        headers: {
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return response;
    } catch (error) {
      assertNotAborted(signal, error);
      noteSendFailure(method, lease, signal, error);
      if (lease !== undefined) {
        assertHubLease(lease, method);
        lease.failed();
      }
      throw new ServerUnreachableError(this.options.baseUrl, rawErrorText(error));
    }
  }
}

function assertNotAborted(signal: AbortSignal | undefined, error: unknown): void {
  if (signal?.aborted === true) throw error;
}

function assertRequestActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw signal.reason;
}
