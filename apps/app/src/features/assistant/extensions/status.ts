import {
  harnessTargetKey,
  type AiHarnessConfigurationHostStatus,
  type AiHarnessCatalogue,
  type AiHarnessConfigurationCatalogue,
  type HarnessDesiredConfiguration,
  type HarnessExtensionItem,
  type HarnessPluginReadiness,
} from '@smarteverything/domain';
import type { Tone } from '../../../components/tone';
import { platformLabel } from './items';

export interface ExtensionDeviceStatus {
  readonly title: string;
  readonly tone: Tone;
  readonly reason: string | null;
  readonly current: boolean;
}

export interface ItemScope {
  readonly item: HarnessExtensionItem;
  readonly desired: HarnessDesiredConfiguration;
}

const READINESS: Readonly<Record<HarnessPluginReadiness['state'], string>> = {
  ready: 'Ready',
  disabled: 'Off',
  missing: 'Not installed on this device',
  incompatible: 'Not supported here',
  failed: 'Couldn’t start',
  pending: 'Waiting for device',
};

function freshnessStatus(host: AiHarnessConfigurationHostStatus): string | null {
  if (!host.online) return 'Offline · will check when it reconnects';
  if (host.freshness === 'unsupported') return 'Configuration sync unavailable';
  if (host.freshness === 'unreported') return 'Waiting for device';
  if (currentPending(host)) return 'After current sessions finish';
  return host.freshness === 'stale' ? 'Waiting for current status' : null;
}

function readinessId(scope: ItemScope): string | undefined {
  const { item, desired } = scope;
  if (item.kind === 'builtin') return item.id;
  return desired.entries.find(
    (entry) => entry.metadata?.skill_assets.some((asset) => asset.id === item.id) === true,
  )?.id;
}

export function deviceStatus(
  host: AiHarnessConfigurationHostStatus,
  scope?: ItemScope,
): ExtensionDeviceStatus {
  const base = { current: false, tone: 'variant' as const, reason: null };
  const title = freshnessStatus(host);
  if (title !== null) return { ...base, title };
  if (scope === undefined) return overallStatus(host);
  if (!scope.item.enabled) return { ...base, title: READINESS.disabled };
  const id = readinessId(scope);
  const row = host.report?.readiness.find((entry) => entry.id === id);
  return row === undefined ? { ...base, title: 'Waiting for device' } : readinessStatus(row);
}

function waitingLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'item' : 'items'} waiting`;
}

function overallStatus(host: AiHarnessConfigurationHostStatus): ExtensionDeviceStatus {
  const base = { current: false, tone: 'variant' as const, reason: null };
  const readiness = host.report?.readiness;
  if (readiness === undefined || readiness.length === 0)
    return { ...base, title: 'Waiting for device' };
  if (readiness.some((row) => row.state === 'failed'))
    return { ...base, tone: 'warning', title: 'Needs attention' };
  if (readiness.every((row) => row.state === 'incompatible'))
    return { ...base, title: 'Not supported here' };
  const waiting = readiness.filter((row) => row.state === 'pending' || row.state === 'missing');
  if (waiting.length === 0) return { ...base, current: true, tone: 'positive', title: 'Ready' };
  if (readiness.some((row) => row.state === 'ready'))
    return {
      ...base,
      current: true,
      tone: 'positive',
      title: `Ready · ${waitingLabel(waiting.length)}`,
    };
  return { ...base, title: 'Waiting for device' };
}

function readinessStatus(entry: HarnessPluginReadiness): ExtensionDeviceStatus {
  const tone = entry.state === 'failed' ? 'critical' : 'variant';
  return {
    title: READINESS[entry.state],
    reason: entry.reason,
    tone: entry.state === 'ready' ? 'positive' : tone,
    current: entry.state === 'ready',
  };
}

export function devicesSummary(hosts: readonly AiHarnessConfigurationHostStatus[]): string {
  const ready = hosts.filter((host) => deviceStatus(host).current).length;
  return `${String(ready)} ready · ${String(hosts.length - ready)} waiting`;
}

export function itemSummary(
  item: HarnessExtensionItem,
  configuration: AiHarnessConfigurationCatalogue,
): string {
  if (!item.enabled) return 'Off';
  if (item.executes && !item.confirmed) return 'Needs your approval to run programs';
  const scope = { item, desired: configuration.desired };
  const statuses = configuration.hosts.map((host) => deviceStatus(host, scope));
  const ready = statuses.filter((status) => status.current).length;
  if (ready > 0) return `Ready on ${String(ready)} ${ready === 1 ? 'device' : 'devices'}`;
  if (statuses.some((status) => status.tone === 'critical')) return 'Needs attention on a device';
  return 'Waiting for device status';
}

export function hostDescription(
  host: AiHarnessConfigurationHostStatus,
  catalogue: AiHarnessCatalogue | undefined,
): { readonly name: string; readonly platform: string } {
  const inventory = catalogue?.hosts.find(
    (row) => harnessTargetKey(row.target) === harnessTargetKey(host.target),
  );
  return {
    name: inventory?.name ?? (host.target.kind === 'server' ? 'Home hub' : 'Enrolled device'),
    platform: inventory === undefined ? 'SmartEverything' : platformLabel(inventory.platform),
  };
}

export function readinessOf(
  host: AiHarnessConfigurationHostStatus,
  scope: ItemScope,
): HarnessPluginReadiness | undefined {
  const id = readinessId(scope);
  return host.report?.readiness.find((row) => row.id === id);
}

function currentPending(host: AiHarnessConfigurationHostStatus): boolean {
  return (
    host.report !== null &&
    host.report.runtime_instance === host.runtime_instance &&
    host.report.connection_generation === host.connection_generation &&
    host.report.pending_revision !== undefined
  );
}
