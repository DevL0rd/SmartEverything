import { TONE_MAP } from '../pipeline/playable';
import type { VideoProbe } from '../pipeline/probe';

export const CONTAINERS = {
  '.mp4': { format: 'mp4', extension: '.mp4' },
  '.m4v': { format: 'mp4', extension: '.m4v' },
  '.mov': { format: 'mov', extension: '.mov' },
  '.mkv': { format: 'matroska', extension: '.mkv' },
} as const;

export const FALLBACK_CONTAINER = CONTAINERS['.mp4'];

const BT709_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];

const DETECT = 'vidstabdetect=stepsize=6:shakiness=8:accuracy=9';

const TRANSFORM = 'smoothing=30:optzoom=1';

const SHARPEN = 'unsharp=5:5:0.8:3:3:0.4';

export interface VideoPlan {
  readonly source: string;
  readonly target: string;
  readonly transforms: string;
  readonly format: string;
  readonly trim: { readonly startMs: number; readonly endMs: number } | null;
  readonly stabilize: boolean;
  readonly toneMap: boolean;
}

export function toneMapped(probe: Pick<VideoProbe, 'transfer'>): boolean {
  return probe.transfer !== null;
}

export function lengthSeconds(
  plan: Pick<VideoPlan, 'trim'>,
  probe: Pick<VideoProbe, 'durationSeconds'>,
): number {
  return plan.trim === null ? probe.durationSeconds : (plan.trim.endMs - plan.trim.startMs) / 1000;
}

function inputArguments(plan: VideoPlan): readonly string[] {
  const { trim } = plan;
  return [
    '-y',
    '-v',
    'error',
    '-nostats',
    '-progress',
    'pipe:1',
    ...(trim === null ? [] : ['-ss', String(trim.startMs / 1000)]),
    '-i',
    plan.source,
    ...(trim === null ? [] : ['-t', String((trim.endMs - trim.startMs) / 1000)]),
  ];
}

export function detectArguments(plan: VideoPlan): readonly string[] {
  return [
    ...inputArguments(plan),
    '-an',
    '-vf',
    `${DETECT}:result=${plan.transforms}`,
    '-f',
    'null',
    '-',
  ];
}

function filtersOf(plan: VideoPlan): string {
  const chain = [
    ...(plan.stabilize ? [`vidstabtransform=input=${plan.transforms}:${TRANSFORM}`, SHARPEN] : []),
    ...(plan.toneMap ? [TONE_MAP] : []),
  ];
  return chain.join(',');
}

export function encodeArguments(plan: VideoPlan): readonly string[] {
  const filters = filtersOf(plan);
  return [
    ...inputArguments(plan),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    ...(filters === '' ? [] : ['-vf', filters]),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    ...(plan.toneMap ? BT709_TAGS : []),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-f',
    plan.format,
    plan.target,
  ];
}
