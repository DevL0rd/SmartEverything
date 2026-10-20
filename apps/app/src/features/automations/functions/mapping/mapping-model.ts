import type {
  AutomationFunctionChange,
  AutomationFunctionInterface,
  AutomationFunctionMapping,
  AutomationFunctionUser,
  FlowType,
  PortValue,
} from '@smarteverything/domain';
import { typeText } from '../make-reusable/plain-reference';

export type PickerKind = 'rename' | 'route' | 'value';

export interface PickerOption {
  readonly value: string;
  readonly label: string;
}

export interface Picker {
  readonly kind: PickerKind;
  readonly label: string;
  readonly options: readonly PickerOption[];
  readonly required: boolean;
  readonly fallback: string;
}

export interface MappingEntry {
  readonly key: string;
  readonly change: AutomationFunctionChange;
  readonly sentence: string;
  readonly picker: Picker | null;
}

export interface MappingCard {
  readonly callerId: string;
  readonly callerName: string;
  readonly kind: AutomationFunctionUser['kind'];
  readonly versionLabel: string;
  readonly entries: readonly MappingEntry[];
}

export interface MappingState {
  readonly uniform: boolean;
  readonly answers: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const SHARED = '*';

export const INITIAL_STATE: MappingState = { uniform: true, answers: {} };

export type MappingResult =
  | { readonly ok: true; readonly mapping: AutomationFunctionMapping }
  | { readonly ok: false; readonly issues: readonly string[] };

const DROP_LABEL = 'Nothing, drop it';

function entryKey(change: AutomationFunctionChange): string {
  return `${change.part}:${change.name}`;
}

function typeOf(
  next: AutomationFunctionInterface,
  change: AutomationFunctionChange,
): FlowType | null {
  const list: readonly { readonly name: string; readonly type: FlowType }[] =
    change.part === 'output' ? next.outputs : next.inputs;
  return list.find((port) => port.name === change.name)?.type ?? null;
}

const SENTENCES: Readonly<Record<string, (name: string) => string>> = {
  'input-removed': (name) => `Input ${name} was removed`,
  'input-added-required': (name) => `Input ${name} is new and needs a value`,
  'exit-removed': (name) => `Exit ${name} was removed`,
  'output-removed': (name) => `Output ${name} was removed`,
  'output-made-optional': (name) => `Output ${name} may now be empty`,
  'input-made-required': (name) => `Input ${name} is now required`,
  'input-type-narrowed': (name) => `Input ${name} accepts fewer kinds of value`,
};

const OUTPUT_TYPE_CODES: ReadonlySet<string> = new Set([
  'output-type-widened',
  'output-type-narrowed',
]);

export function sentenceOf(
  change: AutomationFunctionChange,
  next: AutomationFunctionInterface,
): string {
  if (OUTPUT_TYPE_CODES.has(change.code)) {
    const type = typeOf(next, change);
    return type === null
      ? change.reason
      : `Output ${change.name} is now ${typeText(type).toLowerCase()}`;
  }
  return SENTENCES[change.code]?.(change.name) ?? change.reason;
}

function renameOptions(names: readonly string[], label: string): Picker {
  return {
    kind: 'rename',
    label,
    required: false,
    fallback: '',
    options: [
      { value: '', label: DROP_LABEL },
      ...names.map((name) => ({ value: name, label: name })),
    ],
  };
}

function pickerOf(
  change: AutomationFunctionChange,
  next: AutomationFunctionInterface,
): Picker | null {
  if (change.compat !== 'breaking') return null;
  if (change.code === 'input-removed') {
    return renameOptions(
      next.inputs.map((port) => port.name),
      'Use the value of',
    );
  }
  if (change.code === 'output-removed') {
    return renameOptions(
      next.outputs.map((port) => port.name),
      'Read instead',
    );
  }
  if (change.code === 'exit-removed') {
    return {
      kind: 'route',
      label: 'Go to',
      required: true,
      fallback: next.exits[0] ?? '',
      options: next.exits.map((name) => ({ value: name, label: name })),
    };
  }
  if (change.code === 'input-added-required' || change.code === 'input-made-required') {
    return { kind: 'value', label: 'Use the value', required: true, fallback: '', options: [] };
  }
  return null;
}

export function mappingCards(
  changes: readonly AutomationFunctionChange[],
  callers: readonly AutomationFunctionUser[],
  next: AutomationFunctionInterface,
  callersOn: number,
): readonly MappingCard[] {
  const breaking = changes.filter((change) => change.compat === 'breaking');
  const entries = breaking.map((change): MappingEntry => ({
    key: entryKey(change),
    change,
    sentence: sentenceOf(change, next),
    picker: pickerOf(change, next),
  }));
  return callers.map((caller) => ({
    callerId: caller.id,
    callerName: caller.name,
    kind: caller.kind,
    versionLabel: `Now on version ${String(callersOn)}`,
    entries,
  }));
}

export function sharedEntries(cards: readonly MappingCard[]): readonly MappingEntry[] {
  return cards[0]?.entries ?? [];
}

export function answerFor(state: MappingState, callerId: string, entry: MappingEntry): string {
  const owner = state.uniform ? SHARED : callerId;
  return state.answers[owner]?.[entry.key] ?? entry.picker?.fallback ?? '';
}

export function setAnswer(
  state: MappingState,
  callerId: string,
  entry: MappingEntry,
  answer: string,
): MappingState {
  const owner = state.uniform ? SHARED : callerId;
  return {
    ...state,
    answers: { ...state.answers, [owner]: { ...state.answers[owner], [entry.key]: answer } },
  };
}

export function setUniform(
  state: MappingState,
  uniform: boolean,
  cards: readonly MappingCard[],
): MappingState {
  if (uniform === state.uniform) return state;
  if (uniform) {
    const [first] = cards;
    const copied = first === undefined ? {} : (state.answers[first.callerId] ?? {});
    return { uniform: true, answers: { [SHARED]: copied } };
  }
  const shared = state.answers[SHARED] ?? {};
  return {
    uniform: false,
    answers: Object.fromEntries(cards.map((card) => [card.callerId, shared])),
  };
}

function valueOf(text: string, type: FlowType | null): PortValue | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (type?.t === 'number') {
    const number = Number(trimmed);
    return Number.isFinite(number) ? { lit: number } : null;
  }
  if (type?.t === 'boolean') {
    return trimmed === 'true' || trimmed === 'false' ? { lit: trimmed === 'true' } : null;
  }
  return { lit: text };
}

