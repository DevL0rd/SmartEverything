import { buildPath, encodeQuery, type EndpointShape } from '@smarteverything/domain';
import type { z } from 'zod';

const REQUEST_TIMEOUT_MS = 60_000;

export class HubRequestError extends Error {
  override readonly name = 'HubRequestError';

  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${method} ${path} answered ${String(status)}: ${detail}`);
  }
}

export interface Input<E extends EndpointShape> {
  readonly params?: z.input<E['params']>;
  readonly query?: z.input<E['query']>;
  readonly body?: z.input<E['body']>;
}

export interface HubApi {
  readonly call: <E extends EndpointShape>(
    endpoint: E,
    input?: Input<E>,
  ) => Promise<z.output<E['response']>>;
}

function queryOf(value: unknown): Record<string, string | number | boolean | undefined> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === 'string' ||
        typeof entry[1] === 'number' ||
        typeof entry[1] === 'boolean',
    ),
  );
}

function paramsOf(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

function pathOf<E extends EndpointShape>(endpoint: E, input: Input<E>): string {
  const params = paramsOf(endpoint.params.parse(input.params ?? {}));
  const query = queryOf(endpoint.query.parse(input.query ?? {}));
  return `${buildPath(endpoint.path, params)}${encodeQuery(query)}`;
}

function bodyOf<E extends EndpointShape>(endpoint: E, input: Input<E>): unknown {
  const hasBody = endpoint.method !== 'GET' && endpoint.method !== 'DELETE';
  return hasBody && input.body !== undefined ? endpoint.body.parse(input.body) : undefined;
}

function parsed<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value);
}

async function send<E extends EndpointShape>(
  url: string,
  token: string,
  endpoint: E,
  input: Input<E>,
): Promise<z.output<E['response']>> {
  const path = pathOf(endpoint, input);
  const body = bodyOf(endpoint, input);
  const headers = { authorization: `Bearer ${token}` };
  const response = await fetch(`${url}${path}`, {
    method: endpoint.method,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new HubRequestError(endpoint.method, path, response.status, text);
  return parsed<E['response']>(endpoint.response, text === '' ? undefined : JSON.parse(text));
}

export function hubApi(url: string, token: string): HubApi {
  return { call: (endpoint, input = {}) => send(url, token, endpoint, input) };
}
