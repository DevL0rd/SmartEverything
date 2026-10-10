import type { ProviderProblem } from '@smarteverything/domain';
import {
  basicAuthorization,
  describeOAuthError,
  parseTokenResponse,
  refreshBody,
  refreshDelayMs,
  TOKEN_URL,
  type AccountSecrets,
} from '@smarteverything/smartthings';
import type { RunContext } from '../contract';
import {
  bodyOf,
  JSON_ACCEPT,
  SmartThingsHttpError,
  type AccessTokens,
  type SmartThingsIo,
} from './http';

const REFRESH_RETRY_MS = 5 * 60 * 1000;

const REFUSING_STATUSES: ReadonlySet<number> = new Set([400, 401]);

export interface SmartThingsConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export class TokenRefusedError extends Error {
  override readonly name = 'TokenRefusedError';
  readonly problem: ProviderProblem = 'session_expired';

  constructor(readonly reason: string) {
    super(`SmartThings refused the token refresh: ${reason}. Link SmartThings again.`);
  }
}

export interface TokenAnswer {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

export type SmartThingsAppSource = () => SmartThingsConfig;

export async function requestTokens(
  config: SmartThingsConfig,
  io: SmartThingsIo,
  body: string,
): Promise<TokenAnswer> {
  const response = await io.fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(config.clientId, config.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: JSON_ACCEPT,
    },
    body,
  });
  return { ok: response.ok, status: response.status, body: await bodyOf(response) };
}

interface KeeperOptions {
  readonly app: SmartThingsAppSource;
  readonly io: SmartThingsIo;
  readonly context: RunContext;
  readonly label: string;
}

export class TokenKeeper implements AccessTokens {
  private refreshing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private refused: TokenRefusedError | null = null;

  constructor(
    private account: AccountSecrets,
    private readonly options: KeeperOptions,
  ) {}

  get installedAppId(): string | null {
    return this.account.installedAppId;
  }

  readonly accessToken = async (): Promise<string> => {
    if (this.refused !== null) {
      throw this.refused;
    }
    if (this.options.io.now().getTime() >= Date.parse(this.account.expiresAt)) {
      await this.refresh();
    }
    return this.account.accessToken;
  };

  readonly refresh = (): Promise<void> => {
    this.refreshing ??= this.performRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  };

  schedule(): void {
    this.stop();
    const delay = refreshDelayMs(this.account, this.options.io.now());
    this.timer = setTimeout(() => {
      void this.scheduledRefresh();
    }, delay).unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async scheduledRefresh(): Promise<void> {
    try {
      await this.refresh();
    } catch (cause) {
      if (cause instanceof TokenRefusedError) {
        return;
      }
      this.options.context.log.warn('token.refresh_failed', {
        retryInMs: REFRESH_RETRY_MS,
        reason: String(cause),
      });
      this.timer = setTimeout(() => {
        void this.scheduledRefresh();
      }, REFRESH_RETRY_MS).unref();
    }
  }

  private async performRefresh(): Promise<void> {
    const { io, context } = this.options;
    const config = this.options.app();
    const answer = await requestTokens(
      config,
      io,
      refreshBody(this.account.refreshToken, config.clientId),
    );
    if (!answer.ok) {
      const reason = describeOAuthError(answer.status, answer.body);
      if (!REFUSING_STATUSES.has(answer.status)) {
        throw new SmartThingsHttpError('POST', '/oauth/token', answer.status, reason);
      }
      this.refused = new TokenRefusedError(reason);
      this.stop();
      await context.needsAttention(this.refused);
      throw this.refused;
    }
    const tokens = parseTokenResponse(answer.body, io.now());
    this.account = tokens;
    await this.save();
    context.log.info('token.refreshed', { expiresAt: tokens.expiresAt });
    this.schedule();
  }

  private async save(): Promise<void> {
    await this.options.context.saveAccount({
      label: this.options.label,
      secrets: { ...this.account },
    });
  }
}
