import type { JsonValue, PortEditorId, SignalTest } from '@smarteverything/domain';
import { IDENT_PATTERN, SIGNAL_TEST, isReservedWord } from '@smarteverything/domain';
import type { ControlValueSpec } from './control-model';

export type JsonObject = Readonly<Record<string, JsonValue>>;

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export type CompositeEditorId = Extract<
  PortEditorId,
  'condition' | 'key-value-rows' | 'field-rows' | 'lookup-table' | 'state-list'
>;

const COMPOSITE_EDITORS: ReadonlySet<string> = new Set([
  'condition',
  'key-value-rows',
  'field-rows',
  'lookup-table',
  'state-list',
]);

export function isCompositeEditor(id: PortEditorId): id is CompositeEditorId {
  return COMPOSITE_EDITORS.has(id);
}

export function freshName(taken: readonly string[], base: string): string {
  const used = new Set(taken);
  let count = 1;
  while (used.has(`${base}${String(count)}`)) count += 1;
  return `${base}${String(count)}`;
}

export type NameRule = 'any' | 'ident';

export const NAME_MISSING = 'Give it a name.';
export const NAME_TAKEN = 'Another row already has this name.';
export const NAME_NOT_IDENT = 'Start with a lowercase letter, then use letters, digits or _.';

export function nameProblem(
  taken: readonly string[],
  name: string,
  wanted: string,
  rule: NameRule,
): string | undefined {
  if (wanted === '') return NAME_MISSING;
  if (wanted !== name && taken.includes(wanted)) return NAME_TAKEN;
  if (rule === 'ident' && (!IDENT_PATTERN.test(wanted) || isReservedWord(wanted))) {
    return NAME_NOT_IDENT;
  }
  return undefined;
}

export function objectOf(value: JsonValue | undefined): JsonObject {
  return isObject(value) ? value : {};
}

export function withEntry(held: JsonObject, name: string, value: JsonValue): JsonObject {
  return { ...held, [name]: value };
}

export function withoutEntry(held: JsonObject, name: string): JsonObject {
  return Object.fromEntries(Object.entries(held).filter(([key]) => key !== name));
}

export function renamedEntry(held: JsonObject, from: string, to: string): JsonObject {
  if (to === '' || to === from || Object.hasOwn(held, to)) return held;
  return Object.fromEntries(
    Object.entries(held).map(([key, value]) => [key === from ? to : key, value]),
  );
}

export function addedEntry(held: JsonObject, base: string, start: JsonValue): JsonObject {
  return withEntry(held, freshName(Object.keys(held), base), start);
}

export type Operator = SignalTest['is'];

export const OPERATORS: readonly { readonly value: Operator; readonly label: string }[] = [
  { value: 'changed', label: 'changes' },
  { value: 'eq', label: 'is' },
  { value: 'ne', label: 'is not' },
  { value: 'in', label: 'is one of' },
  { value: 'gt', label: 'is above' },
  { value: 'gte', label: 'is at least' },
  { value: 'lt', label: 'is below' },
  { value: 'lte', label: 'is at most' },
  { value: 'between', label: 'is between' },
];

export type ValueKind = 'number' | 'choice' | 'plain' | 'fixed';

