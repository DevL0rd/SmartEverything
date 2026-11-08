import type { VacuumHomeRoom } from '@smarteverything/domain';

export interface NamedMapRoom {
  readonly id: number;
  readonly name: string;
}

interface Pair {
  readonly mapRoomId: number;
  readonly room: VacuumHomeRoom;
  readonly score: number;
}

const SAME_NAME = 3;
const SAME_WORDS = 2;
const WORD_PREFIX = 1;
const PREFIX_MIN = 3;

function wordsOf(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

function contains(outer: readonly string[], inner: readonly string[]): boolean {
  if (inner.length === 0 || inner.length > outer.length) return false;
  return outer.some((_, start) => inner.every((word, offset) => outer[start + offset] === word));
}

function strictPrefixes(a: string, b: string): boolean {
  return (
    a !== b && Math.min(a.length, b.length) >= PREFIX_MIN && (a.startsWith(b) || b.startsWith(a))
  );
}

function prefixed(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== 1 && right.length !== 1) return false;
  return left.some((a) => right.some((b) => strictPrefixes(a, b)));
}

export function nameScore(mapName: string, homeName: string): number {
  const left = wordsOf(mapName);
  const right = wordsOf(homeName);
  if (left.length === 0 || right.length === 0) return 0;
  if (left.join(' ') === right.join(' ')) return SAME_NAME;
  if (contains(left, right) || contains(right, left)) return SAME_WORDS;
  return prefixed(left, right) ? WORD_PREFIX : 0;
}

function pairsOf(mapRooms: readonly NamedMapRoom[], homeRooms: readonly VacuumHomeRoom[]): Pair[] {
  return mapRooms
    .flatMap((mapRoom) =>
      homeRooms.map((room) => ({
        mapRoomId: mapRoom.id,
        room,
        score: nameScore(mapRoom.name, room.name),
      })),
    )
    .filter((pair) => pair.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function suggestHomeRooms(
  mapRooms: readonly NamedMapRoom[],
  freeHomeRooms: readonly VacuumHomeRoom[],
): ReadonlyMap<number, VacuumHomeRoom> {
  const pairs = pairsOf(mapRooms, freeHomeRooms);
  const suggested = new Map<number, VacuumHomeRoom>();
  const settled = new Set<number>();
  const taken = new Set<string>();
  for (const pair of pairs) {
    if (settled.has(pair.mapRoomId) || taken.has(pair.room.id)) continue;
    const rivals = pairs.filter(
      (other) =>
        other.score === pair.score &&
        !taken.has(other.room.id) &&
        (other.mapRoomId === pair.mapRoomId || other.room.id === pair.room.id),
    );
    settled.add(pair.mapRoomId);
    if (rivals.length > 1) continue;
    suggested.set(pair.mapRoomId, pair.room);
    taken.add(pair.room.id);
  }
  return suggested;
}
