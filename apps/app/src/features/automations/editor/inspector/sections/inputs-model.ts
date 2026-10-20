import type { FlowNode, NodeKind, PortValue, TriggerNode } from '@smarteverything/domain';
import { typeDisplayName } from '@smarteverything/domain';
import type { Schema } from '../../../../../components/schema-values';
import type { Field } from '../schema-fields';
import { fieldsOf, formFields, formSchema, formValues } from '../schema-fields';

const OWN_SECTION_PORTS: Readonly<Record<string, ReadonlySet<string>>> = {
  'flow.repeat': new Set(['gap', 'limit']),
  'flow.while': new Set(['gap', 'limit']),
  'flow.do_until': new Set(['gap', 'limit']),
  'flow.forever': new Set(['gap', 'limit']),
  'flow.for_each': new Set(['concurrency', 'collect']),
  'flow.switch': new Set(['mode']),
  'flow.parallel': new Set(['join', 'errors']),
  'flow.break': new Set(['target']),
  'flow.continue': new Set(['target']),
  'flow.return': new Set(['exit']),
  'fn.call': new Set(['fn', 'pin']),
};

export interface InputRow {
  readonly field: Field;
  readonly value: PortValue | undefined;
  readonly typeChip: string;
}

export interface InputsModel {
  readonly rows: readonly InputRow[];
  readonly form: readonly Field[];
  readonly formSchema: Schema;
  readonly formValue: Schema;
}

export function ownedPorts(kind: NodeKind): ReadonlySet<string> {
  return new Set(OWN_SECTION_PORTS[kind.id] ?? []);
}

export function inputsModel(kind: NodeKind, node: FlowNode | TriggerNode): InputsModel {
  const owned = ownedPorts(kind);
  const fields = fieldsOf(kind.inputs).filter((field) => !owned.has(field.name));
  const form = formFields(fields);
  const formNames = new Set(form.map((field) => field.name));
  const rows = fields
    .filter((field) => !formNames.has(field.name))
    .map((field): InputRow => ({
      field,
      value: node.ports?.[field.name],
      typeChip: typeDisplayName(declaredType(kind, field.name)),
    }));
  return {
    rows,
    form,
    formSchema: formSchema(fields),
    formValue: formValues(fields, node.ports),
  };
}

function declaredType(kind: NodeKind, name: string): Parameters<typeof typeDisplayName>[0] {
  const decl = kind.inputs.find((input) => input.name === name);
  return decl === undefined ? { t: 'any' } : decl.type;
}
