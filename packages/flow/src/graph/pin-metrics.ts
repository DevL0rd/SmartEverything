import {
  FLOW_SCOPE_OUTPUTS,
  type NodeKindLookup,
  type PortValue,
  type ProgramV4,
  type StructuredOutput,
} from '@smarteverything/domain';

export const VALUE_ROW_H = 32;

export const GROUP_HEADING_H = 26;

export const VALUE_HEAD_H = 52;

export interface PinSubject {
  readonly kind: string;
  readonly ports?: Readonly<Record<string, PortValue>> | undefined;
  readonly outputs?: readonly StructuredOutput[] | undefined;
}

export type ReferencedOutputs = ReadonlyMap<string, ReadonlySet<string>>;

const NONE: ReadonlySet<string> = new Set();

function inputRows(subject: PinSubject, kinds: NodeKindLookup): number {
  const declared = kinds.get(subject.kind)?.inputs ?? [];
  const ports = subject.ports ?? {};
  const shown = declared.filter((decl) => ports[decl.name] !== undefined || decl.required);
  const extra = Object.keys(ports).filter((name) => !declared.some((decl) => decl.name === name));
  return shown.length + extra.length;
}

function outputGroups(subject: PinSubject, kinds: NodeKindLookup): readonly (readonly string[])[] {
  const own = (kinds.get(subject.kind)?.outputs ?? []).map((decl) => decl.name);
  const inside = (FLOW_SCOPE_OUTPUTS[subject.kind] ?? []).map((decl) => decl.name);
  const after = (subject.outputs ?? []).map((out) => out.name);
  const seen = new Set(own);
  const fresh = (names: readonly string[]): readonly string[] =>
    names.filter((name) => {
      const repeated = seen.has(name);
      seen.add(name);
      return !repeated;
    });
  return [own, fresh(inside), fresh(after)];
}

function rowsHeight(rows: number, headings: number): number {
  return rows * VALUE_ROW_H + headings * GROUP_HEADING_H;
}

export interface OutputRows {
  readonly headings: number;
  readonly shown: number;
  readonly more: number;
}

export function outputRows(
  subject: PinSubject,
  referenced: ReadonlySet<string>,
  kinds: NodeKindLookup,
): OutputRows {
  const [own = [], inside = [], after = []] = outputGroups(subject, kinds);
  const wired = (names: readonly string[]): number =>
    names.filter((name) => referenced.has(name)).length;
  const groups = [wired(own), wired(inside), wired(after)];
  const shown = groups.reduce((sum, count) => sum + count, 0);
  const all = own.length + inside.length + after.length;
  return {
    headings: groups.slice(1).filter((count) => count > 0).length,
    shown,
    more: all > shown ? 1 : 0,
  };
}

export function pinRowsHeight(
  subject: PinSubject,
  referenced: ReadonlySet<string>,
  kinds: NodeKindLookup,
): number {
  const rows = outputRows(subject, referenced, kinds);
  return rowsHeight(inputRows(subject, kinds) + rows.shown + rows.more, rows.headings);
}

export function valueCardHeight(
  subject: PinSubject,
  referenced: ReadonlySet<string>,
  kinds: NodeKindLookup,
): number {
  const rows = outputRows(subject, referenced, kinds);
  return VALUE_HEAD_H + (Math.max(inputRows(subject, kinds), rows.shown) + rows.more) * VALUE_ROW_H;
}

export function startRowsHeight(program: ProgramV4): number {
  const admit = program.kind === 'automation' ? 1 : 0;
  const inputs = program.inputs.length;
  return rowsHeight(admit + inputs, inputs > 0 ? 1 : 0);
}

function wiresIn(program: ProgramV4): readonly PortValue[] {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  const admit = program.kind === 'automation' && program.admit !== undefined ? [program.admit] : [];
  return [
    ...admit,
    ...triggers.flatMap((trigger) => Object.values(trigger.ports)),
    ...program.nodes.flatMap((node) => [
      ...Object.values(node.ports ?? {}),
      ...(node.branches ?? []).map((row) => row.when),
    ]),
  ];
}

export function referencedOutputs(program: ProgramV4): ReferencedOutputs {
  const found = new Map<string, Set<string>>();
  for (const value of wiresIn(program)) {
    if (!('wire' in value)) continue;
    const ports = found.get(value.wire.from) ?? new Set<string>();
    ports.add(value.wire.port);
    found.set(value.wire.from, ports);
  }
  return found;
}

export function referencedOf(referenced: ReferencedOutputs, key: string): ReadonlySet<string> {
  return referenced.get(key) ?? NONE;
}
