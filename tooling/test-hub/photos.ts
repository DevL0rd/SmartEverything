import { copyFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { HOUR_MS, daysAgo } from './clock.ts';
import type { Counted, FilesContext, PersonRef } from './context.ts';
import { layoutOf } from './layout.ts';
import { writeJpeg, writePng, writeVideo, type Place, type Shot } from './media.ts';
import type { Random } from './random.ts';

const HOME: Place = { name: 'Home', latitude: 51.5074, longitude: -0.1278 };

interface Trip {
  readonly place: Place;
  readonly startDaysAgo: number;
  readonly days: number;
  readonly shots: number;
}

const TRIPS: readonly Trip[] = [
  {
    place: { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
    startDaysAgo: 700,
    days: 6,
    shots: 26,
  },
  {
    place: { name: 'Paris', latitude: 48.8566, longitude: 2.3522 },
    startDaysAgo: 580,
    days: 4,
    shots: 18,
  },
  {
    place: { name: 'Lisbon', latitude: 38.7223, longitude: -9.1393 },
    startDaysAgo: 430,
    days: 5,
    shots: 20,
  },
  {
    place: { name: 'Alps', latitude: 46.8182, longitude: 8.2275 },
    startDaysAgo: 270,
    days: 4,
    shots: 18,
  },
  {
    place: { name: 'Coast', latitude: 50.7192, longitude: -1.8808 },
    startDaysAgo: 120,
    days: 3,
    shots: 16,
  },
];

const CAMERAS: readonly (readonly [string, string])[] = [
  ['Google', 'Pixel 9'],
  ['Samsung', 'Galaxy S25'],
  ['SynthCam', 'Test 1'],
];

const SIZES: readonly (readonly [number, number])[] = [
  [1280, 960],
  [960, 1280],
  [1600, 900],
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function stamp(moment: Date): string {
  const text = moment.toISOString();
  return `${text.slice(0, 4)}${text.slice(5, 7)}${text.slice(8, 10)}_${text.slice(11, 13)}${text.slice(14, 16)}${text.slice(17, 19)}`;
}

function shotAt(rng: Random, takenAt: Date, place: Place | null): Shot {
  const [make, model] = rng.pick(CAMERAS);
  const [width, height] = rng.pick(SIZES);
  return { takenAt, place, make, model, width, height, hue: rng.int(0, 359) };
}

function moments(
  context: FilesContext,
  rng: Random,
  scale: number,
): { takenAt: Date; place: Place | null }[] {
  const { anchor } = context;
  const list: { takenAt: Date; place: Place | null }[] = [];
  for (const trip of TRIPS) {
    const count = Math.max(2, Math.round(trip.shots * scale));
    for (let index = 0; index < count; index += 1) {
      const day = trip.startDaysAgo - rng.int(0, trip.days - 1);
      list.push({
        takenAt: new Date(daysAgo(anchor, day).getTime() + rng.float(8, 21) * HOUR_MS),
        place: trip.place,
      });
    }
  }
  const everyday = Math.round(110 * scale);
  for (let index = 0; index < everyday; index += 1) {
    const day = rng.int(1, 720);
    list.push({
      takenAt: new Date(daysAgo(anchor, day).getTime() + rng.float(7, 22) * HOUR_MS),
      place: rng.chance(0.75) ? HOME : null,
    });
  }
  return list.filter((entry) => entry.takenAt.getTime() < anchor.now.getTime() - HOUR_MS);
}

interface Roll {
  readonly root: string;
  readonly rng: Random;
  readonly context: FilesContext;
}

function monthFolder(root: string, at: Date): string {
  return join(root, 'Camera', String(at.getUTCFullYear()), pad(at.getUTCMonth() + 1));
}

async function writePictures(roll: Roll, scale: number): Promise<number> {
  const { root, rng, context } = roll;
  const list = moments(context, rng, scale).sort(
    (a, b) => a.takenAt.getTime() - b.takenAt.getTime(),
  );
  for (const entry of list) {
    const path = join(monthFolder(root, entry.takenAt), `IMG_${stamp(entry.takenAt)}.jpg`);
    await writeJpeg(path, shotAt(rng, entry.takenAt, entry.place), entry.place?.name ?? 'Photo');
  }
  return list.length;
}

async function writeDuplicates(roll: Roll): Promise<number> {
  const { root, rng, context } = roll;
  let count = 0;
  const first = moments(context, rng, 0.1).slice(0, 6);
  for (const entry of first) {
    const path = join(monthFolder(root, entry.takenAt), `IMG_${stamp(entry.takenAt)}.jpg`);
    await writeJpeg(path, shotAt(rng, entry.takenAt, entry.place), 'Duplicate');
    const copy = path.replace(/\.jpg$/u, ' (1).jpg');
    await copyFile(path, copy);
    await utimes(copy, entry.takenAt, entry.takenAt);
    count += 1;
  }
  return count;
}

async function writeScreenshots(roll: Roll, scale: number): Promise<number> {
  const { root, rng, context } = roll;
  const count = Math.round(8 * scale);
  for (let index = 0; index < count; index += 1) {
    const at = new Date(
      daysAgo(context.anchor, rng.int(2, 400)).getTime() + rng.float(8, 22) * HOUR_MS,
    );
    const shot = { ...shotAt(rng, at, null), width: 720, height: 1280 };
    await writePng(
      join(root, 'Screenshots', `Screenshot_${stamp(at)}.png`),
      shot,
      'Screenshot',
      at,
    );
  }
  return count;
}

async function writeClips(roll: Roll, count: number): Promise<number> {
  const { root, rng, context } = roll;
  for (let index = 0; index < count; index += 1) {
    const at = new Date(
      daysAgo(context.anchor, rng.int(3, 600)).getTime() + rng.float(8, 21) * HOUR_MS,
    );
    await writeVideo(join(monthFolder(root, at), `VID_${stamp(at)}.mp4`), at, 2, 15);
  }
  return count;
}

async function personPhotos(
  context: FilesContext,
  person: PersonRef,
  scale: number,
  videos: number,
): Promise<{ photos: number; videos: number; screenshots: number; duplicates: number }> {
  const root = join(layoutOf(context.paths).person(person.id).drive, 'Photos');
  const roll: Roll = { root, rng: context.rng(`photos-${person.id}`), context };
  return {
    photos: await writePictures(roll, scale),
    duplicates: await writeDuplicates(roll),
    screenshots: await writeScreenshots(roll, scale),
    videos: await writeClips(roll, videos),
  };
}

export async function writePhotoFiles(context: FilesContext): Promise<Counted> {
  const totals = { photos: 0, videos: 0, screenshots: 0, duplicates: 0, ownerLibrary: 0 };
  const scales = [1, 0.35, 0.22];
  const clips = [6, 2, 1];
  for (const [index, person] of context.people.entries()) {
    const result = await personPhotos(context, person, scales[index] ?? 0.2, clips[index] ?? 1);
    totals.photos += result.photos;
    totals.videos += result.videos;
    totals.screenshots += result.screenshots;
    totals.duplicates += result.duplicates;
    if (index === 0)
      totals.ownerLibrary =
        result.photos + result.videos + result.screenshots + result.duplicates * 2;
  }
  return totals;
}
