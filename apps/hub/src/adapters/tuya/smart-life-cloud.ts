import {
  SMART_LIFE_NONCE_LENGTH,
  SMART_LIFE_PATHS,
  SMART_LIFE_TOKEN,
  TOKEN_REFRESH_MARGIN_MS,
  TuyaCloudError,
  TuyaResponseError,
  readSealedReply,
  sealRequest,
  type SealedReply,
  type SmartLifeCall,
  type SmartLifeSession,
} from '@smarteverything/tuya';
import type { z } from 'zod';
import type { TuyaDependencies } from './dependencies';

type SmartLifeDependencies = Pick<TuyaDependencies, 'fetch' | 'now' | 'nonce' | 'requestId'>;

export interface SmartLifeCloudOptions {
  readonly session: SmartLifeSession;
  readonly dependencies: SmartLifeDependencies;
  readonly renewed: (session: SmartLifeSession) => Promise<void>;
  readonly lost?: (cause: TuyaCloudError) => Promise<void>;
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

const SESSION_PROBLEMS: ReadonlySet<string> = new Set(['credentials', 'token']);

export class SmartLifeCloud {
  private current: SmartLifeSession;
  private renewing: Promise<SmartLifeSession> | null = null;

  constructor(private readonly options: SmartLifeCloudOptions) {
    this.current = options.session;
  }

  async call<S extends z.ZodType>(
    operation: string,
    call: SmartLifeCall,
    result: S,
  ): Promise<z.output<S>> {
    const session = await this.fresh();
    return (await this.send(operation, call, result, session)).value;
  }

  async fresh(): Promise<SmartLifeSession> {
    const { now } = this.options.dependencies;
    if (now() < this.current.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.current;
    }
    this.renewing ??= this.renew()
      .catch(async (cause: unknown) => {
        if (cause instanceof TuyaCloudError && SESSION_PROBLEMS.has(cause.kind)) {
          await this.options.lost?.(cause);
        }
        throw cause;
      })
      .finally(() => {
        this.renewing = null;
      });
    return this.renewing;
  }

  private async renew(): Promise<SmartLifeSession> {
    const session = this.current;
    const operation = 'renewing the Smart Life session';
    const reply = await this.send(
      operation,
      { method: 'GET', path: SMART_LIFE_PATHS.refreshToken(session.refreshToken) },
      SMART_LIFE_TOKEN,
      session,
    );
    if (reply.t === null) {
      throw new TuyaResponseError(operation, 't: the reply carries no issue time');
    }
    this.current = {
      ...session,
      uid: reply.value.uid,
      accessToken: reply.value.accessToken,
      refreshToken: reply.value.refreshToken,
      expiresAt: reply.t + reply.value.expireTime * 1000,
    };
    await this.options.renewed(this.current);
    return this.current;
  }

  private async send<S extends z.ZodType>(
    operation: string,
    call: SmartLifeCall,
    result: S,
    session: SmartLifeSession,
  ): Promise<SealedReply<z.output<S>>> {
    const { fetch, now, nonce, requestId } = this.options.dependencies;
    const request = sealRequest(session, call, {
      requestId: requestId(),
      t: now(),
      nonce: () => nonce().slice(0, SMART_LIFE_NONCE_LENGTH),
    });
    const response = await fetch(request.url, request.init);
    return readSealedReply(operation, result, await readJson(operation, response), request.secret);
  }
}
