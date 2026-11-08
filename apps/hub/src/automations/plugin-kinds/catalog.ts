import {
  DEVICE_MATCHER_MAPPINGS,
  NODE_REGISTRY,
  type AutomationPluginKindRow,
  type MatcherMapping,
  type NodeKind,
  type NodeRegistry,
  type PluginKindProblems,
} from '@smarteverything/domain';
import type { KindAvailability } from '@smarteverything/flow/check/lint-types';
import { Logger } from '@smarteverything/logging';
import type { PluginValueBinding } from '../world-v3/plugin-values';
import { assembleContribution, kindStatusDetail, type AssembledKinds } from './assemble';
import type { AutomationContribution } from './contributions';
import { DriverNodes } from './driver-nodes';
import {
  availabilityOf,
  planKindVersions,
  type KindMigration,
  type KindProposal,
} from './versions';

const log = new Logger('hub.plugin-kinds');

export interface KindCatalog {
  readonly get: (id: string) => NodeKind | undefined;
  readonly has: (id: string) => boolean;
  readonly kinds: () => readonly NodeKind[];
  readonly owners: () => ReadonlySet<string>;
  readonly matcher: (id: string) => MatcherMapping | undefined;
  readonly valueBinding: (id: string) => PluginValueBinding | undefined;
  readonly availability: (id: string) => KindAvailability | undefined;
  readonly changes: (listener: () => void) => () => void;
}

export interface PluginKindCatalog extends KindCatalog {
  readonly replace: (assembled: AssembledKinds) => readonly PluginKindProblems[];
  readonly remove: (owner: string) => void;
  readonly driverNodes: DriverNodes;
}

export interface CoreKinds {
  readonly registry: Pick<NodeRegistry, 'get' | 'has' | 'kinds'>;
  readonly matchers: Readonly<Record<string, MatcherMapping>>;
}

export interface KindLedger {
  readonly stored: (owner: string) => readonly AutomationPluginKindRow[];
  readonly row: (kindId: string) => AutomationPluginKindRow | undefined;
  readonly migrated: (migrations: readonly KindMigration[]) => void;
}

const NO_LEDGER: KindLedger = {
  stored: () => [],
  row: () => undefined,
  migrated: () => undefined,
};

const CORE: CoreKinds = { registry: NODE_REGISTRY, matchers: DEVICE_MATCHER_MAPPINGS };

interface Entry {
  readonly owner: string;
  readonly kind: NodeKind;
  readonly matcher?: MatcherMapping;
  readonly binding?: PluginValueBinding;
}

function collision(
  core: CoreKinds,
  entries: ReadonlyMap<string, Entry>,
  owner: string,
  id: string,
): string | null {
  if (core.registry.has(id)) return 'the id is already used by a core kind';
  const taken = entries.get(id);
  return taken !== undefined && taken.owner !== owner
    ? `the id is already used by ${taken.owner}`
    : null;
}

function dropOwner(entries: Map<string, Entry>, owner: string): boolean {
  const before = entries.size;
  for (const [id, entry] of entries) if (entry.owner === owner) entries.delete(id);
  return entries.size !== before;
}

function proposalsOf(assembled: AssembledKinds): {
  readonly proposals: readonly KindProposal[];
  readonly unversioned: readonly PluginKindProblems[];
} {
  const proposals: KindProposal[] = [];
  const unversioned: PluginKindProblems[] = [];
  for (const kind of assembled.kinds) {
    if (kind.version === undefined) {
      unversioned.push({ kindId: kind.id, problems: ['the kind declares no version'] });
      continue;
    }
    const map = assembled.maps[kind.id];
    proposals.push({ kind, version: String(kind.version), ...(map === undefined ? {} : { map }) });
  }
  return { proposals, unversioned };
}

