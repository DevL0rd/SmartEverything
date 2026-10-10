import { z } from 'zod';
import type { FetchLike } from '../fetch-like';

const REQUEST_TIMEOUT_MS = 15_000;

export class SyncthingKeyRejectedError extends Error {
  override readonly name = 'SyncthingKeyRejectedError';

  constructor() {
    super('Syncthing rejected the API key');
  }
}

class SyncthingUnreachableError extends Error {
  override readonly name = 'SyncthingUnreachableError';
}

interface SyncthingRequest {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export class SyncthingRest {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async read<T>(path: string, schema: z.ZodType<T>, request: SyncthingRequest = {}): Promise<T> {
    const raw = await this.#send(path, request);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new SyncthingUnreachableError(
        `Syncthing answered ${path} in an unexpected shape: ${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data;
  }

  async write(path: string, request: SyncthingRequest): Promise<void> {
    await this.#send(path, request);
  }

  async #send(path: string, request: SyncthingRequest): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(request.query ?? {}).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    const timeout = AbortSignal.timeout(request.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const response = await this.fetcher(url.toString(), {
      method: request.method ?? 'GET',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: request.signal === undefined ? timeout : AbortSignal.any([timeout, request.signal]),
    }).catch((error: unknown) => {
      throw new SyncthingUnreachableError(`Syncthing can’t be reached: ${reasonOf(error)}`);
    });
    return this.#body(response);
  }

  async #body(response: Response): Promise<unknown> {
    if (response.status === 401 || response.status === 403) {
      throw new SyncthingKeyRejectedError();
    }
    const text = await response.text();
    if (!response.ok) {
      throw new SyncthingUnreachableError(
        `Syncthing refused the request (${String(response.status)}): ${text.trim().slice(0, 200)}`,
      );
    }
    if (text.trim().length === 0) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch (error) {
      throw new SyncthingUnreachableError(
        `Syncthing answered with something that is not JSON: ${reasonOf(error)}`,
      );
    }
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
