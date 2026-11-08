import {
  NODE_CATEGORIES,
  isShippedKind,
  typeDisplayName,
  type AutomationFunctionSummary,
  type FlowType,
  type JsonValue,
  type NodeCategoryId,
  type NodeKind,
} from '@smarteverything/domain';
import { isIconName, type IconName } from '../../../../components/icon';
import { compareText } from '../../../../format/text';
import { SECTION_ICONS } from './category-icons';

export type PaletteSectionId = NodeCategoryId | 'snippets';

export type PaletteChoice =
  | { readonly source: 'node'; readonly kindId: string }
  | { readonly source: 'function'; readonly functionId: string }
  | { readonly source: 'preset'; readonly presetId: string; readonly control: string }
  | {
      readonly source: 'kind-preset';
      readonly presetId: string;
      readonly kindId: string;
      readonly ports: Readonly<Record<string, JsonValue>>;
    }
  | {
      readonly source: 'trigger-preset';
      readonly presetId: string;
      readonly kindId: string;
      readonly ports: Readonly<Record<string, JsonValue>>;
    }
  | { readonly source: 'snippet'; readonly snippetId: string }
  | { readonly source: 'new-reusable' };

export interface PaletteOrigin {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
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
  readonly origin?: PaletteOrigin;
}

export interface PaletteGroup {
  readonly key: string;
  readonly id: PaletteSectionId;
  readonly name: string;
  readonly icon: IconName;
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

export function fromText(origin: PaletteOrigin, takes: string): string {
  return `From ${origin.name} · ${takes}`;
}

function originOf(kind: NodeKind): PaletteOrigin | undefined {
  const { origin } = kind;
  return origin === undefined ? undefined : { id: origin.id, name: origin.name, icon: origin.icon };
}

export function nodeEntry(kind: NodeKind): PaletteEntry {
  const types = [...kind.inputs.map((port) => port.type), ...kind.outputs.map((port) => port.type)];
  const origin = originOf(kind);
  const takes = takesText(kind.inputs);
  return {
    key: `node:${kind.id}`,
    choice: { source: 'node', kindId: kind.id },
    name: kind.name,
    meaning: kind.description,
    takes: origin === undefined ? takes : fromText(origin, takes),
    icon: kind.icon,
    section: kind.category,
    keywords: kind.keywords,
    typeWords: typeWordsOf(types),
    gives: kind.outputs.map((port) => port.type),
    kindId: kind.id,
    usageId: kind.id,
    trigger: kind.class === 'trigger',
    ...(origin === undefined ? {} : { origin }),
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
};

export function shippedNodeEntries(kinds: readonly NodeKind[]): readonly PaletteEntry[] {
  return kinds.filter(isShippedKind).map(nodeEntry);
}

function byName(left: PaletteEntry, right: PaletteEntry): number {
  return compareText(left.name, right.name);
}

const PLUGINS_SECTION: PaletteSectionId = 'plugins';

function sectionGroup(
  id: PaletteSectionId,
  name: string,
  members: readonly PaletteEntry[],
): PaletteGroup {
  const entries = id === 'reusable' ? withNewReusableFirst(members) : members;
  return { key: id, id, name, icon: SECTION_ICONS[id], entries };
}

function originGroup(origin: PaletteOrigin, members: readonly PaletteEntry[]): PaletteGroup {
  return {
    key: `${PLUGINS_SECTION}:${origin.id}`,
    id: PLUGINS_SECTION,
    name: origin.name,
    icon: isIconName(origin.icon) ? origin.icon : SECTION_ICONS[PLUGINS_SECTION],
    entries: members,
  };
}

export function pluginGroups(name: string, members: readonly PaletteEntry[]): PaletteGroup[] {
  const origins = new Map<string, { origin: PaletteOrigin; entries: PaletteEntry[] }>();
  const loose: PaletteEntry[] = [];
  for (const entry of members) {
    if (entry.origin === undefined) {
      loose.push(entry);
      continue;
    }
    const found = origins.get(entry.origin.id);
    if (found === undefined)
      origins.set(entry.origin.id, { origin: entry.origin, entries: [entry] });
    else found.entries.push(entry);
  }
  const grouped = [...origins.values()]
    .map(({ origin, entries }) => originGroup(origin, entries))
    .sort((left, right) => compareText(left.name, right.name));
  return loose.length === 0 ? grouped : [...grouped, sectionGroup(PLUGINS_SECTION, name, loose)];
}

export function paletteGroups(entries: readonly PaletteEntry[]): readonly PaletteGroup[] {
  const sections: readonly { readonly id: PaletteSectionId; readonly name: string }[] = [
    ...NODE_CATEGORIES,
    { id: 'snippets', name: SNIPPETS_NAME },
  ];
  return sections
    .flatMap(({ id, name }) => {
      const members = entries.filter((entry) => entry.section === id).sort(byName);
      return id === PLUGINS_SECTION
        ? pluginGroups(name, members)
        : [sectionGroup(id, name, members)];
    })
    .filter((group) => group.entries.length > 0 || group.id === 'reusable');
}

function withNewReusableFirst(members: readonly PaletteEntry[]): readonly PaletteEntry[] {
  return [NEW_REUSABLE_ENTRY, ...members.filter((entry) => entry.key !== NEW_REUSABLE_KEY)];
}
