import type { PhotoPlace } from '@smarteverything/domain';
import { dayText } from '../../../components/media-grid/day-text';
import { wallDayKey } from '../../../components/media-grid/tiles';
import { zonedDateFormat } from '../../../format/locale';
import type { HeaderText } from './header';
import { dayCountText, headerDayText, wallTimeOf, type MediaItem } from './info-model';
import type { DayPosition } from './sequence';

const CLOCK = zonedDateFormat({ hour: '2-digit', minute: '2-digit' });

export interface HeaderInput {
  readonly item: MediaItem;
  readonly offsetMin: number | null;
  readonly place: PhotoPlace | null;
  readonly day: DayPosition | null;
  readonly today: string;
}

function dayOf(input: HeaderInput, takenAt: string): string {
  return wallDayKey(Date.parse(takenAt), input.offsetMin);
}

function joined(parts: readonly (string | null)[], separator: string): string | null {
  const present = parts.filter((part) => part !== null);
  return present.length === 0 ? null : present.join(separator);
}

function positionOf(input: HeaderInput, takenAt: string): string | null {
  if (input.day === null || input.day.total < 2) return null;
  const today = dayOf(input, takenAt) === input.today;
  return dayCountText(input.day.position, input.day.total, today);
}

export function desktopHeaderText(input: HeaderInput): HeaderText {
  const { item, place } = input;
  if (item.takenAt === null) return { title: item.name, detail: null };
  const where = place === null ? null : joined([place.name, place.country], ', ');
  return {
    title: headerDayText(wallTimeOf(item.takenAt, input.offsetMin)),
    detail: joined([where, positionOf(input, item.takenAt)], ' · '),
  };
}

export function phoneHeaderText(input: HeaderInput): HeaderText {
  const { item, place } = input;
  if (item.takenAt === null) return { title: item.name, detail: null };
  const time = wallTimeOf(item.takenAt, input.offsetMin);
  const day = dayText(dayOf(input, item.takenAt), 1, input.today).title;
  return {
    title: `${day}, ${CLOCK(time.zone).format(time.at)}`,
    detail: place === null ? null : joined([place.name, place.admin], ', '),
  };
}
