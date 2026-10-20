import type {
  FlowNode,
  JsonValue,
  NodeKind,
  PortValue,
  TriggerNode,
} from '@smarteverything/domain';
import { JSON_VALUE, outputLabel, typeDisplayName } from '@smarteverything/domain';
import { z } from 'zod';
import type { ProgramIndex } from '@smarteverything/flow/program/lookup';
import { referencesOf } from '../../../model/canvas/references';

const RECORD = z.record(z.string(), JSON_VALUE);

export interface OutputRow {
  readonly name: string;
  readonly label: string;
  readonly typeChip: string;
  readonly optional: boolean;
  readonly description: string;
  readonly used: number;
  readonly reference: string;
  readonly preview: string | null;
}

function valuesOf(node: FlowNode | TriggerNode): readonly PortValue[] {
  const ports = Object.values(node.ports ?? {});
  if (!('branches' in node)) return ports;
  const when = (node.branches ?? []).map((row) => row.when);
  const cases = (node.cases ?? []).flatMap((row) => ('when' in row.match ? [row.match.when] : []));
  const lanes = (node.outputs ?? []).flatMap((output) => Object.values(output.values));
  return [...ports, ...when, ...cases, ...lanes];
}

export function usedByCount(index: ProgramIndex, key: string, output: string): number {
  const keys = new Set([key]);
  let count = 0;
  for (const entry of index.byId.values()) {
    if (entry.node.key === key) continue;
    for (const value of valuesOf(entry.node)) {
      if (referencesOf(value, keys).some((found) => found.output === output)) count += 1;
    }
  }
  return count;
}

function previewOf(outputs: JsonValue | undefined, name: string): string | null {
  const record = RECORD.safeParse(outputs);
  if (!record.success) return null;
  const value = record.data[name];
  if (value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function outputRows(
  index: ProgramIndex,
  kind: NodeKind,
  key: string,
  runOutputs: JsonValue | undefined,
): readonly OutputRow[] {
  return kind.outputs.map((decl): OutputRow => ({
    name: decl.name,
    label: outputLabel(decl.name),
    typeChip: typeDisplayName(decl.type),
    optional: decl.optional === true,
    description: decl.description,
    used: usedByCount(index, key, decl.name),
    reference: `${key}.${decl.name}`,
    preview: previewOf(runOutputs, decl.name),
  }));
}
