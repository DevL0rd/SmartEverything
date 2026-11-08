import { z } from 'zod';

const APPLE_MAKER_NOTE_HEADER = 14;
const CONTENT_IDENTIFIER_TAG = 0x11;

export const Tag = z.object({ value: z.unknown(), description: z.unknown() }).loose();
export const Tags = z
  .object({
    exif: z.record(z.string(), Tag).optional(),
    file: z.record(z.string(), Tag).optional(),
    pngFile: z.record(z.string(), Tag).optional(),
    xmp: z.object({ _raw: z.string().optional() }).loose().optional(),
    gps: z
      .object({ Latitude: z.number(), Longitude: z.number(), Altitude: z.number().optional() })
      .optional(),
  })
  .loose();
export const Track = z.record(z.string(), z.unknown());
export const MediaInfoResult = z.object({ media: z.object({ track: z.array(Track) }) });
export const Rational = z.tuple([z.number(), z.number()]);
export const ExifReaderModule = z.object({
  load: z.custom<(data: Buffer, options: object) => unknown>(),
});
export const ExifToolModule = z.object({ exiftool: z.custom<ExifToolHandle>() });

export interface MediaInfo {
  readonly analyzeData: (
    size: number,
    read: (length: number, offset: number) => Uint8Array,
  ) => Promise<unknown>;
  readonly close: () => void;
}
export interface ExifToolHandle {
  readonly read: (path: string) => Promise<Record<string, unknown>>;
  readonly end: () => Promise<void>;
}

export interface TakenAt {
  readonly iso: string;
  readonly source: 'exif-offset' | 'exif-local' | 'gps-utc' | 'quicktime-offset' | 'quicktime-utc';
}
export interface ImageFacts {
  readonly takenAt: TakenAt | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly lens: string | null;
  readonly exposure: {
    readonly time: string | null;
    readonly fNumber: number | null;
    readonly iso: number | null;
    readonly focalMm: number | null;
  };
  readonly gps: { readonly lat: number; readonly lon: number; readonly alt: number | null } | null;
  readonly orientation: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly liveId: string | null;
  readonly motionClip: { readonly offset: number; readonly length: number } | null;
}
export interface VideoFacts {
  readonly durationSeconds: number;
  readonly container: string;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly rotation: number | null;
  readonly frameRate: number | null;
  readonly takenAt: TakenAt | null;
  readonly gps: { readonly lat: number; readonly lon: number } | null;
  readonly liveId: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly faststart: boolean;
}

