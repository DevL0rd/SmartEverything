import { isAssignable } from '@smarteverything/domain';
import type { InputPort, OutputPort } from '@smarteverything/domain';
import type { FunctionInterface } from './interface-hash';
import { canonicalType } from './interface-hash';

export type Compatibility = 'compatible' | 'breaking';

export type ChangePart = 'input' | 'output' | 'exit' | 'flavour';

export type ChangeCode =
  | 'input-added'
  | 'input-added-required'
  | 'input-removed'
  | 'input-type-widened'
  | 'input-type-narrowed'
  | 'input-made-required'
  | 'input-made-optional'
  | 'input-default-changed'
  | 'output-added'
  | 'output-removed'
  | 'output-type-narrowed'
  | 'output-type-widened'
  | 'output-made-optional'
  | 'output-made-required'
  | 'exit-added'
  | 'exit-removed'
  | 'flavour-changed'
  | 'label-changed'
  | 'description-changed';

export interface InterfaceChange {
  readonly part: ChangePart;
  readonly name: string;
  readonly code: ChangeCode;
  readonly compat: Compatibility;
  readonly reason: string;
}

export interface InterfaceClassification {
  readonly result: Compatibility;
  readonly changes: readonly InterfaceChange[];
}

function index<T extends { readonly name: string }>(rows: readonly T[]): ReadonlyMap<string, T> {
  return new Map(rows.map((row) => [row.name, row]));
}

function sameDefault(left: InputPort, right: InputPort): boolean {
  return JSON.stringify(left.default ?? null) === JSON.stringify(right.default ?? null);
}

function textChanges(
  part: 'input' | 'output',
  name: string,
  before: { readonly label?: string | undefined; readonly description?: string | undefined },
  after: { readonly label?: string | undefined; readonly description?: string | undefined },
): readonly InterfaceChange[] {
  const found: InterfaceChange[] = [];
  if (before.label !== after.label) {
    found.push({
      part: part,
      name: name,
      code: 'label-changed',
      compat: 'compatible',
      reason: `The label of ${name} changed.`,
    });
  }
  if (before.description !== after.description) {
    found.push({
      part: part,
      name: name,
      code: 'description-changed',
      compat: 'compatible',
      reason: `The description of ${name} changed.`,
    });
  }
  return found;
}

function inputTypeChange(before: InputPort, after: InputPort): readonly InterfaceChange[] {
  const name = after.name;
  if (canonicalType(before.type) === canonicalType(after.type)) return [];
  return [
    isAssignable(before.type, after.type)
      ? {
          part: 'input',
          name,
          code: 'input-type-widened',
          compat: 'compatible',
          reason: `Input ${name} accepts more types now.`,
        }
      : {
          part: 'input',
          name,
          code: 'input-type-narrowed',
          compat: 'breaking',
          reason: `Input ${name} changed type and no longer accepts what callers give it.`,
        },
  ];
}

function inputPairChanges(before: InputPort, after: InputPort): readonly InterfaceChange[] {
  const name = after.name;
  const found: InterfaceChange[] = [...inputTypeChange(before, after)];
  if (!before.required && after.required) {
    found.push({
      part: 'input',
      name,
      code: 'input-made-required',
      compat: 'breaking',
      reason: `Input ${name} became required.`,
    });
  }
  if (before.required && !after.required) {
    found.push({
      part: 'input',
      name,
      code: 'input-made-optional',
      compat: 'compatible',
      reason: `Input ${name} became optional.`,
    });
  }
  if (!sameDefault(before, after)) {
    found.push({
      part: 'input',
      name,
      code: 'input-default-changed',
      compat: 'compatible',
      reason: `The default of input ${name} changed.`,
    });
  }
  return [...found, ...textChanges('input', name, before, after)];
}

