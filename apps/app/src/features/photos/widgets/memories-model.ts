import type { Memory } from '@smarteverything/domain';
import { zonedDateFormat } from '../../../format/locale';
import { count } from '../../../format/number';
import type { HeroMemory } from '../memories/model';
import { itemsText, yearOf, yearsAgoText } from '../memories/text';

export const SIDE_TILES = 2;

export const BOARD_TILES = 3;

const DAY_ONLY = zonedDateFormat({ day: 'numeric' });

const MONTH_NAME = zonedDateFormat({ month: 'long' });

const KIND_ORDER: Readonly<Record<Memory['kind'], number>> = {
  on_this_day: 0,
  this_week: 1,
  day_out: 2,
  burst: 3,
  trip: 4,
  year: 5,
};

export interface OnThisDay {
  readonly cover: HeroMemory;
  readonly sides: readonly HeroMemory[];
  readonly index: number;
  readonly years: number;
  readonly total: number;
}

function isHero(memory: Memory): memory is HeroMemory {
  return memory.kind === 'on_this_day';
}

export function heroesOf(memories: readonly Memory[]): readonly HeroMemory[] {
  return memories.filter(isHero).sort((a, b) => a.yearsAgo - b.yearsAgo);
}

function rotated<T>(items: readonly T[], start: number): readonly T[] {
  return [...items.slice(start), ...items.slice(0, start)];
}

export function onThisDayOf(heroes: readonly HeroMemory[], picked: number): OnThisDay | null {
  const index = Math.min(Math.max(picked, 0), heroes.length - 1);
  const cover = heroes[index];
  if (cover === undefined) return null;
  return {
    cover,
    sides: rotated(heroes, index + 1).slice(0, Math.min(SIDE_TILES, heroes.length - 1)),
    index,
    years: heroes.length,
    total: heroes.reduce((sum, memory) => sum + memory.count, 0),
  };
}

export function dayMonthText(day: string): string {
  const instant = new Date(`${day}T00:00:00Z`);
  return `${DAY_ONLY('UTC').format(instant)} ${MONTH_NAME('UTC').format(instant)}`;
}

export function fromYearsText(total: number, years: number): string {
  const span = years === 1 ? '1 year' : `${count(years)} years`;
  return `${itemsText(total)} from ${span}`;
}

export function coverLabel(memory: HeroMemory): string {
  return `${String(yearOf(memory.from))} · ${yearsAgoText(memory.yearsAgo)}`;
}

export function sideLabel(memory: HeroMemory): string {
  return String(yearOf(memory.from));
}

function heroAge(memory: Memory): number {
  return memory.kind === 'on_this_day' ? memory.yearsAgo : 0;
}

export function boardTilesOf(
  memories: readonly Memory[],
  yearInReview: boolean,
): readonly Memory[] {
  return memories
    .filter((memory) => yearInReview || memory.kind !== 'year')
    .map((memory, position) => ({ memory, position }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.memory.kind] - KIND_ORDER[b.memory.kind] ||
        heroAge(a.memory) - heroAge(b.memory) ||
        a.position - b.position,
    )
    .map(({ memory }) => memory);
}

export function tileLabel(memory: Memory): string {
  switch (memory.kind) {
    case 'on_this_day':
      return 'On this day';
    case 'this_week':
      return 'This week';
    case 'day_out':
      return memory.placeName ?? 'Day out';
    case 'burst':
      return 'Burst';
    case 'trip':
      return memory.placeName === null ? 'Trip' : `Trip: ${memory.placeName}`;
    case 'year':
      return `Your ${String(memory.review.year)}`;
  }
}

export function memoriesText(total: number): string {
  return total === 1 ? '1 memory' : `${count(total)} memories`;
}
