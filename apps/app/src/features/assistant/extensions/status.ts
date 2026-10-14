import {
  harnessTargetKey,
  type AiHarnessConfigurationHostStatus,
  type AiHarnessCatalogue,
  type AiHarnessConfigurationCatalogue,
  type HarnessExtensionItem,
  type HarnessPluginReadiness,
} from '@smarteverything/domain';
import type { Tone } from '../../../components/tone';
import { entryId, selectedEntry } from './selection';
import { assetProviderName } from './items';

export interface ExtensionDeviceStatus {
  readonly title: string;
  readonly tone: Tone;
  readonly reason: string | null;
  readonly current: boolean;
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

export function deviceStatus(
  host: AiHarnessConfigurationHostStatus,
  item?: HarnessExtensionItem,
): ExtensionDeviceStatus {
  const base = { current: false, tone: 'variant' as const, reason: null };
  const title = freshnessStatus(host);
  if (title !== null) return { ...base, title };
  if (item !== undefined) {
    const entry = host.report?.readiness.find((row) => row.id === entryId(item));
    return entry === undefined ? { ...base, title: 'Waiting for device' } : readinessStatus(entry);
  }
  return overallStatus(host);
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
  if (readiness.every((row) => row.state === 'ready' || row.state === 'disabled'))
    return { ...base, current: true, tone: 'positive', title: 'Ready' };
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
  if (item.selection.kind === 'skill_asset')
    return `Included in ${assetProviderName(item.selection.parent_id)} · device status is for the provider`;
  if (selectedEntry(item, configuration.desired)?.enabled === false) return 'Off · saved choice';
  const statuses = configuration.hosts.map((host) => deviceStatus(host, item));
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
    platform: inventory?.platform ?? 'SmartEverything',
  };
}

export function canInstall(
  item: HarnessExtensionItem,
  catalogue: AiHarnessCatalogue | undefined,
): boolean {
  if (
    item.acquisition.state !== 'available' ||
    catalogue === undefined ||
    !item.runtimes.includes('smarteverything')
  )
    return false;
  return catalogue.hosts.some(
    (host) =>
      host.target.kind === 'device' &&
      item.platforms.includes(host.platform) &&
      host.configuration_sync === true,
  );
}

function currentPending(host: AiHarnessConfigurationHostStatus): boolean {
  return (
    host.report !== null &&
    host.report.runtime_instance === host.runtime_instance &&
    host.report.connection_generation === host.connection_generation &&
    host.report.pending_revision !== undefined
  );
}
