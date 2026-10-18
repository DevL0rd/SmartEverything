import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { SecretStore } from '../secrets/store';
import { Catalogue } from './catalogue';
import { OpenRouterClient } from './client';
import { OpenRouterKeys } from './keys';
import type { AiModelsRepository } from './models-repository';

export interface OpenRouterPlatformOptions {
  readonly models: AiModelsRepository;
  readonly secrets: SecretStore;
  readonly clock: Clock;
  readonly log: Logger;
  readonly fetch: typeof fetch;
}

export interface OpenRouterPlatform {
  readonly client: OpenRouterClient;
  readonly keys: OpenRouterKeys;
  readonly catalogue: Catalogue;
  readonly clock: Clock;
  readonly start: () => void;
  readonly stop: () => void;
}

export function createOpenRouter(options: OpenRouterPlatformOptions): OpenRouterPlatform {
  const shutdown = new AbortController();
  const client = new OpenRouterClient({
    shutdown: shutdown.signal,
    fetch: options.fetch,
    key: (): string | null => options.secrets.read().openrouterKey,
  });
  const keys = new OpenRouterKeys(options.secrets, client);
  const catalogue = new Catalogue({
    models: options.models,
    client,
    clock: options.clock,
    log: options.log,
  });
  return {
    client,
    keys,
    catalogue,
    clock: options.clock,
    start: (): void => {
      catalogue.start();
    },
    stop: (): void => {
      shutdown.abort(new Error('The service is stopping.'));
      catalogue.stop();
    },
  };
}