interface Collected {
  readonly inputs: Map<string, string>;
  readonly outputs: Map<string, string>;
  readonly exits: Map<string, string>;
  readonly inputValues: Map<string, PortValue>;
  readonly issues: string[];
}

function collectRoute(entry: MappingEntry, answer: string, into: Collected): void {
  if (answer === '') into.issues.push(`${entry.sentence}. Choose where it continues.`);
  else into.exits.set(entry.change.name, answer);
}

function collectValue(
  entry: MappingEntry,
  answer: string,
  next: AutomationFunctionInterface,
  into: Collected,
): void {
  const value = valueOf(answer, typeOf(next, entry.change));
  if (value === null) into.issues.push(`${entry.sentence}. Enter a value.`);
  else into.inputValues.set(entry.change.name, value);
}

function collect(
  entry: MappingEntry,
  answer: string,
  next: AutomationFunctionInterface,
  into: Collected,
): void {
  const kind = entry.picker?.kind;
  if (kind === 'route') collectRoute(entry, answer, into);
  else if (kind === 'value') collectValue(entry, answer, next, into);
  else if (kind === 'rename' && answer !== '') {
    (entry.change.part === 'output' ? into.outputs : into.inputs).set(entry.change.name, answer);
  }
}

function disagreement(
  state: MappingState,
  cards: readonly MappingCard[],
  entry: MappingEntry,
): boolean {
  if (state.uniform) return false;
  const answers = new Set(cards.map((card) => answerFor(state, card.callerId, entry)));
  return answers.size > 1;
}

function section<T>(map: Map<string, T>): Record<string, T> | undefined {
  return map.size === 0 ? undefined : Object.fromEntries(map);
}

function withPart<K extends keyof AutomationFunctionMapping>(
  key: K,
  value: AutomationFunctionMapping[K],
): AutomationFunctionMapping {
  return value === undefined ? {} : { [key]: value };
}

export function toMapping(
  state: MappingState,
  cards: readonly MappingCard[],
  next: AutomationFunctionInterface,
): MappingResult {
  const into: Collected = {
    inputs: new Map(),
    outputs: new Map(),
    exits: new Map(),
    inputValues: new Map(),
    issues: [],
  };
  const callerId = cards[0]?.callerId ?? SHARED;
  for (const entry of sharedEntries(cards).filter((item) => item.picker !== null)) {
    if (disagreement(state, cards, entry)) {
      into.issues.push(
        `${entry.sentence}: callers have different answers, but one update gives every caller the same mapping.`,
      );
    } else {
      collect(entry, answerFor(state, callerId, entry), next, into);
    }
  }
  if (into.issues.length > 0) return { ok: false, issues: into.issues };
  return {
    ok: true,
    mapping: {
      ...withPart('inputs', section(into.inputs)),
      ...withPart('outputs', section(into.outputs)),
      ...withPart('inputValues', section(into.inputValues)),
      ...withPart('exits', section(into.exits)),
    },
  };
}
