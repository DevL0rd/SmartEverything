import { IDENT, isReservedWord } from '@smarteverything/domain';
import type { FlowType, InputPort, JsonValue, OutputPort } from '@smarteverything/domain';
import { typeText } from '../make-reusable/plain-reference';

export type TypeKey =
  | 'text'
  | 'number'
  | 'boolean'
  | 'duration'
  | 'instant'
  | 'timeOfDay'
  | 'date'
  | 'color'
  | 'any'
  | 'keep';

export type Presence = 'required' | 'optional' | 'default';

export interface PortDraft {
  readonly key: string | null;
  readonly label: string;
  readonly type: TypeKey;
  readonly keptType: FlowType | null;
  readonly presence: Presence;
  readonly defaultText: string;
  readonly description: string;
}

export interface DraftIssues {
  readonly label: string | null;
  readonly defaultValue: string | null;
}

export type DraftResult<T> =
  { readonly ok: true; readonly port: T } | { readonly ok: false; readonly issues: DraftIssues };

export interface TypeOption {
  readonly value: TypeKey;
  readonly label: string;
}

const LEAVES = [
  'text',
  'number',
  'boolean',
  'duration',
  'instant',
  'timeOfDay',
  'date',
  'color',
  'any',
] as const;

const DEFAULTABLE: ReadonlySet<TypeKey> = new Set(['text', 'number', 'boolean']);

export const NO_ISSUES: DraftIssues = { label: null, defaultValue: null };

function leafType(key: Exclude<TypeKey, 'keep'>): FlowType {
  return { t: key };
}

function leafKey(type: FlowType): Exclude<TypeKey, 'keep'> | null {
  if (Object.keys(type).length !== 1) return null;
  return LEAVES.find((leaf) => leaf === type.t) ?? null;
}

function typeKeyOf(type: FlowType): Pick<PortDraft, 'type' | 'keptType'> {
  const leaf = leafKey(type);
  return leaf === null ? { type: 'keep', keptType: type } : { type: leaf, keptType: null };
}

export function typeOptions(draft: PortDraft): readonly TypeOption[] {
  const leaves = LEAVES.map((value) => ({ value, label: typeText(leafType(value)) }));
  return draft.keptType === null
    ? leaves
    : [{ value: 'keep' as const, label: typeText(draft.keptType) }, ...leaves];
}

export function canHaveDefault(type: TypeKey): boolean {
  return DEFAULTABLE.has(type);
}

export function blankDraft(): PortDraft {
  return {
    key: null,
    label: '',
    type: 'text',
    keptType: null,
    presence: 'required',
    defaultText: '',
    description: '',
  };
}

function defaultTextOf(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function draftOfInput(port: InputPort): PortDraft {
  const hasDefault = port.default !== undefined;
  return {
    key: port.name,
    label: port.label ?? port.name,
    ...typeKeyOf(port.type),
    presence: hasDefault ? 'default' : port.required ? 'required' : 'optional',
    defaultText: defaultTextOf(port.default),
    description: port.description ?? '',
  };
}

export function draftOfOutput(port: OutputPort): PortDraft {
  return {
    key: port.name,
    label: port.label ?? port.name,
    ...typeKeyOf(port.type),
    presence: port.optional === true ? 'optional' : 'required',
    defaultText: '',
    description: port.description ?? '',
  };
}

export function identOf(label: string, taken: readonly string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'value';
  const start = /^[a-z]/.test(base) ? base : `v_${base}`;
  let candidate = start;
  for (
    let n = 2;
    taken.includes(candidate) || isReservedWord(candidate) || !IDENT.safeParse(candidate).success;
    n += 1
  ) {
    candidate = `${start}_${String(n)}`;
  }
  return candidate;
}

function typeOfDraft(draft: PortDraft): FlowType {
  if (draft.type === 'keep' && draft.keptType !== null) return draft.keptType;
  return leafType(draft.type === 'keep' ? 'any' : draft.type);
}

function defaultOf(draft: PortDraft): { value: JsonValue | undefined; issue: string | null } {
  if (draft.presence !== 'default') return { value: undefined, issue: null };
  const text = draft.defaultText.trim();
  if (draft.type === 'number') {
    const number = Number(text);
    return text !== '' && Number.isFinite(number)
      ? { value: number, issue: null }
      : { value: undefined, issue: 'Enter a number.' };
  }
  if (draft.type === 'boolean') {
    if (text === 'true' || text === 'false') return { value: text === 'true', issue: null };
    return { value: undefined, issue: 'Choose yes or no.' };
  }
  return text === ''
    ? { value: undefined, issue: 'Enter a default value.' }
    : { value: draft.defaultText, issue: null };
}

function issuesOf(draft: PortDraft, defaultIssue: string | null): DraftIssues {
  return {
    label: draft.label.trim() === '' ? 'Give it a name.' : null,
    defaultValue: defaultIssue,
  };
}

function clean(issues: DraftIssues): boolean {
  return issues.label === null && issues.defaultValue === null;
}

function textFields(draft: PortDraft): { label?: string; description?: string } {
  const label = draft.label.trim();
  const description = draft.description.trim();
  return {
    ...(label === '' ? {} : { label }),
    ...(description === '' ? {} : { description }),
  };
}

export function inputOf(draft: PortDraft, taken: readonly string[]): DraftResult<InputPort> {
  const { value, issue } = defaultOf(draft);
  const issues = issuesOf(draft, issue);
  if (!clean(issues)) return { ok: false, issues };
  return {
    ok: true,
    port: {
      name: draft.key ?? identOf(draft.label, taken),
      type: typeOfDraft(draft),
      required: draft.presence === 'required',
      ...(value === undefined ? {} : { default: value }),
      ...textFields(draft),
    },
  };
}

export function outputOf(draft: PortDraft, taken: readonly string[]): DraftResult<OutputPort> {
  const issues = issuesOf(draft, null);
  if (!clean(issues)) return { ok: false, issues };
  return {
    ok: true,
    port: {
      name: draft.key ?? identOf(draft.label, taken),
      type: typeOfDraft(draft),
      ...(draft.presence === 'optional' ? { optional: true } : {}),
      ...textFields(draft),
    },
  };
}
