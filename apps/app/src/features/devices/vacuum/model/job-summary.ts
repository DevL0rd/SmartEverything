import { vacuumJob, type VacuumRoom, type VacuumValues } from '@smarteverything/domain';
import { readingOf, type Reading } from './readings';

export type JobRooms = readonly Pick<VacuumRoom, 'id' | 'name' | 'areaM2' | 'hidden'>[];

export type JobScope = 'home' | 'rooms' | 'zones' | 'mixed';

export interface JobRoom {
  readonly id: number;
  readonly name: string;
  readonly areaM2: number | null;
}

export interface JobSummary {
  readonly scope: JobScope;
  readonly rooms: readonly JobRoom[];
  readonly zoneCount: number;
  readonly title: string;
  readonly plannedAreaM2: number | null;
  readonly doneAreaM2: number | null;
  readonly progress: number | null;
  readonly elapsedSeconds: number | null;
  readonly passes: number | null;
}

const TITLE_NAMES = 2;

function scopeOf(roomCount: number, zoneCount: number): JobScope {
  if (roomCount > 0 && zoneCount > 0) {
    return 'mixed';
  }
  if (roomCount > 0) {
    return 'rooms';
  }
  return zoneCount > 0 ? 'zones' : 'home';
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function jobRooms(ids: readonly number[], known: JobRooms): readonly JobRoom[] {
  return ids.map((id) => {
    const room = known.find((candidate) => candidate.id === id);
    return { id, name: room?.name ?? `Room ${String(id)}`, areaM2: room?.areaM2 ?? null };
  });
}

function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function roomsTitle(rooms: readonly JobRoom[]): string {
  const names = rooms.slice(0, TITLE_NAMES).map((room) => room.name);
  const more = rooms.length - names.length;
  return more > 0 ? `${names.join(', ')} +${String(more)}` : names.join(', ');
}

export function jobTitle(scope: JobScope, rooms: readonly JobRoom[], zoneCount: number): string {
  if (scope === 'home') {
    return 'Whole home';
  }
  if (scope === 'rooms') {
    return roomsTitle(rooms);
  }
  return scope === 'zones'
    ? countOf(zoneCount, 'zone')
    : `${roomsTitle(rooms)} and ${countOf(zoneCount, 'zone')}`;
}

function plannedArea(scope: JobScope, rooms: readonly JobRoom[], known: JobRooms): number | null {
  if (scope === 'home') {
    const shown = known.filter((room) => !room.hidden);
    return shown.length === 0 ? null : shown.reduce((sum, room) => sum + room.areaM2, 0);
  }
  if (scope !== 'rooms' || rooms.some((room) => room.areaM2 === null)) {
    return null;
  }
  return rooms.reduce((sum, room) => sum + (room.areaM2 ?? 0), 0);
}

function doneArea(planned: number | null, progress: number | null): number | null {
  return planned === null || progress === null ? null : (planned * progress) / 100;
}

export function jobSummaryOf(values: VacuumValues, known: JobRooms): Reading<JobSummary | null> {
  return readingOf(() => {
    const job = vacuumJob(values);
    if (job === null) {
      return null;
    }
    const rooms = jobRooms(job.rooms, known);
    const scope = scopeOf(rooms.length, job.zones.length);
    const progress = numberOf(values.vacuum_progress);
    const plannedAreaM2 = plannedArea(scope, rooms, known);
    return {
      scope,
      rooms,
      zoneCount: job.zones.length,
      title: jobTitle(scope, rooms, job.zones.length),
      plannedAreaM2,
      doneAreaM2: doneArea(plannedAreaM2, progress),
      progress,
      elapsedSeconds: numberOf(values.vacuum_seconds),
      passes: numberOf(values.vacuum_repeats),
    };
  });
}