const KIND_OPERATORS: Readonly<Record<ValueKind, readonly Operator[]>> = {
  number: ['changed', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in'],
  choice: ['changed', 'eq', 'ne', 'in'],
  fixed: ['changed', 'eq', 'ne'],
  plain: ['changed', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in'],
};

export function operatorsFor(
  kind: ValueKind,
): readonly { readonly value: Operator; readonly label: string }[] {
  const allowed = KIND_OPERATORS[kind];
  return OPERATORS.filter((operator) => allowed.includes(operator.value));
}

export function conditionOf(value: JsonValue | undefined): SignalTest | null {
  const parsed = SIGNAL_TEST.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function firstValue(test: SignalTest | null): JsonValue | undefined {
  if (test === null || test.is === 'changed') return undefined;
  if (test.is === 'between') return test.min;
  if (test.is === 'in') return test.to[0];
  return test.to;
}

function numberOr(value: JsonValue | undefined, start: number): number {
  return typeof value === 'number' ? value : start;
}

type NumberOperator = Extract<Operator, 'gt' | 'gte' | 'lt' | 'lte'>;

const NUMBER_OPERATORS: ReadonlySet<Operator> = new Set(['gt', 'gte', 'lt', 'lte']);

function isNumberOperator(operator: Operator): operator is NumberOperator {
  return NUMBER_OPERATORS.has(operator);
}

function betweenFrom(current: SignalTest | null, held: number): SignalTest {
  const max = current?.is === 'between' ? current.max : held;
  return { is: 'between', min: held, max: Math.max(held, max) };
}

export function withOperator(
  current: SignalTest | null,
  operator: Operator,
  start: JsonValue,
): SignalTest {
  const held = firstValue(current) ?? start;
  const heldNumber = numberOr(held, numberOr(start, 0));
  if (isNumberOperator(operator)) return { is: operator, to: heldNumber };
  if (operator === 'between') return betweenFrom(current, heldNumber);
  if (operator === 'in') return { is: 'in', to: current?.is === 'in' ? current.to : [held] };
  return operator === 'changed' ? { is: 'changed' } : { is: operator, to: held };
}

export function withBound(
  test: Extract<SignalTest, { is: 'between' }>,
  bound: 'min' | 'max',
  value: number,
): SignalTest {
  if (bound === 'min') return { is: 'between', min: value, max: Math.max(value, test.max) };
  return { is: 'between', min: Math.min(value, test.min), max: value };
}

export function withListed(
  test: Extract<SignalTest, { is: 'in' }>,
  at: number,
  value: JsonValue | null,
): SignalTest {
  const listed =
    value === null
      ? test.to.filter((_held, index) => index !== at)
      : test.to.map((held, index) => (index === at ? value : held));
  return listed.length === 0 ? test : { is: 'in', to: listed };
}

export function withAdded(test: Extract<SignalTest, { is: 'in' }>, value: JsonValue): SignalTest {
  return { is: 'in', to: [...test.to, value] };
}

export type CellKind = 'text' | 'number' | 'flag' | 'mixed';

export const CELL_KINDS: readonly {
  readonly value: Exclude<CellKind, 'mixed'>;
  readonly label: string;
}[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'flag', label: 'On or off' },
];

function kindOfCell(value: JsonValue): CellKind {
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  return typeof value === 'boolean' ? 'flag' : 'mixed';
}

export function cellKindOf(cells: readonly JsonValue[]): CellKind {
  const kinds = new Set(cells.map(kindOfCell));
  const [only] = kinds;
  return kinds.size === 1 && only !== undefined ? only : kinds.size === 0 ? 'text' : 'mixed';
}

export function cellAs(value: JsonValue, kind: Exclude<CellKind, 'mixed'>): JsonValue {
  if (kind === 'text') return typeof value === 'string' ? value : JSON.stringify(value);
  if (kind === 'flag') return value === true || value === 'true';
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function cellStart(kind: CellKind): JsonValue {
  if (kind === 'number') return 0;
  if (kind === 'flag') return false;
  return '';
}

export interface LookupRow {
  readonly key: JsonValue;
  readonly value: JsonValue;
}

export type Column = 'key' | 'value';

export function lookupRowsOf(value: JsonValue | undefined): readonly LookupRow[] {
  if (!isList(value)) return [];
  return value
    .filter(isObject)
    .map((row) => ({ key: row['key'] ?? '', value: row['value'] ?? '' }));
}

export function tableOf(rows: readonly LookupRow[]): JsonValue {
  return rows.map((row) => ({ key: row.key, value: row.value }));
}

export function withCell(
  rows: readonly LookupRow[],
  at: number,
  column: Column,
  value: JsonValue,
): readonly LookupRow[] {
  return rows.map((row, index) => (index === at ? { ...row, [column]: value } : row));
}

export function withColumnKind(
  rows: readonly LookupRow[],
  column: Column,
  kind: Exclude<CellKind, 'mixed'>,
): readonly LookupRow[] {
  return rows.map((row) => ({ ...row, [column]: cellAs(row[column], kind) }));
}

export function textsOf(value: JsonValue | undefined): readonly string[] {
  return isList(value) ? value.filter((item) => typeof item === 'string') : [];
}

export const ANY_STATE = '*';

export interface StateChoice {
  readonly value: string;
  readonly label: string;
}

export function stateChoices(
  states: readonly string[],
  held: string | undefined,
  withAny: boolean,
): readonly StateChoice[] {
  const known = states
    .filter((state) => state !== '')
    .map((state) => ({ value: state, label: state }));
  const any = withAny ? [{ value: ANY_STATE, label: 'Any state' }] : [];
  const missing =
    held !== undefined && held !== '' && held !== ANY_STATE && !states.includes(held)
      ? [{ value: held, label: `${held} (not in the states)` }]
      : [];
  return [...any, ...known, ...missing];
}

export type StateListShape = 'states' | 'initial' | 'transitions';

export interface Transition {
  readonly from: string;
  readonly event: string;
  readonly to: string;
  readonly rest: JsonObject;
}

function textOf(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function transitionsOf(value: JsonValue | undefined): readonly Transition[] {
  if (!isList(value)) return [];
  return value.filter(isObject).map((row) => {
    const { from, event, to, ...rest } = row;
    return { from: textOf(from), event: textOf(event), to: textOf(to), rest };
  });
}

export function transitionsValue(rows: readonly Transition[]): JsonValue {
  return rows.map((row) => ({ ...row.rest, from: row.from, event: row.event, to: row.to }));
}

export function addedTransition(
  rows: readonly Transition[],
  states: readonly string[],
): readonly Transition[] {
  const first = states[0] ?? '';
  return [...rows, { from: ANY_STATE, event: '', to: first, rest: {} }];
}

export function renamedState(states: readonly string[], at: number, to: string): readonly string[] {
  if (to === '' || states.includes(to)) return states;
  return states.map((state, index) => (index === at ? to : state));
}

export function stateProblem(
  states: readonly string[],
  at: number,
  wanted: string,
): string | undefined {
  if (wanted === '') return NAME_MISSING;
  if (wanted === ANY_STATE) return 'The * sign means any state; pick another name.';
  return states.some((state, index) => index !== at && state === wanted) ? NAME_TAKEN : undefined;
}

export function valueKindOfSpec(spec: ControlValueSpec | null): ValueKind {
  if (spec === null) return 'plain';
  if (spec.t === 'number') return 'number';
  return spec.t === 'choice' ? 'choice' : 'fixed';
}

export function specStart(spec: ControlValueSpec | null): JsonValue {
  if (spec === null) return 0;
  switch (spec.t) {
    case 'number':
      return spec.min;
    case 'choice':
      return spec.options[0]?.id ?? '';
    case 'switch':
      return true;
    case 'colour':
      return { hue: 0, saturation: 0, value: 100 };
    case 'text':
    case 'action':
      return '';
  }
}

type SingleTest = Exclude<SignalTest, { is: 'changed' | 'in' | 'between' }>;

export function withSingle(test: SingleTest, value: JsonValue): SignalTest | null {
  if (test.is === 'eq' || test.is === 'ne') return { is: test.is, to: value };
  return typeof value === 'number' ? { is: test.is, to: value } : null;
}

export function withTransition(
  rows: readonly Transition[],
  at: number,
  change: Partial<Transition> | null,
): readonly Transition[] {
  if (change === null) return rows.filter((_row, index) => index !== at);
  return rows.map((row, index) => (index === at ? { ...row, ...change } : row));
}
