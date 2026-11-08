import type { PhotoInsights, Trip } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { count } from '../../../format/number';
import { dayRange, plural } from './model';
import { draftOfRule, type AlbumDraft } from './rule-draft';

export interface StarterChoice {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly draft: AlbumDraft;
}

export interface Starter {
  readonly id: 'trip' | 'camera';
  readonly title: string;
  readonly line: string;
  readonly icon: IconName;
  readonly choices: readonly StarterChoice[];
}

export function tripChoice(trip: Trip): StarterChoice {
  const name = trip.placeName ?? 'Trip';
  return {
    key: trip.id,
    label: name,
    description: `${dayRange(trip.from, trip.to)} · ${plural(trip.count, 'item', 'items')}`,
    draft: draftOfRule(
      `${name} ${trip.to.slice(0, 4)}`,
      {
        match: 'all',
        rules: [{ kind: 'date_range', field: 'takenAt', from: trip.from, to: trip.to }],
      },
      'person',
    ),
  };
}

function newestFirst(left: Trip, right: Trip): number {
  const leftKey = `${left.to}/${left.from}`;
  const rightKey = `${right.to}/${right.from}`;
  if (leftKey === rightKey) return 0;
  return leftKey < rightKey ? 1 : -1;
}

export function tripStarter(trips: readonly Trip[]): Starter | null {
  if (trips.length === 0) return null;
  return {
    id: 'trip',
    title: 'A trip',
    line: `${count(trips.length)} found`,
    icon: 'route',
    choices: [...trips].sort(newestFirst).map(tripChoice),
  };
}

type Camera = PhotoInsights['cameras'][number];

function cameraName(camera: Camera): string | null {
  const name = [camera.make, camera.model].filter((part) => part !== null).join(' ');
  return name === '' ? null : name;
}

function cameraChoice(camera: Camera, name: string): StarterChoice {
  return {
    key: name,
    label: name,
    description: plural(camera.items, 'item', 'items'),
    draft: draftOfRule(
      name,
      { match: 'all', rules: [{ kind: 'text', field: 'camera', contains: camera.model ?? name }] },
      'person',
    ),
  };
}

export function cameraStarter(cameras: readonly Camera[]): Starter | null {
  const choices = [...cameras]
    .sort((left, right) => right.items - left.items)
    .flatMap((camera) => {
      const name = cameraName(camera);
      return name === null ? [] : [cameraChoice(camera, name)];
    });
  if (choices.length === 0) return null;
  return {
    id: 'camera',
    title: 'A camera',
    line: plural(choices.length, 'camera', 'cameras'),
    icon: 'camera',
    choices,
  };
}

export function startersOf(
  trips: readonly Trip[] | undefined,
  cameras: readonly Camera[] | undefined,
): readonly Starter[] {
  const trip = trips === undefined ? null : tripStarter(trips);
  const camera = cameras === undefined ? null : cameraStarter(cameras);
  return [trip, camera].filter((starter): starter is Starter => starter !== null);
}
