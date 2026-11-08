import { z } from 'zod';
import {
  PLUGIN_AUTOMATION,
  PLUGIN_KIND_LOCAL_ID,
  pluginSignalSource,
  type AutomationOwner,
  type PluginAutomation,
  type PluginEventKind,
  type PluginManifest,
  type PluginRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { syncContribution, type PluginKindCatalog } from './catalog';

const log = new Logger('hub.plugin-kinds');

export const PLUGIN_ORIGIN_ICON = 'puzzle';

export interface AutomationContribution {
  readonly owner: AutomationOwner;
  readonly name: string;
  readonly icon: string;
  readonly version: string;
  readonly automation: PluginAutomation;
  readonly events: readonly PluginEventKind[];
  readonly data: readonly { readonly stream: string }[];
  readonly signalSource: string | null;
}

export function pluginContribution(manifest: PluginManifest): AutomationContribution {
  return {
    owner: { kind: 'plugin', id: manifest.id },
    name: manifest.name,
    icon: manifest.icon ?? PLUGIN_ORIGIN_ICON,
    version: manifest.version,
    automation: manifest.contributes.automation,
    events: manifest.contributes.events,
    data: manifest.contributes.data,
    signalSource: pluginSignalSource(manifest.id),
  };
}

const TEXT = z.string().trim().min(1);

export const DRIVER_AUTOMATION = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'a lower-case driver id'),
  name: TEXT,
  icon: TEXT,
  version: TEXT,
  automation: PLUGIN_AUTOMATION,
  data: z.array(z.strictObject({ stream: PLUGIN_KIND_LOCAL_ID })).default([]),
});

export type DriverAutomationInput = z.input<typeof DRIVER_AUTOMATION>;

export type DriverContribution =
  | { readonly ok: true; readonly contribution: AutomationContribution }
  | { readonly ok: false; readonly problem: string };

export function driverContribution(input: DriverAutomationInput): DriverContribution {
  const parsed = DRIVER_AUTOMATION.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problem: parsed.error.issues.map((issue) => issue.message).join('; ') };
  }
  const driver = parsed.data;
  return {
    ok: true,
    contribution: {
      owner: { kind: 'driver', id: driver.id },
      name: driver.name,
      icon: driver.icon,
      version: driver.version,
      automation: driver.automation,
      events: [],
      data: driver.data,
      signalSource: null,
    },
  };
}

export function registerDriverAutomation(
  catalog: Pick<PluginKindCatalog, 'replace' | 'remove'>,
  driver: DriverAutomationInput,
): () => void {
  const parsed = driverContribution(driver);
  if (!parsed.ok) {
    log.warn('plugin_kinds.driver_rejected', { driver: driver.id, problem: parsed.problem });
    return (): void => undefined;
  }
  const { owner } = syncContribution(catalog, parsed.contribution);
  return (): void => {
    catalog.remove(owner);
  };
}

export interface LoadedPlugins {
  readonly plugins: () => readonly Pick<PluginRow, 'id' | 'manifest'>[];
  readonly loaded: (pluginId: string) => boolean;
  readonly changes: (listener: () => void) => () => void;
}

export type KindStatusWriter = (pluginId: string, detail: string) => void;

interface Synced {
  readonly owner: string;
  readonly print: string;
}

function printOf(manifest: PluginManifest): string {
  return JSON.stringify([manifest.version, manifest.contributes.automation]);
}

export function followPluginKinds(
  catalog: Pick<PluginKindCatalog, 'replace' | 'remove'>,
  source: LoadedPlugins,
  writeDetail: KindStatusWriter,
): () => void {
  const synced = new Map<string, Synced>();
  const unload = (pluginId: string, entry: Synced): void => {
    synced.delete(pluginId);
    catalog.remove(entry.owner);
  };
  const sync = (): void => {
    const live = new Map(
      source
        .plugins()
        .filter((row) => source.loaded(row.id))
        .map((row) => [row.id, row.manifest]),
    );
    for (const [pluginId, entry] of synced) if (!live.has(pluginId)) unload(pluginId, entry);
    for (const [pluginId, manifest] of live) {
      const print = printOf(manifest);
      if (synced.get(pluginId)?.print === print) continue;
      const result = syncContribution(catalog, pluginContribution(manifest));
      synced.set(pluginId, { owner: result.owner, print });
      if (result.statusDetail !== null) writeDetail(pluginId, result.statusDetail);
    }
  };
  sync();
  const stop = source.changes(sync);
  return (): void => {
    stop();
    for (const [pluginId, entry] of synced) unload(pluginId, entry);
  };
}
