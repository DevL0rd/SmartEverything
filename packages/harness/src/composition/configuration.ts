import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import {
  harnessMountRevision,
  harnessMountRevisionBinding,
  withHarnessMountRevision,
  type HarnessMountRevisionBinding,
} from './mount-revision';
import { createHash } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { AiHarnessManifest, HarnessPluginMetadata } from '@smarteverything/domain';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { HARNESS_PLUGIN_METADATA } from '@smarteverything/domain';
import type { JSON_VALUE } from '@smarteverything/domain';
import type {
  HarnessDesiredConfiguration,
  HarnessDesiredEntry,
  HarnessPluginReadiness,
} from '@smarteverything/domain';
import { HarnessConfigurationRevisions } from './configuration-revisions';

export { HARNESS_DESIRED_CONFIGURATION } from '@smarteverything/domain';
export type {
  HarnessDesiredConfiguration,
  HarnessDesiredEntry,
  HarnessPluginReadiness,
} from '@smarteverything/domain';

export interface HarnessRestoreSchema {
  readonly name: string;
  readonly revision: string;
}

const RESTORE_SCHEMA = z.strictObject({ name: z.string().min(1), revision: z.string().min(1) });

export interface InstalledHarnessPlugin {
  readonly package: string;
  readonly version: string;
  readonly provenance: string;
  readonly metadata?: HarnessPluginMetadata;
  readonly restoreSchemas?: readonly HarnessRestoreSchema[];
  readonly platforms: readonly string[];
  readonly serverSafe?: boolean;
  readonly features?: AiHarnessManifest['features'];
  readonly resolve?: (entry: HarnessDesiredEntry) => Promise<InstalledHarnessPlugin>;
  mount(
    ctx: Context,
    config: Readonly<Record<string, z.infer<typeof JSON_VALUE>>>,
  ): Promise<{ readonly dispose: () => Promise<void> }>;
}

interface MountedPlugin {
  readonly revision: HarnessMountRevisionBinding;
  readonly signature: string;
  readonly entry: HarnessDesiredEntry;
  readonly restoreSchemas: readonly HarnessRestoreSchema[];
  readonly provenance: string;
  readonly metadata: HarnessPluginMetadata | null;
  readonly dispose: () => Promise<void>;
  readonly restore: () => Promise<{ readonly dispose: () => Promise<void> }>;
}

export class HarnessConfiguration {
  private readonly mounted = new Map<string, MountedPlugin>();
  private current: HarnessDesiredConfiguration | undefined;
  private tail: Promise<void> = Promise.resolve();
  private readonly revisions = new HarnessConfigurationRevisions();
  private readiness: readonly HarnessPluginReadiness[] = [];

  constructor(
    private readonly ctx: Context,
    private readonly host: { readonly platform: string; readonly server: boolean },
    private readonly installed: readonly InstalledHarnessPlugin[],
    private readonly changed: (
      revision: string,
      readiness: readonly HarnessPluginReadiness[],
    ) => void,
  ) {}

  snapshot(): readonly HarnessPluginReadiness[] {
    return this.readiness;
  }

  revision(): string | null {
    return this.current?.revision ?? null;
  }

  fingerprint(): string {
    const readiness = this.readiness
      .map(({ id, package: name, requestedVersion, installedVersion, state }) => ({
        id,
        package: name,
        requestedVersion,
        installedVersion,
        state,
      }))
      .sort(orderById);
    const mounted = [...this.mounted]
      .map(([id, plugin]) => ({
        id,
        package: plugin.entry.package,
        version: plugin.entry.version,
        config: plugin.entry.config,
        provenance: plugin.provenance,
        metadata: plugin.metadata,
        restoreSchemas: plugin.restoreSchemas,
      }))
      .sort(orderById);
    return createHash('sha256').update(JSON.stringify({ readiness, mounted })).digest('hex');
  }

  restoreFingerprint(): string {
    const schemas = [...this.mounted.values()]
      .flatMap((plugin) =>
        plugin.restoreSchemas.map((schema) => ({
          id: `${plugin.entry.package}/${schema.name}`,
          revision: schema.revision,
        })),
      )
      .sort(orderById);
    return createHash('sha256').update(JSON.stringify(schemas)).digest('hex');
  }

  desiredFingerprint(): string {
    return createHash('sha256').update(JSON.stringify(this.current)).digest('hex');
  }

  features(): AiHarnessManifest['features'] {
    return this.readiness.flatMap((entry) => {
      if (entry.state !== 'ready') return [];
      const plugin = this.installed.find((item) => item.package === entry.package);
      return plugin?.features ?? [];
    });
  }

