import { spawn } from 'node:child_process';
import { messageOf } from '@smarteverything/logging';
import sharp from 'sharp';
import { ffmpegPath, vaapiDevice } from '../../media/ffmpeg-path';
import { UNLIMITED_PIXELS } from '../../media/sharp-input';
import { RGB_CHANNELS, type RgbImage } from '../../vision/faces/image';
import { DERIVED_LONG_EDGE } from './derived-paths';
import { sourceWithProfile } from './heic';
import type { DecodedSource, PreviewFile } from './preview';

const HEIF_GROUP_MIMES: ReadonlySet<string> = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEADER_END = 'ENDHDR\n';

const WIDTH = /WIDTH (\d+)/u;

const HEIGHT = /HEIGHT (\d+)/u;

const MAX_STDERR = 400;

export type GpuOutcome =
  | { readonly kind: 'decoded'; readonly source: DecodedSource }
  | { readonly kind: 'declined'; readonly reason: string };

const ORIENTATION_FILTERS: Readonly<Record<number, string>> = {
  2: 'hflip',
  3: 'hflip,vflip',
  4: 'vflip',
  5: 'transpose=0',
  6: 'transpose=1',
  7: 'transpose=3',
  8: 'transpose=2',
};

export function vaapiScale(edge: number, orientation: number | undefined): string {
  const upright = orientation === undefined ? undefined : ORIENTATION_FILTERS[orientation];
  return [
    `scale_vaapi=w=${String(edge)}:h=${String(edge)}:force_original_aspect_ratio=decrease:format=nv12`,
    'hwdownload',
    'format=nv12',
    'format=rgba',
    ...(upright === undefined ? [] : [upright]),
  ].join(',');
}

function deviceArguments(device: string): readonly string[] {
  return ['-init_hw_device', `vaapi=va:${device}`, '-hwaccel', 'vaapi', '-hwaccel_device', 'va'];
}

export function vaapiDecodeArguments(
  file: Pick<PreviewFile, 'path' | 'mime'>,
  device: string,
  edge: number,
  orientation: number | undefined,
): readonly string[] {
  const grouped = HEIF_GROUP_MIMES.has(file.mime);
  const input = grouped
    ? [
        ...deviceArguments(device),
        '-i',
        file.path,
        '-filter_complex',
        `[0:g:0]scale=${String(edge)}:${String(edge)}:force_original_aspect_ratio=decrease,format=rgba[out]`,
        '-map',
        '[out]',
      ]
    : [
        ...deviceArguments(device),
        '-hwaccel_output_format',
        'vaapi',
        '-i',
        file.path,
        '-vf',
        vaapiScale(edge, orientation),
      ];
  return [
    '-v',
    'error',
    '-nostdin',
    ...input,
    '-frames:v',
    '1',
    '-f',
    'image2pipe',
    '-c:v',
    'pam',
    'pipe:1',
  ];
}

function decodeWith(args: readonly string[], signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), [...args], { signal, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let errors = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (errors.length < MAX_STDERR) errors += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with ${String(code)}: ${errors.trim()}`));
    });
  });
}

export function parsePam(buffer: Buffer): { width: number; height: number; data: Uint8Array } {
  const marker = buffer.indexOf(HEADER_END);
  if (marker < 0) throw new Error('ffmpeg wrote no image');
  const header = buffer.subarray(0, marker).toString('latin1');
  const width = WIDTH.exec(header)?.[1];
  const height = HEIGHT.exec(header)?.[1];
  if (width === undefined || height === undefined)
    throw new Error('ffmpeg wrote a malformed image');
  return {
    width: Number(width),
    height: Number(height),
    data: buffer.subarray(marker + HEADER_END.length),
  };
}

export async function decodeOnGpu(file: PreviewFile, signal: AbortSignal): Promise<GpuOutcome> {
  const device = vaapiDevice();
  if (device === null) throw new Error('No VAAPI device is configured.');
  try {
    const orientation = HEIF_GROUP_MIMES.has(file.mime)
      ? undefined
      : (await sharp(file.path, UNLIMITED_PIXELS).metadata()).orientation;
    const pixels = parsePam(
      await decodeWith(
        vaapiDecodeArguments(file, device, DERIVED_LONG_EDGE.preview, orientation),
        signal,
      ),
    );
    return {
      kind: 'decoded',
      source: await sourceWithProfile(file.path, { kind: 'pixels', ...pixels }),
    };
  } catch (cause) {
    if (signal.aborted) throw cause;
    return { kind: 'declined', reason: messageOf(cause) };
  }
}

export async function rgbOnGpu(
  file: PreviewFile,
  signal: AbortSignal,
): Promise<RgbImage | { readonly declined: string }> {
  const outcome = await decodeOnGpu(file, signal);
  if (outcome.kind === 'declined') return { declined: outcome.reason };
  if (outcome.source.kind !== 'pixels') throw new Error('The GPU decode returned encoded data.');
  const { data, info } = await sharp(outcome.source.data, {
    ...UNLIMITED_PIXELS,
    raw: { width: outcome.source.width, height: outcome.source.height, channels: 4 },
  })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== RGB_CHANNELS)
    throw new Error(`Expected ${String(RGB_CHANNELS)} channels, decoded ${String(info.channels)}.`);
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}
