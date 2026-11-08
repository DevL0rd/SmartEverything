import type {
  AutomationPluginKindRow,
  InputPortDecl,
  NodeKind,
  OutputPortDecl,
  PluginKindProblems,
  PortValue,
  ProgramV4,
} from '@smarteverything/domain';
import type { KindAvailability } from '@smarteverything/flow/check/lint-types';
import {
  classifyInterfaceChange,
  type InterfaceChange,
} from '@smarteverything/flow/functions/compat';
import {
  interfaceHash,
  type FunctionInterface,
} from '@smarteverything/flow/functions/interface-hash';
import { triggersOf } from '@smarteverything/flow/graph/ops/identity';
import { sitesOf } from '@smarteverything/flow/graph/ops/refs';
import { Logger } from '@smarteverything/logging';
import { kindStatusDetail } from './assemble';

const log = new Logger('hub.plugin-kinds');

export interface KindVersionMap {
  readonly renamed: Readonly<Record<string, string>>;
  readonly removedPorts: readonly string[];
}

export interface KindProposal {
  readonly kind: NodeKind;
  readonly version: string;
  readonly map?: KindVersionMap;
}

export interface KindMigration {
  readonly kindId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly renamedInputs: Readonly<Record<string, string>>;
  readonly renamedOutputs: Readonly<Record<string, string>>;
  readonly removedInputs: readonly string[];
  readonly removedOutputs: readonly string[];
}

export type KindVerdict =
  | { readonly type: 'accepted'; readonly migration: KindMigration | null }
  | { readonly type: 'rejected'; readonly problems: readonly string[] };

export interface VersionPlan {
  readonly accepted: readonly KindProposal[];
  readonly kept: readonly NodeKind[];
  readonly migrations: readonly KindMigration[];
  readonly rejections: readonly PluginKindProblems[];
  readonly statusDetail: string | null;
}

const NO_MAP: KindVersionMap = { renamed: {}, removedPorts: [] };

const ACCEPTED: KindVerdict = { type: 'accepted', migration: null };

function segmentsOf(version: string): readonly number[] | null {
  const parts = version.split('.');
  return parts.every((part) => /^\d+$/.test(part)) ? parts.map(Number) : null;
}

export function versionRaised(before: string, after: string): boolean {
  const left = segmentsOf(before);
  const right = segmentsOf(after);
  if (left === null || right === null) return false;
  for (let place = 0; place < Math.max(left.length, right.length); place += 1) {
    const step = (right[place] ?? 0) - (left[place] ?? 0);
    if (step !== 0) return step > 0;
  }
  return false;
}

function hashOf(kind: NodeKind): string {
  return interfaceHash({ inputs: kind.inputs, outputs: kind.outputs, exits: kind.exits });
}

function renamedTo(map: KindVersionMap, name: string): string {
  return Object.hasOwn(map.renamed, name) ? (map.renamed[name] ?? name) : name;
}

function namesOf(ports: readonly { readonly name: string }[]): ReadonlySet<string> {
  return new Set(ports.map((port) => port.name));
}

interface Side {
  readonly label: 'input' | 'output';
  readonly was: ReadonlySet<string>;
  readonly now: ReadonlySet<string>;
}

function sideProblems(side: Side, from: string, to: string): readonly string[] {
  const { label, was, now } = side;
  if (!was.has(from)) return [];
  if (now.has(from)) return [`The ${label} ${from} is listed as renamed but is still declared.`];
  if (was.has(to)) return [`The ${label} ${from} is renamed to ${to}, which already exists.`];
  if (!now.has(to)) return [`The ${label} ${from} is renamed to ${to}, which is not declared.`];
  return [];
}

function mapProblems(before: NodeKind, after: NodeKind, map: KindVersionMap): readonly string[] {
  const inputs: Side = { label: 'input', was: namesOf(before.inputs), now: namesOf(after.inputs) };
  const outputs: Side = {
    label: 'output',
    was: namesOf(before.outputs),
    now: namesOf(after.outputs),
  };
  const targets = Object.values(map.renamed);
  return [
    ...(new Set(targets).size === targets.length ? [] : ['Two ports are renamed to one name.']),
    ...Object.entries(map.renamed).flatMap(([from, to]) => [
      ...(map.removedPorts.includes(from) ? [`${from} is listed as renamed and as removed.`] : []),
      ...sideProblems(inputs, from, to),
      ...sideProblems(outputs, from, to),
    ]),
    ...map.removedPorts
      .filter((name) => inputs.now.has(name) || outputs.now.has(name))
      .map((name) => `${name} is listed as removed but is still declared.`),
  ];
}

