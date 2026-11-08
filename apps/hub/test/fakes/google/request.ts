import { z } from 'zod';
import type { JsonObject } from './json';
import { apiFailure } from './reply';

export interface RequestContext {
  readonly method: string;
  readonly url: URL;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: string | undefined;
  readonly groups: readonly string[];
}

export function bodyText(body: RequestInit['body']): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new TypeError('The fake Google server accepts only string and URLSearchParams bodies.');
}

const ObjectSchema = z.record(z.string(), z.unknown());

export function jsonBody(context: RequestContext): JsonObject {
  if (context.body === undefined || context.body.length === 0) return {};
  let value: unknown;
  try {
    value = JSON.parse(context.body);
  } catch (error) {
    throw apiFailure(400, `Invalid JSON payload received: ${String(error)}`, 'parseError');
  }
  const parsed = ObjectSchema.safeParse(value);
  if (!parsed.success) {
    throw apiFailure(400, 'Invalid JSON payload received.', 'parseError');
  }
  return parsed.data;
}

export function formBody(context: RequestContext): URLSearchParams {
  return new URLSearchParams(context.body ?? '');
}

export function boolParam(query: URLSearchParams, name: string, fallback: boolean): boolean {
  const value = query.get(name);
  if (value === null) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw apiFailure(400, `Invalid value for: ${name}`, 'invalid');
}

export function intParam(
  query: URLSearchParams,
  name: string,
  fallback: number,
  vendorMax: number,
): number {
  const value = query.get(name);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw apiFailure(400, `Invalid value for: ${name}`, 'invalid');
  }
  return Math.min(Number(value), vendorMax);
}

export function unsupportedParams(query: URLSearchParams, names: readonly string[]): void {
  for (const name of names) {
    if (query.has(name)) {
      throw apiFailure(400, `The fake Google server does not model ${name}.`, 'fakeUnsupported');
    }
  }
}
