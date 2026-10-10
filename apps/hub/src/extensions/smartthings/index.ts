import type { ProviderModule } from '../../adapters/contract';
import { createSmartThingsModule } from '../../adapters/smartthings';
import type { SmartThingsConfig } from '../../adapters/smartthings/tokens';
import { SmartThingsWebhooks } from '../../adapters/smartthings/webhooks';
import type { ServerExtension } from '../../extensions';
import type { LiveHub } from '../../server/live';
import type { SecretStore } from '../../secrets/store';
import { AppSetup } from './app-setup';
import { TargetConfirmations } from './confirmations';
import { LinkRoutes } from './link-routes';
import { CALLBACK_PATH, WEBHOOK_PATH } from './paths';
import { OAuthStates } from './states';
import { WebhookHandler } from './webhook';
import { WebhookState } from './webhook-state';

class SmartThingsAppMissingError extends Error {
  override readonly name = 'SmartThingsAppMissingError';

  constructor() {
    super('No SmartThings app is set up; set it up in Settings, Providers, SmartThings.');
  }
}

export interface SmartThingsWiringOptions {
  readonly secrets: SecretStore;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

export interface SmartThingsWiring {
  readonly module: ProviderModule<'smartthings'>;
  readonly extension: ServerExtension;
}

function announcedState(live: LiveHub): WebhookState {
  return new WebhookState((webhook) => {
    live.announce({ type: 'smartthings_webhook', webhook }, 'owners');
  });
}

function appOf(secrets: SecretStore): SmartThingsConfig {
  const app = secrets.read().smartthingsApp;
  if (app === null) {
    throw new SmartThingsAppMissingError();
  }
  return app;
}

export function smartThingsWiring(options: SmartThingsWiringOptions): SmartThingsWiring {
  const webhooks = new SmartThingsWebhooks();
  const io = { fetch: options.fetch, now: options.now };
  const module = createSmartThingsModule({
    app: () => appOf(options.secrets),
    webhooks,
    io,
  });
  const extension: ServerExtension = (context) => {
    const log = context.log.child({ actorId: 'smartthings' });
    const state = announcedState(context.live);
    const confirmations = new TargetConfirmations(
      (): string | null => options.secrets.read().smartthingsApp?.appId ?? null,
    );
    const webhook = new WebhookHandler({
      store: context.store,
      webhooks,
      fetch: options.fetch,
      now: options.now,
      log,
      state,
      confirmations,
    });
    const setup = new AppSetup({
      store: context.store,
      secrets: options.secrets,
      confirmations,
      io,
      log,
      lastWebhookError: (): string | null => state.current().lastError,
    });
    const links = new LinkRoutes({
      context,
      states: new OAuthStates(options.now),
      webhook: state,
      setup,
      log,
    });
    return Promise.resolve({
      endpoints: links.endpoints(),
      routes: [
        ...links.routes(CALLBACK_PATH),
        { method: 'POST', path: WEBHOOK_PATH, handle: webhook.handle },
      ],
      stop: () => Promise.resolve(),
    });
  };
  return { module, extension };
}
