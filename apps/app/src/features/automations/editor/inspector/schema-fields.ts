import type {
  FlowType,
  InputPortDecl,
  JsonValue,
  OptionSourceId,
  PortEditorId,
  PortUi,
  PortValue,
} from '@smarteverything/domain';
import { outputLabel } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import type { Schema } from '../../../../components/schema-values';

interface ChoiceOption {
  readonly id: string;
  readonly label: string;
}

export type FieldControl =
  | { readonly t: 'switch' }
  | {
      readonly t: 'number';
      readonly integer: boolean;
      readonly min: number | undefined;
      readonly max: number | undefined;
      readonly step: number;
      readonly unit: string | undefined;
    }
  | { readonly t: 'text' }
  | { readonly t: 'choice'; readonly options: readonly ChoiceOption[] }
  | { readonly t: 'duration' }
  | { readonly t: 'moment'; readonly of: 'instant' | 'timeOfDay' | 'date' }
  | { readonly t: 'reference'; readonly of: string; readonly capabilities: readonly string[] }
  | { readonly t: 'entity'; readonly of: string }
  | { readonly t: 'colour' }
  | { readonly t: 'list'; readonly item: FieldControl }
  | { readonly t: 'record'; readonly fields: readonly RecordField[] }
  | { readonly t: 'entries'; readonly item: FieldControl }
  | { readonly t: 'json' }
  | { readonly t: 'wire' }
  | {
      readonly t: 'pick';
      readonly source: OptionSourceId;
      readonly multiple: boolean;
      readonly typedBy?: string;
    }
  | { readonly t: 'editor'; readonly id: PortEditorId; readonly base: FieldControl }
  | { readonly t: 'typedBy'; readonly port: string; readonly base: FieldControl };

interface RecordField {
  readonly name: string;
  readonly title: string;
  readonly control: FieldControl;
  readonly optional: boolean;
}

export interface Field {
  readonly name: string;
  readonly title: string;
  readonly helper: string;
  readonly required: boolean;
  readonly isStatic: boolean;
  readonly isLive: boolean;
  readonly fallback: JsonValue | undefined;
  readonly control: FieldControl;
}

export type FormControlKind = 'switch' | 'number' | 'text';

const DEFAULT_STEP = 1;

function numberControl(
  type: Extract<FlowType, { t: 'number' }>,
  ui: PortUi | undefined,
): FieldControl {
  return {
    t: 'number',
    integer: type.integer === true,
    min: ui?.min ?? type.min,
    max: ui?.max ?? type.max,
    step: ui?.step ?? DEFAULT_STEP,
    unit: ui?.unit ?? type.unit,
  };
}

function recordControl(type: Extract<FlowType, { t: 'record' }>): FieldControl {
  const fields = Object.entries(type.fields ?? {}).map(([name, member]): RecordField => {
    const optional = member.t === 'optional';
    return { name, title: outputLabel(name), control: controlOf(member), optional };
  });
  if (fields.length > 0) return { t: 'record', fields };
  return { t: 'entries', item: type.values === undefined ? { t: 'json' } : controlOf(type.values) };
}

type FixedTag =
  'boolean' | 'duration' | 'instant' | 'timeOfDay' | 'date' | 'color' | 'error' | 'any' | 'param';

const FIXED_CONTROLS: Readonly<Record<FixedTag, FieldControl>> = {
  boolean: { t: 'switch' },
  duration: { t: 'duration' },
  instant: { t: 'moment', of: 'instant' },
  timeOfDay: { t: 'moment', of: 'timeOfDay' },
  date: { t: 'moment', of: 'date' },
  color: { t: 'colour' },
  error: { t: 'wire' },
  any: { t: 'json' },
  param: { t: 'json' },
};

type ScalarType = Exclude<FlowType, { t: 'list' | 'optional' | 'record' }>;

function scalarControl(type: ScalarType, ui: PortUi | undefined): FieldControl {
  if (type.t === 'number') return numberControl(type, ui);
  if (type.t === 'text') return { t: 'text' };
  if (type.t === 'choice') return { t: 'choice', options: ui?.options ?? type.options };
  if (type.t === 'entity') return { t: 'entity', of: type.of };
  if (type.t === 'ref') {
    return { t: 'reference', of: type.of, capabilities: type.capabilities ?? [] };
  }
  return FIXED_CONTROLS[type.t];
}

function plainControl(type: FlowType, ui: PortUi | undefined): FieldControl {
  if (type.t === 'list') return { t: 'list', item: plainControl(type.of, ui) };
  if (type.t === 'optional') return plainControl(type.of, ui);
  if (type.t === 'record') return recordControl(type);
  return scalarControl(type, ui);
}

