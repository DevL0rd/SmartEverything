import { NODE_CATEGORIES, isAssignable, type FlowType } from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { SNIPPETS_NAME, type PaletteEntry } from './palette-categories';

export interface PaletteContext {
  readonly slot: 'step' | 'trigger' | 'value';
  readonly expected: FlowType | null;
  readonly inLoop: boolean;
  readonly afterTrigger: boolean;
}

export interface PaletteUsage {
  readonly recents: readonly string[];
  readonly favourites: readonly string[];
}

export interface RankedEntry {
  readonly entry: PaletteEntry;
  readonly score: number;
}

export const STEP_CONTEXT: PaletteContext = {
  slot: 'step',
  expected: null,
  inLoop: false,
  afterTrigger: false,
};

export const NO_USAGE: PaletteUsage = { recents: [], favourites: [] };

export const LOOP_ONLY_KINDS: ReadonlySet<string> = new Set(['flow.break', 'flow.continue']);

const SECTION_NAMES: ReadonlyMap<string, string> = new Map([
  ...NODE_CATEGORIES.map(({ id, name }): [string, string] => [id, name.toLowerCase()]),
  ['snippets', SNIPPETS_NAME.toLowerCase()],
]);

const SCORE = {
  nameExact: 100,
  nameWord: 80,
  namePrefix: 70,
  nameInside: 55,
  keywordExact: 50,
  keywordInside: 35,
  origin: 30,
  section: 25,
  meaning: 20,
  portType: 15,
  fits: 40,
  noValue: -40,
  loopOnly: 30,
  favourite: 25,
  recent: 20,
} as const;

export function wordsOf(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
}

export function isShown(entry: PaletteEntry, context: PaletteContext): boolean {
  return context.slot !== 'trigger' || entry.trigger;
}

function nameScore(name: string, word: string): number {
  const parts = name.split(/\s+/);
  if (name === word) return SCORE.nameExact;
  if (parts.includes(word)) return SCORE.nameWord;
  if (parts.some((part) => part.startsWith(word))) return SCORE.namePrefix;
  return name.includes(word) ? SCORE.nameInside : 0;
}

function keywordScore(keywords: readonly string[], word: string): number {
  const lowered = keywords.map((keyword) => keyword.toLowerCase());
  if (lowered.includes(word)) return SCORE.keywordExact;
  return lowered.some((keyword) => keyword.includes(word)) ? SCORE.keywordInside : 0;
}

function wordScore(entry: PaletteEntry, word: string): number {
  return Math.max(
    nameScore(entry.name.toLowerCase(), word),
    keywordScore(entry.keywords, word),
    SECTION_NAMES.get(entry.section)?.includes(word) === true ? SCORE.section : 0,
    entry.origin?.name.toLowerCase().includes(word) === true ? SCORE.origin : 0,
    entry.meaning.toLowerCase().includes(word) ? SCORE.meaning : 0,
    entry.typeWords.some((type) => type.includes(word)) ? SCORE.portType : 0,
  );
}

export function textScore(entry: PaletteEntry, words: readonly string[]): number {
  let total = 0;
  for (const word of words) {
    const score = wordScore(entry, word);
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

export function givesExpected(entry: PaletteEntry, expected: FlowType): boolean {
  return entry.gives.some((type) => isAssignable(type, expected));
}

function valueScore(entry: PaletteEntry, context: PaletteContext): number {
  if (context.slot !== 'value' || context.expected === null) return 0;
  if (givesExpected(entry, context.expected)) return SCORE.fits;
  return entry.gives.length === 0 ? SCORE.noValue : 0;
}

function usageScore(entry: PaletteEntry, usage: PaletteUsage): number {
  if (entry.usageId === null) return 0;
  if (usage.favourites.includes(entry.usageId)) return SCORE.favourite;
  const place = usage.recents.indexOf(entry.usageId);
  return place < 0 ? 0 : Math.max(SCORE.recent - place, 1);
}

export function contextScore(
  entry: PaletteEntry,
  context: PaletteContext,
  usage: PaletteUsage,
): number {
  const loop =
    context.inLoop && entry.kindId !== null && LOOP_ONLY_KINDS.has(entry.kindId)
      ? SCORE.loopOnly
      : 0;
  return valueScore(entry, context) + usageScore(entry, usage) + loop;
}

function compareRanked(left: RankedEntry, right: RankedEntry): number {
  if (left.score !== right.score) return right.score - left.score;
  return compareText(left.entry.name, right.entry.name);
}

export function rankEntries(
  entries: readonly PaletteEntry[],
  query: string,
  context: PaletteContext,
  usage: PaletteUsage = NO_USAGE,
): readonly RankedEntry[] {
  const words = wordsOf(query);
  const ranked: RankedEntry[] = [];
  for (const entry of entries) {
    if (!isShown(entry, context)) continue;
    const text = textScore(entry, words);
    if (words.length > 0 && text === 0) continue;
    ranked.push({ entry, score: text + contextScore(entry, context, usage) });
  }
  return ranked.sort(compareRanked);
}

export function inOrder(
  entries: readonly PaletteEntry[],
  context: PaletteContext,
): readonly RankedEntry[] {
  return entries.filter((entry) => isShown(entry, context)).map((entry) => ({ entry, score: 0 }));
}
