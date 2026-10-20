import {
  NODE_CATEGORIES,
  SHIPPED_TIERS,
  typeDisplayName,
  type AutomationFunctionSummary,
  type FlowType,
  type JsonValue,
  type NodeCategoryId,
  type NodeKind,
} from '@smarteverything/domain';
import { compareText } from '../../../../format/text';

export type PaletteSectionId = NodeCategoryId | 'snippets';

export type PaletteChoice =
  | { readonly source: 'node'; readonly kindId: string }
  | { readonly source: 'function'; readonly functionId: string }
  | { readonly source: 'preset'; readonly presetId: string; readonly control: string }
  | {
      readonly source: 'trigger-preset';
      readonly presetId: string;
      readonly kindId: string;
      readonly ports: Readonly<Record<string, JsonValue>>;
    }
  | { readonly source: 'snippet'; readonly snippetId: string }
  | { readonly source: 'new-reusable' };

export interface PaletteEnv {
  readonly isOwner: boolean;
  readonly hasComputer: boolean;
}

export interface PaletteEntry {
  readonly key: string;
  readonly choice: PaletteChoice;
  readonly name: string;
  readonly meaning: string;
  readonly takes: string;
  readonly icon: string;
  readonly section: PaletteSectionId;
  readonly keywords: readonly string[];
  readonly typeWords: readonly string[];
  readonly gives: readonly FlowType[];
  readonly kindId: string | null;
  readonly usageId: string | null;
  readonly trigger: boolean;
  readonly disabled: string | null;
}

export interface PaletteGroup {
  readonly id: PaletteSectionId;
  readonly name: string;
  readonly entries: readonly PaletteEntry[];
}

export const NEW_REUSABLE_KEY = 'reusable:new';
export const SNIPPETS_NAME = 'Snippets';
export const FUNCTION_ICON = 'function';

const MAX_TAKES_SHOWN = 3;

const SCALAR_TAKES: Readonly<Record<string, string>> = {
  boolean: 'an on/off value',
  text: 'text',
  duration: 'a duration',
  instant: 'a date and time',
  timeOfDay: 'a time of day',
  date: 'a date',
  color: 'a colour',
  error: 'an error',
  any: 'any value',
  param: 'a value',
  number: 'a number',
  choice: 'a choice',
  list: 'a list',
  record: 'an object',
};

function article(noun: string): string {
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}

export function takesPhrase(type: FlowType): string {
  if (type.t === 'optional') return takesPhrase(type.of);
  if (type.t === 'ref') return article(type.of);
  return SCALAR_TAKES[type.t] ?? 'a value';
}

export function takesText(
  inputs: readonly { readonly type: FlowType; readonly required: boolean }[],
): string {
  const needed = inputs.filter((input) => input.required);
  if (needed.length === 0) return 'Takes nothing';
  const shown = needed.slice(0, MAX_TAKES_SHOWN).map((input) => takesPhrase(input.type));
  const more = needed.length - shown.length;
  return `Takes ${shown.join(', ')}${more > 0 ? ` and ${String(more)} more` : ''}`;
}

export function typeWordsOf(types: readonly FlowType[]): readonly string[] {
  return [...new Set(types.map((type) => typeDisplayName(type).toLowerCase()))];
}

export function envReason(kind: NodeKind, env: PaletteEnv): string | null {
  if (kind.access === 'owner' && !env.isOwner) {
    return kind.category === 'ai'
      ? 'Only the owner can use the AI.'
      : 'Only the owner can use this.';
  }
  if (kind.category === 'computers' && !env.hasComputer) return 'Pair a computer first.';
  return null;
}

export function nodeEntry(kind: NodeKind, env: PaletteEnv): PaletteEntry {
  const types = [...kind.inputs.map((port) => port.type), ...kind.outputs.map((port) => port.type)];
  return {
    key: `node:${kind.id}`,
    choice: { source: 'node', kindId: kind.id },
    name: kind.name,
    meaning: kind.description,
    takes: takesText(kind.inputs),
    icon: kind.icon,
    section: kind.category,
    keywords: kind.keywords,
    typeWords: typeWordsOf(types),
    gives: kind.outputs.map((port) => port.type),
    kindId: kind.id,
    usageId: kind.id,
    trigger: kind.class === 'trigger',
    disabled: envReason(kind, env),
  };
}

export function interfaceLine(fn: AutomationFunctionSummary): string {
  const inputs = fn.interface.inputs.map((input) => input.label ?? input.name);
  const outputs = fn.interface.outputs.map((output) => output.label ?? output.name);
  const inText = inputs.length === 0 ? 'nothing' : inputs.join(', ');
  const outText = outputs.length === 0 ? 'nothing' : outputs.join(', ');
  return `in: ${inText} · out: ${outText}`;
}

export function functionEntry(fn: AutomationFunctionSummary): PaletteEntry {
  const types = [
    ...fn.interface.inputs.map((port) => port.type),
    ...fn.interface.outputs.map((port) => port.type),
  ];
  return {
    key: `function:${fn.id}`,
    choice: { source: 'function', functionId: fn.id },
    name: fn.name,
    meaning: fn.description ?? takesText(fn.interface.inputs),
    takes: interfaceLine(fn),
    icon: fn.icon ?? FUNCTION_ICON,
    section: 'reusable',
    keywords: fn.category === null ? [] : [fn.category],
    typeWords: typeWordsOf(types),
    gives: fn.interface.outputs.map((port) => port.type),
    kindId: null,
    usageId: null,
    trigger: false,
    disabled: null,
  };
}

export const NEW_REUSABLE_ENTRY: PaletteEntry = {
  key: NEW_REUSABLE_KEY,
  choice: { source: 'new-reusable' },
  name: 'New Custom Node',
  meaning: 'Build your own step or value once and use it in any automation.',
  takes: 'Opens an empty Custom Node',
  icon: 'plus',
  section: 'reusable',
  keywords: ['create', 'new', 'function', 'make', 'own'],
  typeWords: [],
  gives: [],
  kindId: null,
  usageId: null,
  trigger: false,
  disabled: null,
};

export function shippedNodeEntries(
  kinds: readonly NodeKind[],
  env: PaletteEnv,
): readonly PaletteEntry[] {
  return kinds
    .filter((kind) => SHIPPED_TIERS.includes(kind.tier))
    .map((kind) => nodeEntry(kind, env));
}

function byName(left: PaletteEntry, right: PaletteEntry): number {
  return compareText(left.name, right.name);
}

export function paletteGroups(entries: readonly PaletteEntry[]): readonly PaletteGroup[] {
  const sections: readonly { readonly id: PaletteSectionId; readonly name: string }[] = [
    ...NODE_CATEGORIES,
    { id: 'snippets', name: SNIPPETS_NAME },
  ];
  return sections
    .map(({ id, name }) => {
      const members = entries.filter((entry) => entry.section === id).sort(byName);
      return { id, name, entries: id === 'reusable' ? withNewReusableFirst(members) : members };
    })
    .filter((group) => group.entries.length > 0 || group.id === 'reusable');
}

function withNewReusableFirst(members: readonly PaletteEntry[]): readonly PaletteEntry[] {
  return [NEW_REUSABLE_ENTRY, ...members.filter((entry) => entry.key !== NEW_REUSABLE_KEY)];
}
