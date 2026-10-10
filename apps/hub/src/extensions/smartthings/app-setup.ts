import { ApiError, type SmartThingsSetup } from '@smarteverything/domain';
import { REDACTED, type Logger } from '@smarteverything/logging';
import {
  appNameFor,
  isTargetConfirmed,
  SmartThingsResponseError,
  type AppCredentials,
  type AppTargets,
  type SmartThingsApp,
} from '@smarteverything/smartthings';
import {
  SmartThingsHttpError,
  SmartThingsRateLimitError,
  type SmartThingsIo,
} from '../../adapters/smartthings/http';
import type { SecretStore } from '../../secrets/store';
import type { Store } from '../../store/store';
import { AppsClient } from './apps-client';
import type { TargetConfirmations } from './confirmations';
import { verifiedPaths } from './paths';

const CONFIRMATION_WAIT_MS = 15_000;

export type SetupResult =
  | { readonly outcome: 'ready' }
  | Exclude<SmartThingsSetup, { outcome: 'ready' | 'not_confirmed' }>
  | { readonly outcome: 'not_confirmed'; readonly reason: string };

export interface AppSetupOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly confirmations: TargetConfirmations;
  readonly io: SmartThingsIo;
  readonly log: Logger;
  readonly lastWebhookError: () => string | null;
}

function refusalOf(cause: SmartThingsHttpError, description: string): SetupResult | null {
  if (cause.status === 401) {
    return {
      outcome: 'token_refused',
      reason: `SmartThings did not accept the token (${description}). Create a new one; tokens last 24 hours.`,
    };
  }
  if (cause.status === 403) {
    const reading = cause.method === 'GET';
    return {
      outcome: 'scopes_missing',
      missing: [reading ? 'r:apps:*' : 'w:apps:*'],
      reason: `The token may not ${reading ? 'read' : 'change'} apps (${description}).`,
    };
  }
  if (cause instanceof SmartThingsRateLimitError) {
    return {
      outcome: 'rate_limited',
      retryAfterSeconds: cause.resetSeconds,
      reason: `SmartThings is limiting app requests (${description}).`,
    };
  }
  return null;
}

function failureOf(cause: unknown, token: string): SetupResult {
  const scrub = (text: string): string => text.replaceAll(token, REDACTED);
  if (cause instanceof SmartThingsResponseError) {
    throw new ApiError(
      'upstream_failed',
      scrub(`SmartThings answered with an unexpected ${cause.subject}: ${cause.reason}.`),
    );
  }
  if (!(cause instanceof SmartThingsHttpError)) {
    throw cause;
  }
  const description = scrub(cause.description);
  const refusal = refusalOf(cause, description);
  if (refusal === null) {
    throw new ApiError(
      'upstream_failed',
      `SmartThings answered ${cause.method} ${cause.path} with HTTP ${String(cause.status)}: ${description}.`,
    );
  }
  return refusal;
}

export class AppSetup {
  private running = false;

  constructor(private readonly options: AppSetupOptions) {}

  async run(token: string): Promise<SetupResult> {
    if (this.running) {
      throw new ApiError('conflict', 'SmartThings setup is already running.');
    }
    const { redirectUri, webhookUrl } = verifiedPaths(this.options.store);
    this.running = true;
    const close = this.options.confirmations.open();
    try {
      return await this.provision(new AppsClient(this.options.io, token), {
        redirectUri,
        webhookUrl,
      });
    } catch (cause) {
      return failureOf(cause, token);
    } finally {
      close();
      this.running = false;
    }
  }

  private async provision(client: AppsClient, targets: AppTargets): Promise<SetupResult> {
    const app = await this.ensureApp(client, targets);
    if (isTargetConfirmed(app, targets.webhookUrl)) {
      return { outcome: 'ready' };
    }
    return this.confirm(client, app.appId, targets.webhookUrl);
  }

  private async ensureApp(client: AppsClient, targets: AppTargets): Promise<SmartThingsApp> {
    const { secrets, log } = this.options;
    const stored = secrets.read().smartthingsApp;
    const existing = await client.find(stored?.appId ?? null, appNameFor(targets.webhookUrl));
    if (existing === null) {
      const created = await client.create(targets);
      await this.save(created.credentials);
      log.info('app.created', { appId: created.app.appId, appName: created.app.appName });
      return created.app;
    }
    const app = await client.update(existing, targets);
    if (stored?.appId !== existing.appId) {
      await this.save(await client.regenerate(existing.appId));
      log.info('app.credentials_regenerated', { appId: existing.appId });
    }
    log.info('app.updated', { appId: existing.appId, appName: existing.appName });
    return app;
  }

  private async save(credentials: AppCredentials): Promise<void> {
    await this.options.secrets.update((secrets) => ({ ...secrets, smartthingsApp: credentials }));
  }

  private async confirm(
    client: AppsClient,
    appId: string,
    webhookUrl: string,
  ): Promise<SetupResult> {
    const { confirmations, log } = this.options;
    if (await confirmations.wait(appId, CONFIRMATION_WAIT_MS)) {
      return { outcome: 'ready' };
    }
    log.info('app.registration_requested', { appId });
    await client.register(appId);
    if (await confirmations.wait(appId, CONFIRMATION_WAIT_MS)) {
      return { outcome: 'ready' };
    }
    const lastError = this.options.lastWebhookError();
    return {
      outcome: 'not_confirmed',
      reason:
        lastError === null
          ? `SmartThings did not send its confirmation to ${webhookUrl}; check that the public URL reaches this server.`
          : `The SmartThings confirmation at ${webhookUrl} failed: ${lastError}`,
    };
  }
}
