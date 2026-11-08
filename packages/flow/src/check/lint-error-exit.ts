import { ERROR_EXIT_PORT, fallibleOf, kindLookupFrom, runModeOf } from '@smarteverything/domain';
import type { ActionMode, FlowNode } from '@smarteverything/domain';
import type { LintContext, LintRule } from './lint-types';
import type { Entry } from '../program/lookup';
import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import { entryReferences, programLevelReferences } from './references';
import type { PortReference } from './references';
import { entriesOf } from './shapes';

export const ERROR_EXIT_FINDING_CODES = ['error_exit_not_fallible', 'wait_only_in_send'] as const;

export type ErrorExitFindingCode = (typeof ERROR_EXIT_FINDING_CODES)[number];

export interface ErrorExitKinds {
  readonly known: (kindId: string) => boolean;
  readonly fallible: (kindId: string) => boolean;
  readonly mode: (node: FlowNode) => ActionMode;
  readonly waitOnly: (kindId: string) => readonly string[];
}

export interface SwitchToWait {
  readonly action: 'set_run_mode';
  readonly key: string;
  readonly mode: 'wait_for_result';
}

export interface ErrorExitFinding {
  readonly severity: 'error';
  readonly code: ErrorExitFindingCode;
  readonly nodeId?: string;
  readonly key?: string;
  readonly port?: string;
  readonly message: string;
  readonly received?: string;
  readonly fix: { readonly summary: string; readonly action?: SwitchToWait };
}

function subjectOf(entry: Entry | undefined): Pick<ErrorExitFinding, 'nodeId' | 'key'> {
  return entry === undefined ? {} : { nodeId: entry.node.id, key: entry.node.key };
}

function notFallible(entries: readonly Entry[], kinds: ErrorExitKinds): ErrorExitFinding[] {
  return entries.flatMap((entry) => {
    if (entry.kind !== 'node') return [];
    const { node } = entry;
    if (node.scopes?.[ERROR_EXIT_PORT] === undefined) return [];
    if (!kinds.known(node.kind) || kinds.fallible(node.kind)) return [];
    return [
      {
        severity: 'error',
        code: 'error_exit_not_fallible',
        ...subjectOf(entry),
        port: ERROR_EXIT_PORT,
        message: `${node.key} (${node.kind}) cannot fail, so its If it fails exit never runs.`,
        received: node.kind,
        fix: { summary: 'remove the steps wired to If it fails' },
      },
    ];
  });
}

interface Use {
  readonly entry: Entry | undefined;
  readonly reference: PortReference;
}

function usesOf(program: Program, entries: readonly Entry[]): readonly Use[] {
  return [
    ...entries
      .filter((entry) => entry.node.enabled !== false)
      .flatMap((entry) => entryReferences(entry).map((reference) => ({ entry, reference }))),
    ...programLevelReferences(program).map((reference) => ({ entry: undefined, reference })),
  ];
}

function sendNodes(
  entries: readonly Entry[],
  kinds: ErrorExitKinds,
): ReadonlyMap<string, FlowNode> {
  const found = new Map<string, FlowNode>();
  for (const entry of entries) {
    if (entry.kind !== 'node' || !kinds.known(entry.node.kind)) continue;
    if (kinds.mode(entry.node) === 'fire_and_forget') found.set(entry.node.key, entry.node);
  }
  return found;
}

function waitOnlyInSend(
  program: Program,
  entries: readonly Entry[],
  kinds: ErrorExitKinds,
): ErrorExitFinding[] {
  const sending = sendNodes(entries, kinds);
  if (sending.size === 0) return [];
  return usesOf(program, entries).flatMap(({ entry, reference }) => {
    const source = sending.get(reference.from);
    if (source === undefined || !kinds.waitOnly(source.kind).includes(reference.port)) return [];
    return [
      {
        severity: 'error',
        code: 'wait_only_in_send',
        ...subjectOf(entry),
        message: `${source.key} only gives ${reference.port} when it waits for the result, and it is set to send and continue.`,
        received: `${reference.from}.${reference.port}`,
        fix: {
          summary: `switch ${source.key} to wait for the result`,
          action: { action: 'set_run_mode', key: source.key, mode: 'wait_for_result' },
        },
      },
    ];
  });
}

export function errorExitFindings(program: Program, kinds: ErrorExitKinds): ErrorExitFinding[] {
  const entries = entriesOf(indexProgram(program));
  return [...notFallible(entries, kinds), ...waitOnlyInSend(program, entries, kinds)];
}

export function errorExitKinds(lookup: LintContext['kinds']): ErrorExitKinds {
  const kinds = kindLookupFrom(lookup);
  return {
    known: (kindId) => lookup(kindId) !== undefined,
    fallible: (kindId) => fallibleOf(kindId, kinds),
    mode: (node) => runModeOf(lookup(node.kind), node.policy?.mode),
    waitOnly: (kindId) =>
      (lookup(kindId)?.outputs ?? [])
        .filter((port) => port.waitOnly === true)
        .map((port) => port.name),
  };
}

export const errorExitRule: LintRule = ({ program, ctx }) =>
  errorExitFindings(program, errorExitKinds(ctx.kinds));