function mapped(before: NodeKind, map: KindVersionMap): FunctionInterface {
  const dropped = new Set(map.removedPorts);
  const keep = <T extends { readonly name: string }>(ports: readonly T[]): T[] =>
    ports
      .filter((port) => !dropped.has(port.name))
      .map((port) => ({ ...port, name: renamedTo(map, port.name) }));
  return {
    inputs: keep<InputPortDecl>(before.inputs),
    outputs: keep<OutputPortDecl>(before.outputs),
    exits: before.exits,
  };
}

function isFree(change: InterfaceChange, after: NodeKind): boolean {
  if (change.code === 'label-changed' || change.code === 'description-changed') return true;
  if (change.code === 'input-added') {
    return after.inputs.find((port) => port.name === change.name)?.required === false;
  }
  if (change.code === 'output-added') {
    return after.outputs.find((port) => port.name === change.name)?.optional === true;
  }
  return false;
}

function breakingProblem(change: InterfaceChange): string {
  if (change.code === 'input-removed' || change.code === 'output-removed') {
    return `${change.reason} List it in removedPorts, or in renamed when it moved.`;
  }
  return `${change.reason} Stored programs cannot be rewritten for this.`;
}

function pick(ports: readonly { readonly name: string }[], names: ReadonlySet<string>): string[] {
  return ports.filter((port) => names.has(port.name)).map((port) => port.name);
}

function migrationOf(
  stored: AutomationPluginKindRow,
  proposal: KindProposal,
  map: KindVersionMap,
): KindMigration | null {
  const before = stored.declaration;
  const dropped = new Set(map.removedPorts);
  const renamed = new Set(Object.keys(map.renamed));
  const subset = (names: readonly string[]): Record<string, string> =>
    Object.fromEntries(names.map((name) => [name, renamedTo(map, name)]));
  const migration: KindMigration = {
    kindId: proposal.kind.id,
    fromVersion: stored.version,
    toVersion: proposal.version,
    renamedInputs: subset(pick(before.inputs, renamed)),
    renamedOutputs: subset(pick(before.outputs, renamed)),
    removedInputs: pick(before.inputs, dropped),
    removedOutputs: pick(before.outputs, dropped),
  };
  const touches = [
    ...Object.keys(migration.renamedInputs),
    ...Object.keys(migration.renamedOutputs),
    ...migration.removedInputs,
    ...migration.removedOutputs,
  ];
  return touches.length === 0 ? null : migration;
}

function rejected(problems: readonly string[]): KindVerdict {
  return { type: 'rejected', problems };
}

export function judgeKind(
  stored: AutomationPluginKindRow | undefined,
  proposal: KindProposal,
): KindVerdict {
  const { kind } = proposal;
  if (stored === undefined || stored.interface_hash === hashOf(kind)) return ACCEPTED;
  const map = proposal.map ?? NO_MAP;
  const invalid = mapProblems(stored.declaration, kind, map);
  if (invalid.length > 0) return rejected(invalid);
  const { changes } = classifyInterfaceChange(mapped(stored.declaration, map), {
    inputs: kind.inputs,
    outputs: kind.outputs,
    exits: kind.exits,
  });
  const breaking = changes.filter((change) => change.compat === 'breaking');
  if (breaking.length > 0) return rejected(breaking.map(breakingProblem));
  const migration = migrationOf(stored, proposal, map);
  const needsVersion = migration !== null || changes.some((change) => !isFree(change, kind));
  if (needsVersion && !versionRaised(stored.version, proposal.version)) {
    return rejected([
      `The interface changed, so the version must be raised above ${stored.version}.`,
    ]);
  }
  return { type: 'accepted', migration };
}

export function planKindVersions(
  stored: readonly AutomationPluginKindRow[],
  proposals: readonly KindProposal[],
): VersionPlan {
  const known = new Map(stored.map((row) => [row.kind_id, row]));
  const accepted: KindProposal[] = [];
  const kept: NodeKind[] = [];
  const migrations: KindMigration[] = [];
  const rejections: PluginKindProblems[] = [];
  for (const proposal of proposals) {
    const before = known.get(proposal.kind.id);
    const verdict = judgeKind(before, proposal);
    if (verdict.type === 'accepted') {
      accepted.push(proposal);
      if (verdict.migration !== null) {
        migrations.push(verdict.migration);
        log.info('plugin_kinds.migration_recorded', { ...verdict.migration });
      }
      continue;
    }
    log.warn('plugin_kinds.version_rejected', {
      kind: proposal.kind.id,
      from: before?.version,
      to: proposal.version,
      problems: verdict.problems,
    });
    rejections.push({ kindId: proposal.kind.id, problems: verdict.problems });
    if (before !== undefined) kept.push(before.declaration);
  }
  return { accepted, kept, migrations, rejections, statusDetail: kindStatusDetail(rejections) };
}

