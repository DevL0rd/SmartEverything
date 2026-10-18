import { z } from 'zod';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const ACCESS_LEVELS = ['public', 'member', 'owner'] as const;

export type Access = (typeof ACCESS_LEVELS)[number];

export const NO_BODY = z.undefined();

export interface EndpointShape {
  readonly method: HttpMethod;
  readonly path: string;
  readonly access: Access;
  readonly summary: string;
  readonly params: z.ZodType;
  readonly query: z.ZodType;
  readonly body: z.ZodType;
  readonly response: z.ZodType;
}

export function endpoint<const E extends EndpointShape>(definition: E): E {
  return definition;
}

export class PathParameterError extends Error {
  override readonly name = 'PathParameterError';

  constructor(
    readonly pattern: string,
    readonly parameter: string,
  ) {
    super(`The path ${pattern} needs a value for :${parameter}, but none was given.`);
  }
}

function segmentsOf(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment !== '');
}

export function matchPath(
  pattern: string,
  pathname: string,
): Readonly<Record<string, string>> | null {
  const expected = segmentsOf(pattern);
  const rest = expected.at(-1);
  const trailing = rest?.startsWith('*') === true;
  const received = trailing ? pathname.replace(/^\//u, '').split('/') : segmentsOf(pathname);
  if (trailing ? received.length < expected.length - 1 : expected.length !== received.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    if (segment.startsWith('*')) {
      params[segment.slice(1)] = received.slice(index).join('/');
      return params;
    }
    const actual = String(received[index]);
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = decodeURIComponent(actual);
    } else if (segment !== actual) {
      return null;
    }
  }
  return params;
}

export function buildPath(pattern: string, params: Readonly<Record<string, string>>): string {
  const segments = segmentsOf(pattern).map((segment) => {
    if (!segment.startsWith(':')) {
      return segment;
    }
    const value = params[segment.slice(1)];
    if (value === undefined) {
      throw new PathParameterError(pattern, segment.slice(1));
    }
    return encodeURIComponent(value);
  });
  return `/${segments.join('/')}`;
}

export type QueryValue = string | number | boolean | readonly string[] | undefined;

export function encodeQuery(values: Readonly<Record<string, QueryValue>>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}
