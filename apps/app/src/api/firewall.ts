import {
  API_ENDPOINTS as E,
  type FirewallApplyResult,
  type FirewallStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { EntityStore } from '../store/entity-store';
import { api } from './transport';

const log = new Logger('app.firewall');

export async function checkFirewall(store: EntityStore): Promise<FirewallStatus> {
  const firewall = await api().call(E.checkFirewall, {});
  store.update((state) => ({ ...state, firewall }));
  log.info('firewall.checked', { backend: firewall.backend });
  return firewall;
}

export type SystemPromptApply = (revision: string) => Promise<FirewallApplyResult>;

export async function applyFirewall(
  store: EntityStore,
  systemPrompt: SystemPromptApply | null,
  revision: string,
): Promise<FirewallApplyResult> {
  const fromServer = await api().call(E.applyFirewall, { body: { revision } });
  const result =
    fromServer.outcome === 'unavailable' && systemPrompt !== null
      ? await systemPrompt(revision)
      : fromServer;
  store.update((state) => ({ ...state, firewall: result.status }));
  log.info('firewall.applied', { outcome: result.outcome, via: result.via });
  return result;
}
