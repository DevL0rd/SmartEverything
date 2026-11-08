import type { z } from 'zod';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import { GoogleApiError, GoogleImportError } from './errors';
import type { TokenSession } from './token-session';

export class GoogleHttp {
  constructor(
    private readonly fetch: FetchLike,
    private readonly session: TokenSession,
    private readonly signal: AbortSignal,
  ) {}

  async json<T>(
    schema: z.ZodType<T>,
    url: string,
    init: { readonly method?: string; readonly body?: string } = {},
  ): Promise<T> {
    const response = await this.send(url, init, this.signal);
    return schema.parse(await response.json());
  }

  async bytes(url: string): Promise<AsyncIterable<Uint8Array>> {
    const response = await this.send(url, {}, this.signal);
    return chunksOf(response);
  }

  async remove(url: string): Promise<void> {
    await this.send(url, { method: 'DELETE' }, undefined);
  }

  private async send(
    url: string,
    init: { readonly method?: string; readonly body?: string },
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const first = await this.attempt(url, init, await this.session.accessToken(), signal);
    const response =
      first.status === 401
        ? await this.attempt(url, init, await this.session.renew(), signal)
        : first;
    if (!response.ok) {
      throw new GoogleApiError(response.status, new URL(url).origin);
    }
    return response;
  }

  private async attempt(
    url: string,
    init: { readonly method?: string; readonly body?: string },
    token: string,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    try {
      return await this.fetch(url, {
        method: init.method ?? 'GET',
        ...(signal === undefined ? {} : { signal }),
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
    } catch (cause) {
      throw new GoogleImportError('google_unreachable', cause);
    }
  }
}

async function* chunksOf(response: Response): AsyncGenerator<Uint8Array> {
  if (response.body === null) {
    return;
  }
  const reader = response.body.getReader();
  try {
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      yield part.value;
    }
  } finally {
    reader.releaseLock();
  }
}