export interface UnresolvedPort {
  readonly key: string;
  readonly kind: string;
  readonly port: string;
  readonly reason: string;
}

export interface MigratedProgram<P extends ProgramV4 = ProgramV4> {
  readonly program: P;
  readonly rewritten: number;
  readonly unresolved: readonly UnresolvedPort[];
}

interface Holder {
  key: string;
  kind: string;
  ports?: Record<string, PortValue> | undefined;
}

interface PortsOutcome {
  readonly ports: Record<string, PortValue>;
  readonly changed: number;
}

function migratedPorts(
  holder: Holder,
  ports: Record<string, PortValue>,
  migration: KindMigration,
  unresolved: UnresolvedPort[],
): PortsOutcome {
  const removed = new Set(migration.removedInputs);
  const next: [string, PortValue][] = [];
  let changed = 0;
  for (const [name, value] of Object.entries(ports)) {
    const target = Object.hasOwn(migration.renamedInputs, name)
      ? migration.renamedInputs[name]
      : undefined;
    if (removed.has(name)) changed += 1;
    else if (target === undefined) next.push([name, value]);
    else if (Object.hasOwn(ports, target)) {
      unresolved.push({
        key: holder.key,
        kind: holder.kind,
        port: name,
        reason: `${target} is already set`,
      });
      next.push([name, value]);
    } else {
      next.push([target, value]);
      changed += 1;
    }
  }
  return { ports: Object.fromEntries(next), changed };
}

function migrateWires(
  program: ProgramV4,
  byKey: ReadonlyMap<string, KindMigration>,
  unresolved: UnresolvedPort[],
): number {
  let changed = 0;
  for (const site of sitesOf(program)) {
    if (!('wire' in site.value)) continue;
    const { from, port } = site.value.wire;
    const migration = byKey.get(from);
    if (migration === undefined) continue;
    const target = Object.hasOwn(migration.renamedOutputs, port)
      ? migration.renamedOutputs[port]
      : undefined;
    if (target !== undefined) {
      site.assign({ wire: { from, port: target } });
      changed += 1;
    } else if (migration.removedOutputs.includes(port)) {
      unresolved.push({
        key: from,
        kind: migration.kindId,
        port,
        reason: 'the output was removed',
      });
    }
  }
  return changed;
}

function holdersOf(program: ProgramV4): Holder[] {
  return [...triggersOf(program), ...program.nodes];
}

export function rewriteProgramKinds<P extends ProgramV4>(
  program: P,
  migrations: readonly KindMigration[],
): MigratedProgram<P> {
  const byKind = new Map(migrations.map((migration) => [migration.kindId, migration]));
  const clone = structuredClone(program);
  const byKey = new Map<string, KindMigration>();
  for (const holder of holdersOf(clone)) {
    const migration = byKind.get(holder.kind);
    if (migration !== undefined) byKey.set(holder.key, migration);
  }
  const unresolved: UnresolvedPort[] = [];
  let rewritten = 0;
  for (const holder of holdersOf(clone)) {
    const migration = byKey.get(holder.key);
    if (migration === undefined || holder.ports === undefined) continue;
    const outcome = migratedPorts(holder, holder.ports, migration, unresolved);
    if (outcome.changed === 0) continue;
    holder.ports = outcome.ports;
    rewritten += outcome.changed;
  }
  rewritten += migrateWires(clone, byKey, unresolved);
  for (const entry of unresolved) log.warn('plugin_kinds.migration_unresolved', { ...entry });
  return { program: rewritten === 0 ? program : clone, rewritten, unresolved };
}

export function usedKindIds(program: ProgramV4): ReadonlySet<string> {
  return new Set(holdersOf(program).map((holder) => holder.kind));
}

export function prunableKinds(
  rows: readonly AutomationPluginKindRow[],
  used: ReadonlySet<string>,
): readonly string[] {
  return rows
    .filter((row) => row.status === 'retired' && !used.has(row.kind_id))
    .map((row) => row.kind_id);
}

export function availabilityOf(row: AutomationPluginKindRow): KindAvailability | undefined {
  if (row.status === 'active') return undefined;
  const { replacedBy } = row.declaration;
  return {
    status: row.status,
    plugin: row.declaration.origin?.name ?? row.owner,
    ...(replacedBy === undefined ? {} : { replacedBy }),
  };
}
