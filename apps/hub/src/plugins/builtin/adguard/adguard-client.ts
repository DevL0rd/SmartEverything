import type { z } from 'zod';
import type { FetchLike } from '../fetch-like';
import { JsonApi } from '../json-api';

const REQUEST_TIMEOUT_MS = 8_000;

interface AdGuardSignIn {
  readonly user: string;
  readonly password: string;
}

export class AdGuardClient {
  readonly #api: JsonApi;

  constructor(baseUrl: string, signIn: AdGuardSignIn, fetcher?: FetchLike) {
    const token = Buffer.from(`${signIn.user}:${signIn.password}`).toString('base64');
    this.#api = new JsonApi({
      service: 'AdGuard Home',
      baseUrl,
      headers: { authorization: `Basic ${token}` },
      refusal: 'AdGuard Home refused the user name or password',
      timeoutMs: REQUEST_TIMEOUT_MS,
      fetcher,
    });
  }

  read<T>(
    path: string,
    schema: z.ZodType<T>,
    query: Readonly<Record<string, string>> = {},
  ): Promise<T> {
    return this.#api.read(path, schema, { query });
  }

  write(path: string, body: unknown): Promise<void> {
    return this.#api.write(path, { method: 'POST', body });
  }
}