  reconcile(input: HarnessDesiredConfiguration): Promise<void> {
    const desired = this.validate(input);
    const next = this.tail.then(
      () => this.apply(desired),
      () => this.apply(desired),
    );
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  validate(input: HarnessDesiredConfiguration): HarnessDesiredConfiguration {
    return this.revisions.accept(input);
  }

  private async apply(desired: HarnessDesiredConfiguration): Promise<void> {
    const active = new Set(
      desired.entries.filter((entry) => entry.enabled).map((entry) => entry.id),
    );
    for (const [id, mounted] of this.mounted) {
      if (active.has(id)) continue;
      await mounted.dispose();
      this.mounted.delete(id);
    }
    const readiness: HarnessPluginReadiness[] = [];
    for (const entry of desired.entries)
      readiness.push(
        await withHarnessMountRevision(desired.revision, () => this.reconcileEntry(entry)),
      );
    this.readiness = deepFreeze(readiness);
    this.current = desired;
    this.changed(desired.revision, this.readiness);
  }

  async dispose(): Promise<void> {
    await this.tail;
    for (const mounted of this.mounted.values()) await mounted.dispose();
    this.mounted.clear();
  }

  private async reconcileEntry(entry: HarnessDesiredEntry): Promise<HarnessPluginReadiness> {
    const plugin = this.installed.find((item) => item.package === entry.package);
    const base = this.retainedIdentity(entry, plugin);
    if (!entry.enabled) return { ...base, state: 'disabled', reason: null };
    if (plugin === undefined)
      return { ...base, state: 'missing', reason: 'Package is not installed on this host.' };
    if (!eligiblePlugin(entry, plugin, this.host))
      return {
        ...base,
        state: 'incompatible',
        reason:
          'Exact version, platform, artifact identity or server-safe eligibility is incompatible.',
      };
    return this.resolveEntry(entry, plugin);
  }

  private async resolveEntry(
    entry: HarnessDesiredEntry,
    installed: InstalledHarnessPlugin,
  ): Promise<HarnessPluginReadiness> {
    try {
      const plugin = installed.resolve === undefined ? installed : await installed.resolve(entry);
      if (
        plugin.package !== installed.package ||
        !eligiblePlugin(entry, plugin, this.host) ||
        !metadataMatches(entry, plugin)
      )
        return {
          ...readinessIdentity(entry, plugin),
          state: 'incompatible',
          reason: 'Verified artifact metadata does not match the desired identity.',
        };
      return await this.mountEntry(entry, plugin, readinessIdentity(entry, plugin));
    } catch (error) {
      assertSettledConfigurationFailure(error);
      return {
        ...this.retainedIdentity(entry, installed),
        state: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private retainedIdentity(
    entry: HarnessDesiredEntry,
    plugin?: InstalledHarnessPlugin,
  ): Omit<HarnessPluginReadiness, 'state' | 'reason'> {
    const previous = this.mounted.get(entry.id);
    return {
      ...readinessIdentity(entry, plugin),
      ...(previous === undefined
        ? {}
        : {
            installedVersion: previous.entry.version,
            provenance: previous.provenance,
            installedMetadata: previous.metadata,
          }),
    };
  }
  private async unmountChanged(entry: HarnessDesiredEntry): Promise<void> {
    const previous = this.mounted.get(entry.id);
    if (previous === undefined || previous.signature === JSON.stringify(entry)) return;
    try {
      await previous.dispose();
    } catch (cause) {
      throw new HarnessRuntimeError(
        'source_outcome_unknown',
        'Previous extension cleanup is unconfirmed; replacement was not activated.',
        null,
        { cause },
      );
    }
    this.mounted.delete(entry.id);
  }

  private async mountEntry(
    entry: HarnessDesiredEntry,
    plugin: InstalledHarnessPlugin,
    base: Omit<HarnessPluginReadiness, 'state' | 'reason'>,
  ): Promise<HarnessPluginReadiness> {
    const signature = JSON.stringify(entry);
    const previous = this.mounted.get(entry.id);
    if (previous?.signature === signature) {
      previous.revision.refresh(harnessMountRevision());
      return { ...base, state: 'ready', reason: null };
    }
    try {
      const provenance = z.string().min(1).parse(plugin.provenance);
      const metadata =
        plugin.metadata === undefined ? null : HARNESS_PLUGIN_METADATA.parse(plugin.metadata);
      const restoreSchemas = deepFreeze(z.array(RESTORE_SCHEMA).parse(plugin.restoreSchemas ?? []));
      await this.unmountChanged(entry);
      const revision = harnessMountRevisionBinding();
      const restore = (): Promise<{ readonly dispose: () => Promise<void> }> =>
        withHarnessMountRevision(revision, () => plugin.mount(this.ctx, entry.config));
      const mounted = await restore();
      this.mounted.set(entry.id, {
        revision,
        signature,
        entry,
        restoreSchemas,
        provenance,
        metadata,
        dispose: mounted.dispose,
        restore,
      });
      return { ...base, state: 'ready', reason: null };
    } catch (error) {
      assertSettledConfigurationFailure(error);
      if (previous !== undefined) {
        const retained = await previous.restore();
        this.mounted.set(entry.id, { ...previous, dispose: retained.dispose });
      }
      return {
        ...this.retainedIdentity(entry, plugin),
        state: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function orderById(left: { readonly id: string }, right: { readonly id: string }): number {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function readinessIdentity(
  entry: HarnessDesiredEntry,
  plugin?: InstalledHarnessPlugin,
): Omit<HarnessPluginReadiness, 'state' | 'reason'> {
  return {
    id: entry.id,
    package: entry.package,
    requestedVersion: entry.version,
    installedVersion: plugin?.version ?? null,
    provenance: plugin?.provenance ?? null,
    installedMetadata: plugin?.metadata ?? null,
  };
}

function metadataMatches(entry: HarnessDesiredEntry, plugin: InstalledHarnessPlugin): boolean {
  if (entry.metadata === undefined || plugin.metadata === undefined) return false;
  return (
    JSON.stringify(entry.metadata) ===
    JSON.stringify(HARNESS_PLUGIN_METADATA.parse(plugin.metadata))
  );
}

function eligiblePlugin(
  entry: HarnessDesiredEntry,
  plugin: InstalledHarnessPlugin,
  host: { readonly platform: string; readonly server: boolean },
): boolean {
  return (
    plugin.version === entry.version &&
    plugin.platforms.includes(host.platform) &&
    (!host.server || plugin.serverSafe === true)
  );
}

function assertSettledConfigurationFailure(error: unknown): void {
  if (error instanceof HarnessRuntimeError && error.code === 'source_outcome_unknown') throw error;
}
