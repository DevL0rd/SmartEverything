import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  API_ENDPOINTS as E,
  ApiError,
  seal,
  SMARTTHINGS_CREDENTIALS,
  type CommandRow,
  type SmartThingsAppStatus,
  type SmartThingsSetup,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { authorizeUrl } from '@smarteverything/smartthings';
import { z } from 'zod';
import type { ExtensionContext } from '../../extensions';
import { clientOf } from '../../server/auth';
import type { RawRoute } from '../../server/http-server';
import { bound, type ExtensionRouteTable } from '../../server/router';
import type { AppSetup } from './app-setup';
import { LINKED_PATH, publicUrlState, savedPaths, verifiedPaths } from './paths';
import { PAGE_OUTCOMES, sendPage, type PageOutcome } from './page';
import type { OAuthStates } from './states';
import type { WebhookState } from './webhook-state';

const LINK_WAIT_MS = 60_000;

const FINISHED: ReadonlySet<CommandRow['status']> = new Set(['succeeded', 'failed', 'expired']);

const STATE = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const CALLBACK = z.union([
  z.object({ state: STATE, code: z.string().min(1).max(2048) }),
  z.object({ state: STATE, error: z.string().min(1).max(200) }),
]);

const LINKED_QUERY = z.object({ outcome: z.enum(PAGE_OUTCOMES) });

export interface LinkRoutesOptions {
  readonly context: ExtensionContext;
  readonly states: OAuthStates;
  readonly webhook: WebhookState;
  readonly setup: AppSetup;
  readonly log: Logger;
}

function queryOf(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries(new URL(request.url ?? '/', 'http://server').searchParams);
}

function redirect(response: ServerResponse, outcome: PageOutcome): void {
  response.writeHead(303, {
    location: `${LINKED_PATH}?outcome=${outcome}`,
    'cache-control': 'no-store',
  });
  response.end();
}

function finished(context: ExtensionContext, commandId: string): Promise<CommandRow | null> {
  return new Promise((resolve) => {
    const settle = (row: CommandRow | null): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve(row);
    };
    const timer = setTimeout(() => {
      settle(null);
    }, LINK_WAIT_MS).unref();
    const unsubscribe = context.store.feed.subscribe((change) => {
      if (
        change.table === 'commands' &&
        change.record?.id === commandId &&
        FINISHED.has(change.record.status)
      ) {
        settle(change.record);
      }
    });
  });
}

export class LinkRoutes {
  constructor(private readonly options: LinkRoutesOptions) {}

  endpoints(): ExtensionRouteTable {
    return {
      readSmartThingsApp: bound(E.readSmartThingsApp, () => this.status()),
      setUpSmartThings: bound(E.setUpSmartThings, ({ body, caller }) =>
        this.setUp(body.token, clientOf(caller).id),
      ),
      authorizeSmartThings: bound(E.authorizeSmartThings, ({ caller }) =>
        this.authorize(clientOf(caller).id),
      ),
    };
  }

  routes(callbackPath: string): readonly RawRoute[] {
    return [
      {
        method: 'GET',
        path: callbackPath,
        handle: (request, response) => this.callback(request, response),
      },
      {
        method: 'GET',
        path: LINKED_PATH,
        handle: (request, response) => this.linked(request, response),
      },
    ];
  }

  private status(): SmartThingsAppStatus {
    const { context, webhook } = this.options;
    const paths = savedPaths(context.store);
    const app = context.secrets.read().smartthingsApp;
    return {
      app: app === null ? null : { appId: app.appId, clientId: app.clientId },
      publicUrl: publicUrlState(context.store),
      redirectUri: paths?.redirectUri ?? null,
      webhookUrl: paths?.webhookUrl ?? null,
      webhook: webhook.current(),
    };
  }

  private async setUp(token: string, requestedBy: string): Promise<SmartThingsSetup> {
    const result = await this.options.setup.run(token);
    if (result.outcome === 'ready') {
      return {
        outcome: 'ready',
        authorization: this.authorize(requestedBy),
        status: this.status(),
      };
    }
    this.options.log.warn('setup.refused', { outcome: result.outcome });
    return result.outcome === 'not_confirmed' ? { ...result, status: this.status() } : result;
  }

  private authorize(clientId: string): { readonly url: string; readonly expiresAt: string } {
    const { context, states, log } = this.options;
    const app = context.secrets.read().smartthingsApp;
    if (app === null) {
      throw new ApiError('conflict', 'Save the SmartThings app client id and secret first.');
    }
    const { redirectUri } = verifiedPaths(context.store);
    const { state, expiresAt } = states.create(redirectUri, clientId);
    log.info('authorization.started', { clientId });
    return {
      url: authorizeUrl(app.clientId, redirectUri, state),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async callback(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { states, log } = this.options;
    const parsed = CALLBACK.safeParse(queryOf(request));
    if (!parsed.success) {
      log.warn('authorization.callback_malformed', { issues: parsed.error.issues.length });
      redirect(response, 'malformed');
      return;
    }
    const pending = states.consume(parsed.data.state);
    if (pending === null) {
      log.warn('authorization.state_refused');
      redirect(response, 'expired');
      return;
    }
    if ('error' in parsed.data) {
      log.info('authorization.cancelled', { reason: parsed.data.error });
      redirect(response, 'cancelled');
      return;
    }
    redirect(response, await this.link(parsed.data.code, pending));
  }

  private async link(
    code: string,
    pending: { readonly redirectUri: string; readonly requestedBy: string },
  ): Promise<PageOutcome> {
    const { context, log } = this.options;
    const credentials = SMARTTHINGS_CREDENTIALS.parse({
      provider: 'smartthings',
      code,
      redirectUri: pending.redirectUri,
    });
    const sealed = seal(context.secrets.sealingKeys().publicKey, JSON.stringify(credentials));
    const [command] = context.hub.submit([
      {
        deviceId: null,
        capability: 'hub:link_provider',
        value: { provider: 'smartthings', credentials: sealed },
        source: 'app',
        requestedBy: pending.requestedBy,
      },
    ]);
    if (command === undefined) {
      throw new ApiError('internal', 'The link command was not queued.');
    }
    const outcome = await finished(context, command.id);
    log.info('authorization.finished', {
      commandId: command.id,
      status: outcome?.status ?? 'running',
    });
    if (outcome === null) {
      return 'linking';
    }
    return outcome.status === 'succeeded' ? 'linked' : 'failed';
  }

  private linked(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const parsed = LINKED_QUERY.safeParse(queryOf(request));
    sendPage(response, parsed.success ? parsed.data.outcome : 'malformed');
    return Promise.resolve();
  }
}
