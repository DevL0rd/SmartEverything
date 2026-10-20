import type {
  FlowType,
  InputPortDecl,
  JsonValue,
  PortUi,
  PortValue,
} from '@smarteverything/domain';
import { outputLabel } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
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
  | { readonly t: 'colour' }
  | { readonly t: 'list'; readonly item: FieldControl }
  | { readonly t: 'record'; readonly fields: readonly RecordField[] }
  | { readonly t: 'json' }
  | { readonly t: 'wire' };

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
  return fields.length === 0 ? { t: 'json' } : { t: 'record', fields };
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
  if (type.t === 'ref') {
    return { t: 'reference', of: type.of, capabilities: type.capabilities ?? [] };
  }
  return FIXED_CONTROLS[type.t];
}

export function controlOf(type: FlowType, ui?: PortUi): FieldControl {
  if (type.t === 'list') return { t: 'list', item: controlOf(type.of) };
  if (type.t === 'optional') return controlOf(type.of, ui);
  if (type.t === 'record') return recordControl(type);
  return scalarControl(type, ui);
}

export function fieldOf(decl: InputPortDecl): Field {
  return {
    name: decl.name,
    title: outputLabel(decl.name),
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