function texts(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numbers(value: unknown): number | null {
  const parsed = z.coerce.number().safeParse(value);
  return typeof value !== 'boolean' && value !== null && parsed.success ? parsed.data : null;
}

function rational(tag: z.infer<typeof Tag> | undefined): number | null {
  const parsed = Rational.safeParse(tag?.value);
  return parsed.success ? parsed.data[0] / parsed.data[1] : null;
}

function descriptionOf(tag: z.infer<typeof Tag> | undefined): string | null {
  return texts(tag?.description);
}

function appleContentIdentifier(tag: z.infer<typeof Tag> | undefined): string | null {
  const parsed = z.array(z.number()).safeParse(tag?.value);
  if (!parsed.success) return null;
  const bytes = Buffer.from(parsed.data);
  if (bytes.toString('latin1', 0, 9) !== 'Apple iOS') return null;
  const entries = bytes.readUInt16BE(APPLE_MAKER_NOTE_HEADER);
  for (let index = 0; index < entries; index++) {
    const entry = APPLE_MAKER_NOTE_HEADER + 2 + index * 12;
    if (bytes.readUInt16BE(entry) !== CONTENT_IDENTIFIER_TAG) continue;
    const length = bytes.readUInt32BE(entry + 4);
    const offset = bytes.readUInt32BE(entry + 8);
    return bytes.toString('latin1', offset, offset + length - 1);
  }
  return null;
}

function imageTakenAt(
  exif: Record<string, z.infer<typeof Tag>>,
  gpsDate: string | null,
  gpsTime: string | null,
): TakenAt | null {
  const local = descriptionOf(exif['DateTimeOriginal']);
  const offset = descriptionOf(exif['OffsetTimeOriginal']);
  const sub = descriptionOf(exif['SubSecTimeOriginal']);
  if (local !== null) {
    const iso = local.replace(':', '-').replace(':', '-').replace(' ', 'T');
    const fraction = sub === null ? '' : `.${sub}`;
    return offset === null
      ? { iso: `${iso}${fraction}`, source: 'exif-local' }
      : { iso: `${iso}${fraction}${offset}`, source: 'exif-offset' };
  }
  if (gpsDate === null || gpsTime === null) return null;
  return { iso: `${gpsDate.replace(':', '-').replace(':', '-')}T${gpsTime}Z`, source: 'gps-utc' };
}

export function motionClip(raw: string | undefined, size: number): ImageFacts['motionClip'] {
  const match = /Semantic="MotionPhoto"[^>]*Length="(\d+)"/.exec(raw ?? '');
  const length = match === null ? 0 : Number(match[1]);
  return length > 0 ? { offset: size - length, length } : null;
}

function exposureOf(exif: Record<string, z.infer<typeof Tag>>): ImageFacts['exposure'] {
  return {
    time: descriptionOf(exif['ExposureTime']),
    fNumber: rational(exif['FNumber']),
    iso: numbers(exif['ISOSpeedRatings']?.value),
    focalMm: rational(exif['FocalLength']),
  };
}

function gpsOf(gps: z.infer<typeof Tags>['gps']): ImageFacts['gps'] {
  return gps === undefined
    ? null
    : { lat: gps.Latitude, lon: gps.Longitude, alt: gps.Altitude ?? null };
}

function sizeOf(
  file: Record<string, z.infer<typeof Tag>>,
  exif: Record<string, z.infer<typeof Tag>>,
): Pick<ImageFacts, 'width' | 'height'> {
  return {
    width: numbers(file['Image Width']?.value ?? exif['ImageWidth']?.value),
    height: numbers(file['Image Height']?.value ?? exif['ImageLength']?.value),
  };
}

export function readImage(reader: z.infer<typeof ExifReaderModule>, data: Buffer): ImageFacts {
  const tags = Tags.parse(reader.load(data, { expanded: true }));
  const exif = tags.exif ?? {};
  const file = { ...tags.pngFile, ...tags.file };
  return {
    takenAt: imageTakenAt(
      exif,
      descriptionOf(exif['GPSDateStamp']),
      descriptionOf(exif['GPSTimeStamp']),
    ),
    make: descriptionOf(exif['Make']),
    model: descriptionOf(exif['Model']),
    lens: descriptionOf(exif['LensModel']),
    exposure: exposureOf(exif),
    gps: gpsOf(tags.gps),
    orientation: numbers(exif['Orientation']?.value),
    ...sizeOf(file, exif),
    liveId: appleContentIdentifier(exif['MakerNote']),
    motionClip: motionClip(tags.xmp?._raw, data.length),
  };
}

function coordinates(text: string | null): { lat: number; lon: number } | null {
  const match = /(-?[\d.]+)°([NS]) (-?[\d.]+)°([EW])/.exec(text ?? '');
  if (match === null) return null;
  const lat = Number(match[1]) * (match[2] === 'S' ? -1 : 1);
  const lon = Number(match[3]) * (match[4] === 'W' ? -1 : 1);
  return { lat, lon };
}

function videoTakenAt(general: Record<string, unknown>): TakenAt | null {
  const recorded = texts(general['Recorded_Date']);
  if (recorded !== null) {
    return { iso: recorded.replace(' ', 'T'), source: 'quicktime-offset' };
  }
  const encoded = texts(general['Encoded_Date']);
  if (encoded === null) return null;
  return { iso: `${encoded.replace(' UTC', '').replace(' ', 'T')}Z`, source: 'quicktime-utc' };
}

export function readVideo(result: unknown): VideoFacts {
  const tracks = MediaInfoResult.parse(result).media.track;
  const general = tracks.find((track) => track['@type'] === 'General') ?? {};
  const video = tracks.find((track) => track['@type'] === 'Video') ?? {};
  const audio = tracks.find((track) => track['@type'] === 'Audio') ?? {};
  const extra = z.record(z.string(), z.unknown()).catch({}).parse(general['extra']);
  return {
    durationSeconds: numbers(general['Duration']) ?? 0,
    container: texts(general['Format']) ?? '',
    videoCodec: texts(video['Format']),
    audioCodec: texts(audio['Format']),
    width: numbers(video['Width']),
    height: numbers(video['Height']),
    rotation: numbers(video['Rotation']),
    frameRate: numbers(video['FrameRate']),
    takenAt: videoTakenAt(general),
    gps: coordinates(texts(general['Recorded_Location'])),
    liveId: texts(extra['com_apple_quicktime_content_identifier']),
    make: texts(general['Encoded_Hardware_CompanyName']),
    model: texts(general['Encoded_Hardware_Name']),
    faststart: general['IsStreamable'] === 'Yes',
  };
}
