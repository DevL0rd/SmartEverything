import { open } from 'node:fs/promises';
import { openProbe } from '../../drive/metadata-read';
import { z } from 'zod';

const TRACK = z.record(z.string(), z.unknown());

const MEDIA_INFO_RESULT = z.object({ media: z.object({ track: z.array(TRACK) }) });

const EXTRA = z.record(z.string(), z.unknown()).catch({});

const COORDINATES = /(-?[\d.]+)°([NS]) (-?[\d.]+)°([EW])/u;

const HDR_TRANSFERS = ['HLG', 'PQ'] as const;

const FULL_TURN = 360;

export type HdrTransfer = (typeof HDR_TRANSFERS)[number];

export interface VideoTakenAt {
  readonly iso: string;
  readonly source: 'quicktime-offset' | 'quicktime-utc';
}

export interface VideoProbe {
  readonly durationSeconds: number;
  readonly container: string;
  readonly videoCodec: string | null;
  readonly profile: string | null;
  readonly bitDepth: number | null;
  readonly transfer: HdrTransfer | null;
  readonly hdrFormat: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly rotation: number;
  readonly frameRate: number | null;
  readonly audioCodec: string | null;
  readonly streamable: boolean;
  readonly takenAt: VideoTakenAt | null;
  readonly location: { readonly lat: number; readonly lon: number } | null;
  readonly liveId: string | null;
  readonly make: string | null;
  readonly model: string | null;
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOf(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = z.coerce.number().safeParse(value);
  return parsed.success && value !== '' ? parsed.data : null;
}

export function clockwiseRotation(reported: number | null): number {
  if (reported === null) return 0;
  return ((Math.round(reported) % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function transferOf(value: unknown): HdrTransfer | null {
  const reported = (textOf(value) ?? '').split(' / ');
  return HDR_TRANSFERS.find((known) => reported.includes(known)) ?? null;
}

function locationOf(text: string | null): VideoProbe['location'] {
  const match = COORDINATES.exec(text ?? '');
  if (match === null) return null;
  return {
    lat: Number(match[1]) * (match[2] === 'S' ? -1 : 1),
    lon: Number(match[3]) * (match[4] === 'W' ? -1 : 1),
  };
}

function takenAtOf(general: Record<string, unknown>): VideoTakenAt | null {
  const recorded = textOf(general['Recorded_Date']);
  if (recorded !== null) return { iso: recorded.replace(' ', 'T'), source: 'quicktime-offset' };
  const encoded = textOf(general['Encoded_Date']);
  if (encoded === null) return null;
  return { iso: `${encoded.replace(' UTC', '').replace(' ', 'T')}Z`, source: 'quicktime-utc' };
}

function trackOf(
  tracks: readonly Record<string, unknown>[],
  type: string,
): Record<string, unknown> {
  return tracks.find((track) => track['@type'] === type) ?? {};
}

export function readVideoProbe(result: unknown): VideoProbe {
  const tracks = MEDIA_INFO_RESULT.parse(result).media.track;
  const general = trackOf(tracks, 'General');
  const video = trackOf(tracks, 'Video');
  const audio = trackOf(tracks, 'Audio');
  const extra = EXTRA.parse(general['extra']);
  return {
    durationSeconds: numberOf(general['Duration']) ?? 0,
    container: textOf(general['Format']) ?? '',
    videoCodec: textOf(video['Format']),
    profile: textOf(video['Format_Profile']),
    bitDepth: numberOf(video['BitDepth']),
    transfer: transferOf(video['transfer_characteristics']),
    hdrFormat: textOf(video['HDR_Format']),
    width: numberOf(video['Width']),
    height: numberOf(video['Height']),
    rotation: clockwiseRotation(numberOf(video['Rotation'])),
    frameRate: numberOf(video['FrameRate']),
    audioCodec: textOf(audio['Format']),
    streamable: general['IsStreamable'] === 'Yes',
    takenAt: takenAtOf(general),
    location: locationOf(textOf(general['Recorded_Location'])),
    liveId: textOf(extra['com_apple_quicktime_content_identifier']),
    make: textOf(general['Encoded_Hardware_CompanyName']),
    model: textOf(general['Encoded_Hardware_Name']),
  };
}

export async function probeVideo(path: string): Promise<VideoProbe> {
  const handle = await open(path, 'r');
  const info = await openProbe();
  try {
    const { size } = await handle.stat();
    const result = await info.analyzeData(size, async (length, offset) => {
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await handle.read(chunk, 0, length, offset);
      return chunk.subarray(0, bytesRead);
    });
    return readVideoProbe(result);
  } finally {
    info.close();
    await handle.close();
  }
}
