import type { FlowNode, NodeKind } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import type { NodeInput, PatchOp, ScopeInput } from '@smarteverything/flow/ops/schema';
import { lit } from '../templates/build';
import type { InsertPoint } from '../canvas/contract';
import type { PaletteChoice } from '../../editor/palette/palette-categories';
import {
  pasteOps,
  entriesOfNodes,
  payloadOf,
  type ClipboardEntry,
  type PasteTarget,
} from './clipboard';

export const DEVICE_SET_KIND = 'device.set';
export const FUNCTION_CALL_KIND = 'fn.call';

export interface InsertEnv {
  readonly kind: (id: string) => NodeKind | undefined;
  readonly snippet: (id: string) => readonly FlowNode[] | undefined;
}

export type InsertOutcome =
  | { readonly t: 'ops'; readonly ops: readonly PatchOp[] }
  | { readonly t: 'reusable' }
  | { readonly t: 'refused'; readonly reason: string };

const emptyScope = (): ScopeInput => ({ nodes: [] });

function refused(reason: string): InsertOutcome {
  return { t: 'refused', reason };
}

function scopeNames(kind: NodeKind): readonly string[] {
  const shape = kind.scopes;
  if (shape === undefined) return [];
  const count = shape.minimum ?? 0;
  const numbered = Array.from({ length: count }, (_, index) => `branch${String(index + 1)}`);
  return [...shape.required, ...numbered];
}

function starterRows(kind: NodeKind): Pick<NodeInput, 'branches' | 'cases'> {
  if (kind.id === 'flow.if') return { branches: [{ when: lit(true), scope: emptyScope() }] };
  if (kind.id === 'flow.switch') return { cases: [] };
  return {};
}

export function starterNode(kind: NodeKind, ports?: NodeInput['ports']): NodeInput {
  const names = scopeNames(kind);
  return {
    kind: kind.id,
    ...(ports === undefined ? {} : { ports }),
    ...(names.length === 0
      ? {}
      : { scopes: Object.fromEntries(names.map((name) => [name, emptyScope()])) }),
    ...starterRows(kind),
  };
}

function entryOf(kind: NodeKind, node: NodeInput): ClipboardEntry {
  return { trigger: kind.class === 'trigger', node };
}

function targetOf(point: InsertPoint): PasteTarget {
  return { in: point.scope, index: point.index };
}

function opsFor(
  entries: readonly ClipboardEntry[],
  program: Program,
  point: InsertPoint,
): InsertOutcome {
  return { t: 'ops', ops: pasteOps(payloadOf(entries), program, targetOf(point)).ops };
}

interface Step {
  readonly kindId: string;
  readonly ports?: NodeInput['ports'];
}

function single(env: InsertEnv, step: Step, program: Program, point: InsertPoint): InsertOutcome {
  const kind = env.kind(step.kindId);
  if (kind === undefined) return refused(`There is no step kind "${step.kindId}".`);
  return opsFor([entryOf(kind, starterNode(kind, step.ports))], program, point);
}

function snippetOps(
  env: InsertEnv,
  snippetId: string,
  program: Program,
  point: InsertPoint,
): InsertOutcome {
  const nodes = env.snippet(snippetId);
  if (nodes === undefined) return refused(`There is no snippet "${snippetId}".`);
  if (nodes.length === 0) return refused('That snippet has no steps.');
  return opsFor(entriesOfNodes(nodes), program, point);
}

export function insertOps(
  choice: PaletteChoice,
  point: InsertPoint,
  program: Program,
  env: InsertEnv,
): InsertOutcome {
  switch (choice.source) {
    case 'node':
      return single(env, { kindId: choice.kindId }, program, point);
    case 'preset':
      return single(
        env,
        { kindId: DEVICE_SET_KIND, ports: { control: lit(choice.control) } },
        program,
        point,
      );
    case 'trigger-preset':
      return single(
        env,
        {
          kindId: choice.kindId,
          ports: Object.fromEntries(
            Object.entries(choice.ports).map(([name, value]) => [name, lit(value)]),
          ),
        },
        program,
        point,
      );
    case 'function':
      return single(
        env,
        { kindId: FUNCTION_CALL_KIND, ports: { fn: lit(choice.functionId) } },
        program,
        point,
      );
    case 'snippet':
      return snippetOps(env, choice.snippetId, program, point);
    case 'new-reusable':
      return { t: 'reusable' };
  }
}
