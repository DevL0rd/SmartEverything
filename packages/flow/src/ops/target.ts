import type { FlowNode, TriggerNode } from '@smarteverything/domain';
import { formatScopePath, parseScopePath, type ScopePath } from '../program/paths';
import type { Entry, ProgramIndex } from '../program/lookup';
import { findByKey, indexProgram, resolveScope } from '../program/lookup';
import type { Program } from '../program/walk';
import { refuse } from './result';
import { TRIGGERS_TARGET } from './schema';

export type Target =
  | { readonly t: 'triggers'; readonly list: TriggerNode[] }
  | { readonly t: 'scope'; readonly list: FlowNode[]; readonly path: ScopePath };

export interface Placement {
  readonly after?: string | undefined;
  readonly before?: string | undefined;
  readonly index?: number | undefined;
}

export function entryOf(index: ProgramIndex, key: string): Entry {
  return findByKey(index, key) ?? refuse('unknown_key', `there is no node or trigger "${key}"`);
}

function triggerList(program: Program): TriggerNode[] {
  return program.kind === 'automation'
    ? program.triggers
    : refuse('bad_target', 'only an automation has triggers');
}

export function scopeNodes(program: Program, path: ScopePath): FlowNode[] {
  return (
    resolveScope(indexProgram(program), path)?.nodes ??
    refuse('bad_target', `there is no scope "${formatScopePath(path)}"`)
  );
}

export function resolveTarget(program: Program, target: string): Target {
  if (target === TRIGGERS_TARGET) return { t: 'triggers', list: triggerList(program) };
  const path = parseScopePath(target) ?? refuse('bad_target', `"${target}" is not a scope path`);
  return { t: 'scope', list: scopeNodes(program, path), path };
}

export function insertionIndex(
  list: readonly { readonly key: string }[],
  place: Placement,
): number {
  if (place.index !== undefined) {
    if (place.index > list.length) {
      refuse(
        'bad_placement',
        `index ${String(place.index)} is past the end (${String(list.length)})`,
      );
    }
    return place.index;
  }
  const anchor = place.after ?? place.before;
  if (anchor === undefined) return list.length;
  const at = list.findIndex((item) => item.key === anchor);
  if (at < 0)
    refuse('bad_placement', `there is no "${anchor}" in the target list to place next to`);
  return place.after === undefined ? at : at + 1;
}

export function locationOf(entry: Entry): { readonly target: string; readonly index: number } {
  if (entry.kind === 'trigger') return { target: TRIGGERS_TARGET, index: entry.index };
  return { target: formatScopePath(entry.scope), index: entry.index };
}
