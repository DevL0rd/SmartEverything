import { roomTitle, shownRooms } from './plan/rooms';
import type { RenderFloor, RenderRoom } from './render-scene';

export interface HomeMapSummaryLive {
  readonly lightsOn: readonly string[];
  readonly people: ReadonlyMap<string, number>;
  readonly temperatures: ReadonlyMap<string, string>;
}

const countOf = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

export function spokenList(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

function lightWords(rooms: readonly RenderRoom[], live: HomeMapSummaryLive): string {
  const lit = rooms.filter((room) => live.lightsOn.includes(room.id)).map(roomTitle);
  return lit.length === 0 ? 'no lights on' : `lights on in ${spokenList(lit)}`;
}

function peopleWords(rooms: readonly RenderRoom[], live: HomeMapSummaryLive): readonly string[] {
  return rooms.flatMap((room) => {
    const count = live.people.get(room.id) ?? 0;
    return count > 0 ? [`${countOf(count, 'person', 'people')} in ${roomTitle(room)}`] : [];
  });
}

function temperatureWords(
  rooms: readonly RenderRoom[],
  live: HomeMapSummaryLive,
): readonly string[] {
  return rooms.flatMap((room) => {
    const value = live.temperatures.get(room.id);
    return value === undefined ? [] : [`${value} degrees in ${roomTitle(room)}`];
  });
}

export function describeHomeMapStage(
  floor: Pick<RenderFloor, 'name' | 'rooms'>,
  mapName: string | null,
  live: HomeMapSummaryLive | null,
): string {
  const rooms = shownRooms(floor);
  return [
    `${mapName ?? 'Home'} map`,
    floor.name,
    rooms.length === 0 ? 'no rooms' : countOf(rooms.length, 'room', 'rooms'),
    ...(live === null
      ? []
      : [lightWords(rooms, live), ...peopleWords(rooms, live), ...temperatureWords(rooms, live)]),
  ].join(', ');
}
