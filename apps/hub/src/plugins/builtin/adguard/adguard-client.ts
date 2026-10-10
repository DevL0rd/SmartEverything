import { z } from 'zod';
import type { FetchLike } from '../fetch-like';

const REQUEST_TIMEOUT_MS = 8_000;

interface AdGuardSignIn {
  readonly user: string;
  readonly password: string;
}

export class AdGuardRefusedError extends Error {
  override readonly name = 'AdGuardRefusedError';

  constructor() {
    super('AdGuard Home refused the user name or password');
  }
}

class AdGuardUnreachableError extends Error {
  override readonly name = 'AdGuardUnreachableError';
}

export class AdGuardClient {
  constructor(
    private readonly baseUrl: string,
    private readonly signIn: AdGuardSignIn,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async read<T>(
    path: string,
    schema: z.ZodType<T>,
    query: Readonly<Record<string, string>> = {},
  ): Promise<T> {
    const raw = jsonOf(path, await this.#send('GET', path, query, undefined));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new AdGuardUnreachableError(
        `AdGuard Home answered ${path} in an unexpected shape: ${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data;
  }

  async write(path: string, body: unknown): Promise<void> {
    await this.#send('POST', path, {}, body);
  }

  async #send(
    method: 'GET' | 'POST',
    path: string,
    query: Readonly<Record<string, string>>,
    body: unknown,
  ): Promise<string> {
    const url = new URL(path, this.baseUrl);
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    const token = Buffer.from(`${this.signIn.user}:${this.signIn.password}`).toString('base64');
    const response = await this.fetcher(url.toString(), {
      method,
      headers: { authorization: `Basic ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new AdGuardUnreachableError(`AdGuard Home can’t be reached: ${reasonOf(error)}`);
    });
    return textOf(response);
  }
}

async function textOf(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    throw new AdGuardRefusedError();
  }
  const text = await response.text();
  if (!response.ok) {
    throw new AdGuardUnreachableError(
      `AdGuard Home refused the request (${String(response.status)}): ${text.trim().slice(0, 200)}`,
    );
  }
  return text;
}

function jsonOf(path: string, text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new AdGuardUnreachableError(
      `AdGuard Home answered ${path} with something that is not JSON (${reasonOf(error)}): ${text.trim().slice(0, 80)}`,
    );
  }
}

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
