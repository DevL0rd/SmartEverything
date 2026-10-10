import { z } from 'zod';
import { apiErrorOf, buildPath, encodeQuery, type EndpointShape } from '@smarteverything/domain';
import { jsonText } from '../../format/json-text';
import { WIRE_QUERY, wireQueryOf, type CallInput, type TypedEndpoint } from './request';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../format/errors';
import { readLeniently, readTablesLeniently } from './readable';

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
    throw new UnreadableAnswerError(route, issuesOf(read.error));
  }
  noteIgnored(route, read.ignored);
  if (read.skipped.length > 0) {
    log.warn('api.tables_skipped', { route, tables: read.skipped.join(', ') });
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
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  urlOf(path: string): string {
    return `${this.options.baseUrl}${path}`;
  }

  async call<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, R extends z.ZodType>(
    endpoint: TypedEndpoint<P, Q, B, R>,
    input: CallInput<P, Q, B>,
  ): Promise<z.output<R>> {
    const answer = await this.answerOf(endpoint, input);
    return answered(routeOf(endpoint), endpoint.response, answer);
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
  >(endpoint: TypedEndpoint<P, Q, B, R>, input: CallInput<P, Q, B>): Promise<unknown> {
    const route = routeOf(endpoint);
    const params = PATH_PARAMS.parse(checked(route, 'path', endpoint.params, input.params ?? {}));
    const query = wireQueryOf(WIRE_QUERY.parse(input.query ?? {}));
    checked(route, 'query', endpoint.query, query);
    const body: unknown = checked(route, 'body', endpoint.body, input.body);
    const path = `${buildPath(endpoint.path, params)}${encodeQuery(query)}`;
    return this.exchange(path, endpoint.method, body, endpoint.access !== 'public');
  }

  private async exchange(
    path: string,
    method: string,
    body: unknown,
    authenticated: boolean,
  ): Promise<unknown> {
    const response = await this.send(this.urlOf(path), method, body);
    const answer = await bodyOf(response);
    if (!response.ok) {
      const refusal = apiErrorOf(response.status, answer);
      if (refusal.code === 'unauthorized' && authenticated) {
        this.options.onUnauthorized();
      }
      throw refusal;
    }
    return answer;
  }

  private async send(url: string, method: string, body: unknown): Promise<Response> {
    const token = this.options.token;
    try {
      return await this.options.fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new ServerUnreachableError(this.options.baseUrl, rawErrorText(error));
    }
  }
}
