import type { Trip } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts';
import { count } from '../../../format/number';
import { memoryTitle } from './model';
import { dayCount, daysText, itemsText, kilometres, monthYear, placesText } from './text';

export interface TripFigure {
  readonly key: 'days' | 'items' | 'places' | 'km';
  readonly value: string;
  readonly label: string;
}

function figure(key: TripFigure['key'], total: number, one: string, many: string): TripFigure {
  return { key, value: count(total), label: total === 1 ? one : many };
}

export function tripFigures(trip: Trip): readonly TripFigure[] {
  const figures = [
    figure('days', dayCount(trip.from, trip.to), 'day', 'days'),
    figure('items', trip.count, 'item', 'items'),
    figure('places', trip.places, 'place', 'places'),
  ];
  const km = trip.distanceFromHomeKm;
  return km === null
    ? figures
    : [...figures, { key: 'km', value: kilometres(km), label: 'km from home' }];
}

export function tripWhen(trip: Trip): string {
  return monthYear(trip.from);
}

export function tripLines(trip: Trip): readonly [string, string] {
  const span = `${tripWhen(trip)} · ${daysText(dayCount(trip.from, trip.to))}`;
  const places = placesText(trip.places);
  const km = trip.distanceFromHomeKm;
  return [
    `${span} · ${itemsText(trip.count)}`,
    km === null ? places : `${places} · ${kilometres(km)} km from home`,
  ];
}

export function tripBars(trip: Trip): readonly Bar[] {
  return trip.perDay.map((day) => ({ key: day.day, value: day.count }));
}

export function tripBarsLabel(trip: Trip): string {
  return `Photos and videos per day of ${memoryTitle(trip)}`;
}
