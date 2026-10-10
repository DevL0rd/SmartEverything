import {
  API_ENDPOINTS as E,
  type DesktopFirewallResult,
  type FirewallStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DesktopBridge } from '../design/platform';
import type { EntityStore } from '../store/entity-store';
import { api } from './transport';

const log = new Logger('app.firewall');

export async function checkFirewall(store: EntityStore): Promise<FirewallStatus> {
  const firewall = await api().call(E.checkFirewall, {});
  store.update((state) => ({ ...state, firewall }));
  log.info('firewall.checked', { backend: firewall.backend });
  return firewall;
}

export async function applyFirewall(
  bridge: DesktopBridge,
  revision: string,
): Promise<DesktopFirewallResult> {
  const result = await bridge.applyFirewall(revision);
  log.info('firewall.applied', { outcome: result.outcome });
  return result;
}
