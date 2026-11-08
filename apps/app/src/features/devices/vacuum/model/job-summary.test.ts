import { describe, expect, it } from 'vitest';
import { jobSummaryOf, type JobRooms, type JobSummary } from './job-summary';

const ROOMS: JobRooms = [
  { id: 3, name: 'Kitchen', areaM2: 12, hidden: false },
  { id: 4, name: 'Hall', areaM2: 8, hidden: false },
  { id: 5, name: 'Study', areaM2: 20, hidden: false },
  { id: 6, name: 'Attic', areaM2: 50, hidden: true },
];

function summary(
  values: Parameters<typeof jobSummaryOf>[0],
  rooms: JobRooms = ROOMS,
): JobSummary | null {
  const reading = jobSummaryOf(values, rooms);
  if (!reading.ok) {
    throw new Error(reading.problem);
  }
  return reading.value;
}

describe('job summary', () => {
  it('has nothing to say without a job reading', () => {
    expect(summary({ vacuum_status: 4 })).toBeNull();
  });

  it('describes a whole-home job with the visible rooms as planned area', () => {
    expect(summary({ vacuum_job: '{}', vacuum_progress: 50 })).toMatchObject({
      scope: 'home',
      title: 'Whole home',
      plannedAreaM2: 40,
      doneAreaM2: 20,
      progress: 50,
    });
  });

  it('describes a room job in the order the robot reports it', () => {
    const job = summary({
      vacuum_job: JSON.stringify({ rooms: [5, 3] }),
      vacuum_progress: 25,
      vacuum_seconds: 600,
      vacuum_repeats: 2,
    });
    expect(job).toMatchObject({
      scope: 'rooms',
      title: 'Study, Kitchen',
      plannedAreaM2: 32,
      doneAreaM2: 8,
      elapsedSeconds: 600,
      passes: 2,
    });
    expect(job?.rooms.map((room) => room.id)).toStrictEqual([5, 3]);
  });

  it('shortens the title after two rooms', () => {
    expect(summary({ vacuum_job: JSON.stringify({ rooms: [3, 4, 5] }) })?.title).toBe(
      'Kitchen, Hall +1',
    );
  });

  it('counts zones and mixed jobs and gives no planned area for zones', () => {
    const zones = JSON.stringify({ zones: [[0, 0, 1, 1]] });
    expect(summary({ vacuum_job: zones })).toMatchObject({
      scope: 'zones',
      title: '1 zone',
      plannedAreaM2: null,
    });
    const two = JSON.stringify({
      zones: [
        [0, 0, 1, 1],
        [2, 2, 3, 3],
      ],
      rooms: [4],
    });
    expect(summary({ vacuum_job: two })).toMatchObject({
      scope: 'mixed',
      title: 'Hall and 2 zones',
    });
  });

  it('names a room that is not on the map and gives no planned area then', () => {
    expect(summary({ vacuum_job: JSON.stringify({ rooms: [9] }) })).toMatchObject({
      title: 'Room 9',
      plannedAreaM2: null,
      doneAreaM2: null,
    });
    expect(summary({ vacuum_job: '{}' }, [])).toMatchObject({ plannedAreaM2: null });
  });

  it('reports an unreadable job as a problem instead of throwing', () => {
    const reading = jobSummaryOf({ vacuum_job: 'nope' }, ROOMS);
    expect(reading.ok).toBe(false);
  });
});
