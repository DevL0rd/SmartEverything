import {
  TOKEN_PATH,
  TOKEN_QUERY,
  TOKEN_RESULT,
  TUYA_ENDPOINTS,
  TuyaCloudError,
  needsRefresh,
  readEnvelope,
  refreshPath,
  signedHeaders,
  tokenFrom,
  type CloudRequest,
  type CloudToken,
  type HttpMethod,
} from '@smarteverything/tuya';
import type { z } from 'zod';
import type { TuyaProjectSecrets } from './account';
import type { TuyaDependencies } from './dependencies';

export interface CloudCall {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export class TuyaHttpError extends Error {
  override readonly name = 'TuyaHttpError';

  constructor(
    readonly operation: string,
    readonly status: number,
    override readonly cause: unknown,
  ) {
    super(
      `Tuya cloud answered ${operation} with HTTP ${String(status)} and a body that is not JSON.`,
    );
  }
}

export async function readJson(operation: string, response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new TuyaHttpError(operation, response.status, cause);
  }
}

export class TuyaCloud {
  private token: CloudToken | null = null;
  private pendingToken: Promise<CloudToken> | null = null;

  constructor(
    private readonly secrets: TuyaProjectSecrets,
    private readonly dependencies: Pick<TuyaDependencies, 'fetch' | 'now' | 'nonce'>,
  ) {}

  async call<S extends z.ZodType>(
    operation: string,
    call: CloudCall,
    result: S,
  ): Promise<z.output<S>> {
    try {
      return await this.send(operation, call, (await this.validToken()).accessToken, result);
    } catch (error) {
      if (error instanceof TuyaCloudError && error.kind === 'token') {
        this.token = null;
        return this.send(operation, call, (await this.validToken()).accessToken, result);
      }
      throw error;
    }
  }

  private async validToken(): Promise<CloudToken> {
    if (this.token !== null && !needsRefresh(this.token, this.dependencies.now())) {
      return this.token;
    }
    this.pendingToken ??= this.obtainToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async obtainToken(): Promise<CloudToken> {
    const current = this.token;
    this.token = null;
    const result =
      current === null
        ? await this.send(
            'getting an access token',
            { method: 'GET', path: TOKEN_PATH, query: TOKEN_QUERY },
            null,
            TOKEN_RESULT,
          )
        : await this.send(
            'refreshing the access token',
            { method: 'GET', path: refreshPath(current) },
            null,
            TOKEN_RESULT,
          );
    this.token = tokenFrom(result, this.dependencies.now());
    return this.token;
  }

  private async send<S extends z.ZodType>(
    operation: string,
    call: CloudCall,
    accessToken: string | null,
    result: S,
  ): Promise<z.output<S>> {
    const request: CloudRequest = {
      method: call.method,
      path: call.path,
      query: call.query ?? {},
      body: call.body ?? '',
      signatureHeaders: {},
    };
    const headers = signedHeaders({
      clientId: this.secrets.accessId,
      secret: this.secrets.accessSecret,
      accessToken,
      t: this.dependencies.now(),
      nonce: this.dependencies.nonce(),
      request,
    });
    const url = new URL(call.path, TUYA_ENDPOINTS[this.secrets.region].api);
    for (const [name, value] of Object.entries(request.query)) {
      url.searchParams.set(name, value);
    }
    const response = await this.dependencies.fetch(url.toString(), {
      method: call.method,
      headers:
        call.body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      ...(call.body === undefined ? {} : { body: call.body }),
    });
    return readEnvelope(operation, result, await readJson(operation, response));
  }
}
