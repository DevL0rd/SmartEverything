import {
  API_ENDPOINTS as E,
  type CommandRow,
  type Provider,
  type ProviderCredentials,
} from '@smarteverything/domain';
import { sendHubCommand } from './hub-commands';
import { api } from './transport';

export async function linkProvider(credentials: ProviderCredentials): Promise<void> {
  await api().call(E.linkProvider, { body: credentials });
}

export async function answerPrompt(provider: Provider, answer: string): Promise<void> {
  await api().call(E.answerProviderPrompt, { body: { provider, answer } });
}

export async function cancelProviderLink(provider: Provider): Promise<void> {
  await api().call(E.cancelProviderLink, { body: { provider } });
}

export function unlinkProvider(provider: Provider): Promise<CommandRow> {
  return sendHubCommand({ capability: 'hub:unlink_provider', value: { provider } });
}

export function discoverDevices(provider: Provider | null): Promise<CommandRow> {
  return sendHubCommand({ capability: 'hub:discover', value: { provider } });
}
