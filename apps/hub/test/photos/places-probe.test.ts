import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const placeSchema = z.object({ id: z.number(), lat: z.number(), lon: z.number() });
type Place = z.infer<typeof placeSchema>;
type Point = readonly [number, number];

const PLACE_COUNT = 100_000;
const QUERY_COUNT = 3_000;
const WINDOWS = [0.25, 1, 4, 16, 64, 180] as const;

const generator = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const lonFactor = (lat: number): number => Math.max(Math.cos((lat * Math.PI) / 180), 0.05);

const distance = (lat: number, lon: number, place: Place): number => {
  const dx = (((place.lon - lon + 540) % 360) - 180) * lonFactor(lat);
  const dy = place.lat - lat;
  return Math.sqrt(dx * dx + dy * dy);
};

const nearestOf = (lat: number, lon: number, places: readonly Place[]): Place | null => {
  let best: Place | null = null;
  let bestDistance = Infinity;
  for (const place of places) {
    const candidate = distance(lat, lon, place);
    if (candidate < bestDistance) {
      best = place;
      bestDistance = candidate;
    }
  }
  return best;
};

const makePlaces = (random: () => number): readonly Place[] => {
  const centres: Point[] = Array.from({ length: 400 }, () => [
    random() * 140 - 60,
    random() * 340 - 170,
  ]);
  return Array.from({ length: PLACE_COUNT }, (_unused, index) => {
    const centre = centres[Math.floor(random() * centres.length)] ?? [0, 0];
    const lat = Math.max(-89, Math.min(89, centre[0] + (random() - 0.5) * 12));
    const lon = Math.max(-179.9, Math.min(179.9, centre[1] + (random() - 0.5) * 12));
    return { id: index + 1, lat, lon };
  });
};

const makeQueries = (random: () => number, places: readonly Place[]): readonly Point[] =>
  Array.from({ length: QUERY_COUNT }, () => {
    const place = places[Math.floor(random() * places.length)];
    if (place !== undefined && random() < 0.9) {
      return [place.lat + (random() - 0.5) * 0.4, place.lon + (random() - 0.5) * 0.4];
    }
    return [random() * 160 - 80, random() * 340 - 170];
  });

const openDatabase = (places: readonly Place[]): DatabaseSync => {
  const database = new DatabaseSync(':memory:');
  database.exec(
    'create table place(id integer primary key, lat real not null, lon real not null);' +
      'create virtual table place_rt using rtree(id, minlat, maxlat, minlon, maxlon);' +
      'create index place_lat on place(lat);',
  );
  const insertPlace = database.prepare('insert into place values(?, ?, ?)');
  const insertBox = database.prepare('insert into place_rt values(?, ?, ?, ?, ?)');
  database.exec('begin');
  for (const place of places) {
    insertPlace.run(place.id, place.lat, place.lon);
    insertBox.run(place.id, place.lat, place.lat, place.lon, place.lon);
  }
  database.exec('commit');
  return database;
};

const rtreeNearest = (database: DatabaseSync): ((lat: number, lon: number) => Place | null) => {
  const window = database.prepare(
    'select p.id, p.lat, p.lon from place_rt r join place p on p.id = r.id ' +
      'where r.minlat <= ? and r.maxlat >= ? and r.minlon <= ? and r.maxlon >= ?',
  );
  const within = (lat: number, lon: number, radius: number): readonly Place[] => {
    const span = radius / lonFactor(lat);
    return window
      .all(lat + radius, lat - radius, lon + span, lon - span)
      .map((row) => placeSchema.parse(row));
  };
  return (lat, lon) => {
    for (const radius of WINDOWS) {
      const first = nearestOf(lat, lon, within(lat, lon, radius));
      if (first === null) continue;
      const found = distance(lat, lon, first);
      if (found <= radius) return first;
      return nearestOf(lat, lon, within(lat, lon, found));
    }
    return null;
  };
};

const latitudeIndexNearest = (
  database: DatabaseSync,
): ((lat: number, lon: number) => Place | null) => {
  const band = database.prepare('select id, lat, lon from place where lat between ? and ?');
  return (lat, lon) => {
    for (const radius of WINDOWS) {
      const span = radius / lonFactor(lat);
      const hits = band
        .all(lat - radius, lat + radius)
        .map((row) => placeSchema.parse(row))
        .filter((place) => Math.abs(place.lon - lon) <= span);
      const best = nearestOf(lat, lon, hits);
      if (best !== null && distance(lat, lon, best) <= radius) return best;
    }
    return null;
  };
};

describe('places probe', () => {
  const random = generator(7);
  const places = makePlaces(random);
  const queries = makeQueries(random, places);
  const database = openDatabase(places);

  it('has R*Tree compiled into node:sqlite', () => {
    const options = database
      .prepare('pragma compile_options')
      .all()
      .flatMap((row) => Object.values(row));
    expect(options).toContain('ENABLE_RTREE');
    const count = z
      .object({ total: z.number() })
      .parse(database.prepare('select count(*) as total from place_rt').get());
    expect(count.total).toBe(PLACE_COUNT);
  });

  it('finds the exact nearest place through the R*Tree window', () => {
    const nearest = rtreeNearest(database);
    for (const [lat, lon] of queries.slice(0, 300)) {
      const expected = nearestOf(lat, lon, places);
      const actual = nearest(lat, lon);
      expect(actual).not.toBeNull();
      if (expected === null || actual === null) continue;
      expect(distance(lat, lon, actual)).toBeCloseTo(distance(lat, lon, expected), 9);
    }
  });

  it('agrees between the R*Tree window and the latitude index', () => {
    const viaRtree = rtreeNearest(database);
    const viaIndex = latitudeIndexNearest(database);
    for (const [lat, lon] of queries) {
      const a = viaRtree(lat, lon);
      const b = viaIndex(lat, lon);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      if (a === null || b === null) continue;
      expect(distance(lat, lon, a)).toBeCloseTo(distance(lat, lon, b), 9);
    }
  });
});
