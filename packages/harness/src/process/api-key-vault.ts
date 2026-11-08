import { HARNESS_API_KEY } from '@smarteverything/domain';
import type { ApiKeyVault } from '../plugins/providers';
import type { HarnessHub } from './http';

export class HubApiKeyVault implements ApiKeyVault {
  readonly source = 'hub';

  constructor(private readonly hub: Pick<HarnessHub, 'call'>) {}

  read = async (reference: string): Promise<string | undefined> => {
    const { value } = await this.hub.call({ operation: 'api_key', reference }, HARNESS_API_KEY);
    return value ?? undefined;
  };

  write = (): Promise<void> => Promise.reject(new TypeError(CHANGE_ON_HUB));

  remove = (): Promise<void> => Promise.reject(new TypeError(CHANGE_ON_HUB));

  watch = (): (() => void) => () => undefined;
}

const CHANGE_ON_HUB = 'Keys are changed in Settings on the hub, not on a computer.';
