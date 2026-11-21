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
import { PLUGIN_ORIGIN_ICON } from './triggers';

const log = new Logger('hub.plugin-kinds');

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
  readonly plugins: () => Promise<readonly Pick<PluginRow, 'id' | 'manifest'>[]>;
  readonly loaded: (pluginId: string) => boolean;
  readonly changes: (listener: () => void) => () => void;
}

export type KindStatusWriter = (pluginId: string, detail: string) => Promise<void>;

export interface PluginKindFollow {
  readonly settled: () => Promise<void>;
  readonly stop: () => void;
}

interface Synced {
  readonly owner: string;
  readonly print: string;
}

function printOf(manifest: PluginManifest): string {
  return JSON.stringify([manifest.version, manifest.contributes.automation]);
}

export async function followPluginKinds(
  catalog: Pick<PluginKindCatalog, 'replace' | 'remove'>,
  source: LoadedPlugins,
  writeDetail: KindStatusWriter,
  failed: (cause: unknown) => void,
): Promise<PluginKindFollow> {
  const synced = new Map<string, Synced>();
  let stopped = false;
  const unload = (pluginId: string, entry: Synced): void => {
    synced.delete(pluginId);
    catalog.remove(entry.owner);
  };
  const sync = async (): Promise<void> => {
    const rows = await source.plugins();
    if (stopped) return;
    const live = new Map(
      rows.filter((row) => source.loaded(row.id)).map((row) => [row.id, row.manifest]),
    );
    for (const [pluginId, entry] of synced) if (!live.has(pluginId)) unload(pluginId, entry);
    const details: [string, string][] = [];
    for (const [pluginId, manifest] of live) {
      const print = printOf(manifest);
      if (synced.get(pluginId)?.print === print) continue;
      const result = syncContribution(catalog, pluginContribution(manifest));
      synced.set(pluginId, { owner: result.owner, print });
      if (result.statusDetail !== null) details.push([pluginId, result.statusDetail]);
    }
    for (const [pluginId, detail] of details) await writeDetail(pluginId, detail);
  };
  let chain = sync();
  const stopChanges = source.changes(() => {
    chain = chain.then(sync, sync).catch(failed);
  });
  try {
    await chain;
  } catch (cause) {
    stopped = true;
    stopChanges();
    throw cause;
  }
  return {
    settled: () => chain,
    stop: (): void => {
      stopped = true;
      stopChanges();
      for (const [pluginId, entry] of synced) unload(pluginId, entry);
    },
  };
}
