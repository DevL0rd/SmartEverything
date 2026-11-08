import { createRequire } from 'node:module';
import type { FileHandle } from 'node:fs/promises';
import type { DriveItem } from '@smarteverything/domain';
import ExifReader from 'exifreader';
import mediaInfoFactory, { type MediaInfo } from 'mediainfo.js';
import { z } from 'zod';

type Visual = Extract<DriveItem, { readonly kind: 'image' }>;
type TimeSource = 'metadata' | 'container' | 'modified';

export interface Moment {
  readonly iso: string;
  readonly offsetMin: number | null;
  readonly source: TimeSource;
}

export interface MediaFacts {
  readonly takenAt: Moment | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly orientation: number | null;
  readonly camera: Visual['camera'];
  readonly exposure: Visual['exposure'];
  readonly place: Visual['place'];
  readonly durationMs: number | null;
}

const STILL_BRANDS: readonly string[] = [
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'mif1',
  'msf1',
  'avif',
];
const QUICKTIME_ZERO_DATE = '1904-01-01';
const APPLE_ROTATION_STEP = 90;
const HALF_TURN = 180;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS = 1000;

const MOMENT = z.iso.datetime({ offset: true });
const MOMENT_PARTS = z.object({
  date: z.string(),
  time: z.string(),
  zone: z.string().optional(),
});
const MOMENT_TEXT =
  /^(?<date>\d{4}-\d{2}-\d{2})[ T](?<time>\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(?<zone>UTC|Z|[+-]\d{2}:\d{2})?$/;

const TAG = z.looseObject({ value: z.unknown(), description: z.unknown() });
const TAG_GROUP = z.record(z.string(), TAG);
const STILL_TAGS = z.looseObject({
  exif: TAG_GROUP.optional(),
  file: TAG_GROUP.optional(),
  pngFile: TAG_GROUP.optional(),
  gps: z.looseObject({ Latitude: z.unknown(), Longitude: z.unknown() }).optional(),
});
type Group = z.infer<typeof TAG_GROUP>;

const TRACK = z.record(z.string(), z.unknown());
const TIMED_RESULT = z.object({ media: z.object({ track: z.array(TRACK) }) });
const RATIO = z.tuple([z.number(), z.number()]);
const POSITIVE_INT = z.int().positive();
const POSITIVE = z.number().positive();
const LATITUDE = z.number().min(-90).max(90);
const LONGITUDE = z.number().min(-180).max(180);
const ORIENTATION = z.int().min(1).max(8);

export const NOTHING: MediaFacts = {
  takenAt: null,
  width: null,
  height: null,
  orientation: null,
  camera: null,
  exposure: null,
  place: null,
  durationMs: null,
};

function text(value: unknown): string | null {
  const parsed = z.string().trim().min(1).safeParse(value);
  return parsed.success ? parsed.data : null;
}

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function numeric(value: unknown): number | null {
  const parsed = z.coerce.number().safeParse(scalar(value));
  return typeof scalar(value) !== 'boolean' && parsed.success ? parsed.data : null;
}

function ratio(value: unknown): number | null {
  const parsed = RATIO.safeParse(value);
  return parsed.success ? parsed.data[0] / parsed.data[1] : null;
}

function positive(value: number | null): number | null {
  const parsed = POSITIVE.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function wholePositive(value: number | null): number | null {
  const parsed = POSITIVE_INT.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function offsetMinutes(zone: string | undefined): number | null {
  if (zone === undefined) return null;
  if (zone === 'UTC' || zone === 'Z') return 0;
  const sign = zone.startsWith('-') ? -1 : 1;
  return sign * (Number(zone.slice(1, 3)) * MINUTES_PER_HOUR + Number(zone.slice(4, 6)));
}

export function momentOf(raw: string | null, source: TimeSource): Moment | null {
  const parts = MOMENT_PARTS.safeParse(MOMENT_TEXT.exec(raw ?? '')?.groups);
  if (!parts.success || parts.data.date === QUICKTIME_ZERO_DATE) return null;
  const { date, time, zone } = parts.data;
  const suffix = zone === undefined || zone === 'UTC' ? 'Z' : zone;
  const iso = `${date}T${time}${suffix}`;
  return MOMENT.safeParse(iso).success ? { iso, offsetMin: offsetMinutes(zone), source } : null;
}

function exifDate(value: string | null): string | null {
  return value === null ? null : value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
}

function descriptionOf(group: Group, name: string): string | null {
  return text(group[name]?.description);
}

function stillMoment(exif: Group): Moment | null {
  const local = exifDate(descriptionOf(exif, 'DateTimeOriginal'));
  if (local !== null) {
    const fraction = descriptionOf(exif, 'SubSecTimeOriginal');
    const offset = descriptionOf(exif, 'OffsetTimeOriginal');
    return momentOf(
      `${local}${fraction === null ? '' : `.${fraction}`}${offset ?? ''}`,
      'metadata',
    );
  }
  const date = exifDate(descriptionOf(exif, 'GPSDateStamp'));
  const time = descriptionOf(exif, 'GPSTimeStamp');
  return date === null || time === null ? null : momentOf(`${date} ${time} UTC`, 'metadata');
}

function stillSize(file: Group, exif: Group): Pick<MediaFacts, 'width' | 'height'> {
  return {
    width: wholePositive(numeric(file['Image Width']?.value ?? exif['ImageWidth']?.value)),
    height: wholePositive(numeric(file['Image Height']?.value ?? exif['ImageLength']?.value)),
  };
}

function stillCamera(exif: Group): MediaFacts['camera'] {
  const camera = {
    make: descriptionOf(exif, 'Make'),
    model: descriptionOf(exif, 'Model'),
    lens: descriptionOf(exif, 'LensModel'),
  };
  return Object.values(camera).every((one) => one === null) ? null : camera;
}

function stillExposure(exif: Group): MediaFacts['exposure'] {
  const exposure = {
    iso: positive(numeric(exif['ISOSpeedRatings']?.value)),
    aperture: positive(ratio(exif['FNumber']?.value)),
    shutter: positive(ratio(exif['ExposureTime']?.value)),
    focal: positive(ratio(exif['FocalLength']?.value)),
  };
  return Object.values(exposure).every((one) => one === null) ? null : exposure;
}

function placeOf(latitude: unknown, longitude: unknown): MediaFacts['place'] {
  const lat = LATITUDE.safeParse(latitude);
  const lon = LONGITUDE.safeParse(longitude);
  return lat.success && lon.success ? { lat: lat.data, lon: lon.data } : null;
}

export function readStill(data: Buffer): MediaFacts {
  const tags = STILL_TAGS.parse(ExifReader.load(data, { expanded: true }));
  const exif = tags.exif ?? {};
  const orientation = ORIENTATION.safeParse(numeric(exif['Orientation']?.value));
  return {
    ...NOTHING,
    takenAt: stillMoment(exif),
    ...stillSize({ ...tags.pngFile, ...tags.file }, exif),
    orientation: orientation.success ? orientation.data : null,
    camera: stillCamera(exif),
    exposure: stillExposure(exif),
    place: tags.gps === undefined ? null : placeOf(tags.gps.Latitude, tags.gps.Longitude),
  };
}

function coordinates(raw: string | null): MediaFacts['place'] {
  const match = /(-?[\d.]+)°([NS]) (-?[\d.]+)°([EW])/.exec(raw ?? '');
  if (match === null) return null;
  const latitude = Number(match[1]) * (match[2] === 'S' ? -1 : 1);
  const longitude = Number(match[3]) * (match[4] === 'W' ? -1 : 1);
  return placeOf(latitude, longitude);
}

function trackOf(
  tracks: readonly z.infer<typeof TRACK>[],
  ...types: string[]
): z.infer<typeof TRACK> {
  return tracks.find((one) => types.includes(String(one['@type']))) ?? {};
}

function containerMoment(general: z.infer<typeof TRACK>): Moment | null {
  return (
    momentOf(text(general['Recorded_Date']), 'container') ??
    momentOf(text(general['Encoded_Date']), 'container')
  );
}

function displaySize(visual: z.infer<typeof TRACK>): Pick<MediaFacts, 'width' | 'height'> {
  const width = wholePositive(numeric(visual['Width']));
  const height = wholePositive(numeric(visual['Height']));
  const quarter = Math.abs(numeric(visual['Rotation']) ?? 0) % HALF_TURN === APPLE_ROTATION_STEP;
  return quarter ? { width: height, height: width } : { width, height };
}

export function readTimed(result: unknown): MediaFacts {
  const tracks = TIMED_RESULT.parse(result).media.track;
  const general = trackOf(tracks, 'General');
  const seconds = numeric(general['Duration']);
  return {
    ...NOTHING,
    takenAt: containerMoment(general),
    ...displaySize(trackOf(tracks, 'Video', 'Image')),
    place: coordinates(text(general['Recorded_Location'])),
    durationMs: seconds === null || seconds < 0 ? null : Math.round(seconds * MILLISECONDS),
  };
}

export type Route = 'still' | 'timed';

const STILL_PREFIXES: readonly (readonly number[])[] = [
  [0xff, 0xd8, 0xff],
  [0x89, 0x50, 0x4e, 0x47],
  [0x49, 0x49, 0x2a, 0x00],
  [0x4d, 0x4d, 0x00, 0x2a],
  [0x47, 0x49, 0x46, 0x38],
];

function startsWith(head: Buffer, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => head[index] === byte);
}

function isWebp(head: Buffer): boolean {
  return head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP';
}

function isStillBox(head: Buffer): boolean {
  return (
    head.toString('latin1', 4, 8) === 'ftyp' &&
    STILL_BRANDS.includes(head.toString('latin1', 8, 12))
  );
}

export function routeOf(head: Buffer): Route {
  const still =
    STILL_PREFIXES.some((prefix) => startsWith(head, prefix)) || isWebp(head) || isStillBox(head);
  return still ? 'still' : 'timed';
}

const WASM = createRequire(import.meta.url).resolve('mediainfo.js/MediaInfoModule.wasm');

export function openProbe(): Promise<MediaInfo> {
  return mediaInfoFactory({ format: 'object', locateFile: () => WASM });
}

export class TimedProbe {
  private instance: MediaInfo | null = null;

  async analyze(handle: FileHandle, size: number): Promise<unknown> {
    this.instance ??= await openProbe();
    try {
      return await this.instance.analyzeData(size, async (length, offset) => {
        const chunk = Buffer.alloc(length);
        const { bytesRead } = await handle.read(chunk, 0, length, offset);
        return chunk.subarray(0, bytesRead);
      });
    } catch (cause) {
      this.close();
      throw cause;
    }
  }

  close(): void {
    this.instance?.close();
    this.instance = null;
  }
}