function innerOf(type: FlowType): FlowType {
  return type.t === 'optional' ? innerOf(type.of) : type;
}

function itemOf(type: FlowType): FlowType {
  const inner = innerOf(type);
  return inner.t === 'list' ? innerOf(inner.of) : inner;
}

function picksText(type: FlowType): boolean {
  return itemOf(type).t === 'text';
}

function isGenericType(type: FlowType): boolean {
  const item = itemOf(type);
  return item.t === 'any' || item.t === 'param';
}

function annotatedControl(type: FlowType, ui: PortUi): FieldControl | undefined {
  if (ui.editor !== undefined) return { t: 'editor', id: ui.editor, base: plainControl(type, ui) };
  if (ui.optionsFrom !== undefined && picksText(type)) {
    const multiple = ui.multiple === true || innerOf(type).t === 'list';
    const typedBy = ui.typedBy === undefined ? {} : { typedBy: ui.typedBy };
    return { t: 'pick', source: ui.optionsFrom, multiple, ...typedBy };
  }
  if (ui.typedBy !== undefined && isGenericType(type)) {
    return { t: 'typedBy', port: ui.typedBy, base: plainControl(type, ui) };
  }
  return undefined;
}

export function controlOf(type: FlowType, ui?: PortUi): FieldControl {
  return (ui === undefined ? undefined : annotatedControl(type, ui)) ?? plainControl(type, ui);
}

export function fieldOf(decl: InputPortDecl): Field {
  return {
    name: decl.name,
    title: decl.ui?.label ?? outputLabel(decl.name),
    helper: decl.description,
    required: decl.required,
    isStatic: decl.static === true,
    isLive: decl.live === true,
    fallback: decl.default,
    control: controlOf(decl.type, decl.ui),
  };
}

export function fieldsOf(inputs: readonly InputPortDecl[]): readonly Field[] {
  return inputs.map(fieldOf);
}

export function isTextOnly(control: FieldControl): boolean {
  if (control.t === 'editor' || control.t === 'typedBy') return isTextOnly(control.base);
  return control.t === 'json' || control.t === 'entries';
}

export function formKind(field: Field): FormControlKind | null {
  const { control } = field;
  if (control.t === 'switch') return 'switch';
  if (control.t === 'number') return 'number';
  if (control.t === 'text') return 'text';
  return null;
}

export function formFields(fields: readonly Field[]): readonly Field[] {
  return fields.filter((field) => field.isStatic && formKind(field) !== null);
}

function bound(name: string, value: number | undefined): Schema {
  return value === undefined ? {} : { [name]: value };
}

function schemaFor(field: Field): Schema {
  const base = { title: field.title, description: field.helper };
  const { control } = field;
  if (control.t === 'switch') return { ...base, type: 'boolean' };
  if (control.t === 'number') {
    return {
      ...base,
      type: control.integer ? 'integer' : 'number',
      ...bound('minimum', control.min),
      ...bound('maximum', control.max),
    };
  }
  return { ...base, type: 'string' };
}

export function formSchema(fields: readonly Field[]): Schema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      formFields(fields).map((field) => [field.name, schemaFor(field)]),
    ),
  };
}

export function formValues(
  fields: readonly Field[],
  ports: Readonly<Record<string, PortValue>> | undefined,
): Schema {
  const entries = formFields(fields).flatMap((field): [string, JsonValue][] => {
    const given = ports?.[field.name];
    if (given !== undefined && 'lit' in given) return [[field.name, given.lit]];
    return field.fallback === undefined ? [] : [[field.name, field.fallback]];
  });
  return Object.fromEntries(entries);
}

export function conforms(field: Field, value: JsonValue): boolean {
  const kind = formKind(field);
  if (kind === 'switch') return typeof value === 'boolean';
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  return kind === 'text' && typeof value === 'string';
}

function same(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formOps(
  key: string,
  fields: readonly Field[],
  previous: Schema,
  next: Schema,
): readonly PatchOp[] {
  const sets: Record<string, PortValue> = {};
  const clears: string[] = [];
  for (const field of formFields(fields)) {
    const before = previous[field.name];
    const after = next[field.name];
    if (same(before, after)) continue;
    if (after === undefined) clears.push(field.name);
    else if (conforms(field, after)) sets[field.name] = { lit: after };
  }
  const ops: PatchOp[] = [];
  if (Object.keys(sets).length > 0) ops.push({ op: 'set', key, ports: sets });
  if (clears.length > 0) ops.push({ op: 'unset', key, ports: clears });
  return ops;
}
