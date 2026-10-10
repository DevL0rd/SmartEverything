import type { ProviderAdapter } from '@smarteverything/domain';
import { accountFromSecrets } from '@smarteverything/smartthings';
import type { ProviderModule } from '../contract';
import { createSmartThingsAdapter } from './adapter';
import { DefinitionCache } from './definitions';
import { SmartThingsApi, type SmartThingsIo } from './http';
import { Inventory } from './inventory';
import { linkSmartThings } from './link';
import { TokenKeeper, type SmartThingsAppSource } from './tokens';
import type { SmartThingsWebhooks } from './webhooks';

export interface SmartThingsModuleOptions {
  readonly app: SmartThingsAppSource;
  readonly webhooks: SmartThingsWebhooks;
  readonly io: SmartThingsIo;
}

export function createSmartThingsModule(
  options: SmartThingsModuleOptions,
): ProviderModule<'smartthings'> {
  const { app, webhooks, io } = options;
  return {
    provider: 'smartthings',
    link: (credentials, context) => linkSmartThings(credentials, app, io, context),
    start: (account, context): Promise<ProviderAdapter> => {
      const tokens = new TokenKeeper(accountFromSecrets(account.secrets), {
        app,
        io,
        context,
        label: account.label,
      });
      tokens.schedule();
      const api = new SmartThingsApi(io, tokens);
      const definitions = new DefinitionCache(api, context.dataDirectory, context.log);
      const inventory = new Inventory(api, definitions, context.log);
      return Promise.resolve(
        createSmartThingsAdapter({ api, io, tokens, inventory, context, webhooks }),
      );
    },
  };
}