function placeKinds(
  core: CoreKinds,
  entries: Map<string, Entry>,
  assembled: AssembledKinds,
  ledger: KindLedger,
): {
  readonly rejected: readonly PluginKindProblems[];
  readonly migrations: readonly KindMigration[];
} {
  dropOwner(entries, assembled.owner);
  const { proposals, unversioned } = proposalsOf(assembled);
  const plan = planKindVersions(ledger.stored(assembled.owner), proposals);
  const rejected: PluginKindProblems[] = [...unversioned, ...plan.rejections];
  for (const kind of [...plan.accepted.map((proposal) => proposal.kind), ...plan.kept]) {
    const problem = collision(core, entries, assembled.owner, kind.id);
    if (problem !== null) {
      log.warn('plugin_kinds.duplicate_rejected', { owner: assembled.owner, kind: kind.id });
      rejected.push({ kindId: kind.id, problems: [problem] });
      continue;
    }
    const matcher = assembled.matchers[kind.id];
    const binding = assembled.values[kind.id];
    entries.set(kind.id, {
      owner: assembled.owner,
      kind,
      ...(matcher === undefined ? {} : { matcher }),
      ...(binding === undefined ? {} : { binding }),
    });
  }
  return { rejected, migrations: plan.migrations };
}

export function createKindCatalog(
  core: CoreKinds = CORE,
  ledger: KindLedger = NO_LEDGER,
): PluginKindCatalog {
  const entries = new Map<string, Entry>();
  const owners = new Set<string>();
  const listeners = new Set<() => void>();
  const driverNodes = new DriverNodes();
  let listed: readonly NodeKind[] = core.registry.kinds;
  const changed = (): void => {
    listed = [...core.registry.kinds, ...[...entries.values()].map((entry) => entry.kind)];
    for (const listener of listeners) listener();
  };
  const kept = (id: string): NodeKind | undefined => {
    const row = ledger.row(id);
    return row === undefined || row.status === 'active' ? undefined : row.declaration;
  };
  return {
    get: (id) => core.registry.get(id) ?? entries.get(id)?.kind ?? kept(id),
    has: (id) => core.registry.has(id) || entries.has(id) || kept(id) !== undefined,
    availability: (id): KindAvailability | undefined => {
      if (core.registry.has(id) || entries.has(id)) return undefined;
      const row = ledger.row(id);
      return row === undefined ? undefined : availabilityOf(row);
    },
    kinds: () => listed,
    owners: () => owners,
    matcher: (id) =>
      Object.hasOwn(core.matchers, id) ? core.matchers[id] : entries.get(id)?.matcher,
    valueBinding: (id) => entries.get(id)?.binding,
    changes: (listener) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    replace: (assembled): readonly PluginKindProblems[] => {
      owners.add(assembled.owner);
      const placed = placeKinds(core, entries, assembled, ledger);
      ledger.migrated(placed.migrations);
      changed();
      return placed.rejected;
    },
    remove: (owner): void => {
      const present = owners.delete(owner);
      if (dropOwner(entries, owner) || present) changed();
    },
    driverNodes,
  };
}

export interface KindSyncResult {
  readonly owner: string;
  readonly accepted: readonly string[];
  readonly rejections: readonly PluginKindProblems[];
  readonly statusDetail: string | null;
}

export function syncContribution(
  catalog: Pick<PluginKindCatalog, 'replace'>,
  contribution: AutomationContribution,
): KindSyncResult {
  const assembled = assembleContribution(contribution);
  const duplicates = catalog.replace(assembled);
  const taken = new Set(duplicates.map((entry) => entry.kindId));
  const rejections = [...assembled.rejections, ...duplicates];
  for (const rejection of rejections) {
    log.warn('plugin_kinds.kind_rejected', {
      owner: assembled.owner,
      kind: rejection.kindId,
      problems: rejection.problems,
    });
  }
  const accepted = assembled.kinds.map((kind) => kind.id).filter((id) => !taken.has(id));
  log.info('plugin_kinds.synced', {
    owner: assembled.owner,
    accepted: accepted.length,
    rejected: rejections.length,
  });
  return {
    owner: assembled.owner,
    accepted,
    rejections,
    statusDetail: kindStatusDetail(rejections),
  };
}
