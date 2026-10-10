import {
  API_ENDPOINTS as E,
  seal,
  type CommandRow,
  type Provider,
  type ProviderCredentials,
} from '@smarteverything/domain';
import { sendHubCommand } from './hub-commands';
import { api } from './transport';

async function sealingKey(): Promise<string> {
  return (await api().call(E.sealingKey, {})).publicKey;
}

export async function linkProvider(credentials: ProviderCredentials): Promise<CommandRow> {
  return sendHubCommand({
    capability: 'hub:link_provider',
    value: {
      provider: credentials.provider,
      credentials: seal(await sealingKey(), JSON.stringify(credentials)),
    },
  });
}

export async function answerPrompt(provider: Provider, answer: string): Promise<CommandRow> {
  return sendHubCommand({
    capability: 'hub:answer_prompt',
    value: { provider, answer: seal(await sealingKey(), answer) },
  });
}

export function unlinkProvider(provider: Provider): Promise<CommandRow> {
  return sendHubCommand({ capability: 'hub:unlink_provider', value: { provider } });
}

export function discoverDevices(provider: Provider | null): Promise<CommandRow> {
  return sendHubCommand({ capability: 'hub:discover', value: { provider } });
}
