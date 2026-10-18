import { z } from 'zod';
import type { FetchLike } from './fetch-like';

const BODY_EXCERPT_LENGTH = 200;

export class JsonApiRefusedError extends Error {
  override readonly name = 'JsonApiRefusedError';
}

export class JsonApiUnreachableError extends Error {
  override readonly name = 'JsonApiUnreachableError';
}

export interface JsonApiTarget {
  readonly service: string;
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly refusal: string;
  readonly timeoutMs: number;
  readonly fetcher?: FetchLike | undefined;
}

export interface JsonApiRequest {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export class JsonApi {
  constructor(private readonly target: JsonApiTarget) {}

  async read<T>(path: string, schema: z.ZodType<T>, request: JsonApiRequest = {}): Promise<T> {
    const parsed = schema.safeParse(jsonOf(this.target.service, await this.#send(path, request)));
    if (!parsed.success) {
      throw new JsonApiUnreachableError(
        `${this.target.service} answered ${path} in an unexpected shape: ${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data;
  }

  async write(path: string, request: JsonApiRequest): Promise<void> {
    await this.#send(path, request);
  }

  async #send(path: string, request: JsonApiRequest): Promise<string> {
    const { service, baseUrl, headers, refusal, timeoutMs, fetcher = fetch } = this.target;
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`);
    Object.entries(request.query ?? {}).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    const timeout = AbortSignal.timeout(request.timeoutMs ?? timeoutMs);
    const response = await fetcher(url.toString(), {
      method: request.method ?? 'GET',
      headers: { ...headers, 'content-type': 'application/json' },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: request.signal === undefined ? timeout : AbortSignal.any([timeout, request.signal]),
    }).catch((error: unknown) => {
      throw new JsonApiUnreachableError(`${service} can’t be reached: ${reasonOf(error)}`);
    });
    if (response.status === 401 || response.status === 403) {
      throw new JsonApiRefusedError(refusal);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new JsonApiUnreachableError(
        `${service} refused the request (${String(response.status)}): ${text.trim().slice(0, BODY_EXCERPT_LENGTH)}`,
      );
    }
    return text;
  }
}

function jsonOf(service: string, text: string): unknown {
  if (text.trim().length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new JsonApiUnreachableError(
      `${service} answered with something that is not JSON: ${reasonOf(error)}`,
    );
  }
}

export function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    return error.cause instanceof Error
      ? `${error.message} (${error.cause.message})`
      : error.message;
  }
  return String(error);
}
