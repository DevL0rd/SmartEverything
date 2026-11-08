import type { DriveAlbumCreate, Memory, Trip, YearInReview } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Bar } from '../../../components/charts';
import { count } from '../../../format/number';
import {
  dayCount,
  daysText,
  itemsText,
  longDay,
  monthInitial,
  monthName,
  rangeText,
  shortDay,
  shotsText,
  weekdayOf,
  yearOf,
  yearsAgoText,
} from './text';

export type HeroMemory = Extract<Memory, { readonly kind: 'on_this_day' }>;
export type WeekMemory = Extract<Memory, { readonly kind: 'this_week' | 'day_out' | 'burst' }>;
export type YearMemory = Extract<Memory, { readonly kind: 'year' }>;

export interface MemoryBoard {
  readonly hero: readonly HeroMemory[];
  readonly week: readonly WeekMemory[];
  readonly year: YearMemory | null;
}

function isHero(memory: Memory): memory is HeroMemory {
  return memory.kind === 'on_this_day';
}

function isWeek(memory: Memory): memory is WeekMemory {
  return memory.kind === 'this_week' || memory.kind === 'day_out' || memory.kind === 'burst';
}

function isYear(memory: Memory): memory is YearMemory {
  return memory.kind === 'year';
}

function latestYear(memories: readonly Memory[]): YearMemory | null {
  return memories
    .filter(isYear)
    .reduce<YearMemory | null>(
      (latest, memory) =>
        latest === null || memory.review.year > latest.review.year ? memory : latest,
      null,
    );
}

export function boardOf(memories: readonly Memory[], yearInReview: boolean): MemoryBoard {
  return {
    hero: memories.filter(isHero).sort((a, b) => a.yearsAgo - b.yearsAgo),
    week: memories.filter(isWeek),
    year: yearInReview ? latestYear(memories) : null,
  };
}

export function boardIsEmpty(board: MemoryBoard, trips: readonly Trip[]): boolean {
  return (
    board.hero.length === 0 && board.week.length === 0 && board.year === null && trips.length === 0
  );
}

export function memoryKicker(memory: Memory): string {
  switch (memory.kind) {
    case 'on_this_day':
      return `On this day · ${yearsAgoText(memory.yearsAgo)}`;
    case 'this_week':
      return `This week · ${String(yearOf(memory.from))}`;
    case 'day_out':
      return 'Day out';
    case 'burst':
      return 'Burst';
    case 'trip':
      return 'Trip';
    case 'year':
      return 'Year in review';
  }
}

function placeTitle(name: string | null, from: string): string {
  return `${name ?? 'A day out'} on ${weekdayOf(from)}`;
}

export function memoryTitle(memory: Memory): string {
  switch (memory.kind) {
    case 'on_this_day':
      return longDay(memory.from);
    case 'this_week':
      return `This week in ${String(yearOf(memory.from))}`;
    case 'day_out':
      return placeTitle(memory.placeName, memory.from);
    case 'burst':
      return `Burst of ${shotsText(memory.count)}`;
    case 'trip':
      return memory.placeName ?? `Trip from ${rangeText(memory.from, memory.to)}`;
    case 'year':
      return `Your ${String(memory.review.year)}`;
  }
}

export function heroMark(memory: HeroMemory, compact: boolean): string {
  return compact ? memoryKicker(memory) : 'On this day';
}

export function heroLine(memory: HeroMemory): string {
  return itemsText(memory.count);
}

export function weekMark(memory: WeekMemory): string {
  switch (memory.kind) {
    case 'this_week':
      return 'This week';
    case 'day_out':
      return 'Day out';
    case 'burst':
      return 'Burst';
  }
}

export function cardLine(memory: WeekMemory): string {
  switch (memory.kind) {
    case 'this_week':
      return `${itemsText(memory.count)} · ${daysText(dayCount(memory.from, memory.to))}`;
    case 'day_out':
      return `${shortDay(memory.from)} · ${itemsText(memory.count)}`;
    case 'burst':
      return `${shortDay(memory.from)} · ${shotsText(memory.count)}`;
  }
}

export function yearBars(review: YearInReview): readonly Bar[] {
  return review.perMonth.map((month) => ({
    key: month.month,
    value: month.count,
    label: monthInitial(month.month),
  }));
}

export function peakMonth(review: YearInReview): YearInReview['perMonth'][number] | null {
  return review.perMonth.reduce<YearInReview['perMonth'][number] | null>(
    (peak, month) =>
      month.count > 0 && (peak === null || month.count > peak.count) ? month : peak,
    null,
  );
}

export function yearBarsLabel(review: YearInReview): string {
  const peak = peakMonth(review);
  const base = `Photos and videos per month in ${String(review.year)}`;
  return peak === null ? base : `${base}, ${monthName(peak.month)} is the peak`;
}

export interface YearHighlight {
  readonly key: string;
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
}

function placeHighlight(review: YearInReview): YearHighlight | null {
  const place = review.topPlaces[0];
  return place === undefined
    ? null
    : {
        key: 'place',
        icon: 'mapPin',
        label: 'Top place',
        value: `${place.name} · ${count(place.count)}`,
      };
}

function cameraHighlight(review: YearInReview): YearHighlight | null {
  const camera = review.topCameras[0];
  return camera === undefined
    ? null
    : {
        key: 'camera',
        icon: 'camera',
        label: 'Top camera',
        value: `${camera.name} · ${count(camera.count)}`,
      };
}

function favouriteHighlight(review: YearInReview): YearHighlight | null {
  const month = review.mostFavouritedMonth;
  return month === null
    ? null
    : { key: 'favourite', icon: 'star', label: 'Most favourited', value: monthName(month) };
}

function dayOutHighlight(review: YearInReview): YearHighlight | null {
  const day = review.longestDayOut;
  return day === null
    ? null
    : {
        key: 'day-out',
        icon: 'clock',
        label: 'Longest day out',
        value: `${shortDay(day.day)} · ${itemsText(day.count)}`,
      };
}

const HIGHLIGHTS = [placeHighlight, cameraHighlight, favouriteHighlight, dayOutHighlight] as const;

export function yearHighlights(review: YearInReview): readonly YearHighlight[] {
  return HIGHLIGHTS.map((highlight) => highlight(review)).filter(
    (highlight): highlight is YearHighlight => highlight !== null,
  );
}

export function albumRequestOf(memory: Memory): DriveAlbumCreate | null {
  if (memory.kind === 'burst') return null;
  return {
    kind: 'smart',
    title: memoryTitle(memory),
    surface: 'photos',
    scope: 'person',
    rule: {
      match: 'all',
      rules: [
        { kind: 'date_range', field: 'takenAt', from: memory.from, to: memory.to },
        { kind: 'item_kind', itemKinds: ['image', 'video'] },
      ],
    },
  };
}