function inputChanges(
  before: readonly InputPort[],
  after: readonly InputPort[],
): readonly InterfaceChange[] {
  const previous = index(before);
  const next = index(after);
  const found: InterfaceChange[] = [];
  for (const input of before) {
    const kept = next.get(input.name);
    if (kept === undefined) {
      found.push({
        part: 'input',
        name: input.name,
        code: 'input-removed',
        compat: 'breaking',
        reason: `Input ${input.name} was removed.`,
      });
    } else {
      found.push(...inputPairChanges(input, kept));
    }
  }
  for (const input of after) {
    if (previous.has(input.name)) continue;
    const needsValue = input.required && input.default === undefined;
    found.push(
      needsValue
        ? {
            part: 'input',
            name: input.name,
            code: 'input-added-required',
            compat: 'breaking',
            reason: `Input ${input.name} is new and required without a default.`,
          }
        : {
            part: 'input',
            name: input.name,
            code: 'input-added',
            compat: 'compatible',
            reason: `Input ${input.name} was added and callers can leave it out.`,
          },
    );
  }
  return found;
}

function outputPairChanges(before: OutputPort, after: OutputPort): readonly InterfaceChange[] {
  const name = after.name;
  const found: InterfaceChange[] = [];
  if (canonicalType(before.type) !== canonicalType(after.type)) {
    found.push(
      isAssignable(after.type, before.type)
        ? {
            part: 'output',
            name: name,
            code: 'output-type-narrowed',
            compat: 'compatible',
            reason: `Output ${name} gives a narrower type now.`,
          }
        : {
            part: 'output',
            name: name,
            code: 'output-type-widened',
            compat: 'breaking',
            reason: `Output ${name} changed type and callers may no longer use it.`,
          },
    );
  }
  const wasOptional = before.optional === true;
  const isOptional = after.optional === true;
  if (!wasOptional && isOptional) {
    found.push({
      part: 'output',
      name: name,
      code: 'output-made-optional',
      compat: 'breaking',
      reason: `Output ${name} may now be absent.`,
    });
  }
  if (wasOptional && !isOptional) {
    found.push({
      part: 'output',
      name: name,
      code: 'output-made-required',
      compat: 'compatible',
      reason: `Output ${name} is always given now.`,
    });
  }
  return [...found, ...textChanges('output', name, before, after)];
}

function outputChanges(
  before: readonly OutputPort[],
  after: readonly OutputPort[],
): readonly InterfaceChange[] {
  const previous = index(before);
  const next = index(after);
  const found: InterfaceChange[] = [];
  for (const output of before) {
    const kept = next.get(output.name);
    if (kept === undefined) {
      found.push({
        part: 'output',
        name: output.name,
        code: 'output-removed',
        compat: 'breaking',
        reason: `Output ${output.name} was removed.`,
      });
    } else {
      found.push(...outputPairChanges(output, kept));
    }
  }
  for (const output of after) {
    if (!previous.has(output.name)) {
      found.push({
        part: 'output',
        name: output.name,
        code: 'output-added',
        compat: 'compatible',
        reason: `Output ${output.name} was added.`,
      });
    }
  }
  return found;
}

function exitChanges(
  before: readonly string[],
  after: readonly string[],
): readonly InterfaceChange[] {
  const previous = new Set(before);
  const next = new Set(after);
  return [
    ...before
      .filter((exit) => !next.has(exit))
      .map((exit): InterfaceChange => ({
        part: 'exit',
        name: exit,
        code: 'exit-removed',
        compat: 'breaking',
        reason: `Exit ${exit} was removed.`,
      })),
    ...after
      .filter((exit) => !previous.has(exit))
      .map((exit): InterfaceChange => ({
        part: 'exit',
        name: exit,
        code: 'exit-added',
        compat: 'compatible',
        reason: `Exit ${exit} was added.`,
      })),
  ];
}

function flavourChanges(
  before: FunctionInterface,
  after: FunctionInterface,
): readonly InterfaceChange[] {
  if (before.flavour === undefined || after.flavour === undefined) return [];
  if (before.flavour === after.flavour) return [];
  return [
    {
      part: 'flavour',
      name: after.flavour,
      code: 'flavour-changed',
      compat: 'breaking',
      reason: `It changed from ${before.flavour} to ${after.flavour}.`,
    },
  ];
}

export function classifyInterfaceChange(
  before: FunctionInterface,
  after: FunctionInterface,
): InterfaceClassification {
  const changes = [
    ...flavourChanges(before, after),
    ...inputChanges(before.inputs, after.inputs),
    ...outputChanges(before.outputs, after.outputs),
    ...exitChanges(before.exits, after.exits),
  ];
  const result = changes.some((entry) => entry.compat === 'breaking') ? 'breaking' : 'compatible';
  return { result, changes };
}
