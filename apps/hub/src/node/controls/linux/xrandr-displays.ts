import type { DisplayMode, DisplayOutput } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import {
  roundRefresh,
  type BackendChange,
  type DisplayBackend,
  type DisplayRestore,
} from './display-backend';

const PROGRAM = 'xrandr';
const BUILT_IN = /^(eDP|LVDS|DSI)/;
const OUTPUT_LINE =
  /^(\S+) connected(?: (primary))?(?: (\d+)x(\d+)\+(-?\d+)\+(-?\d+))?(?: (normal|left|inverted|right))? \(/;
const MODE_LINE = /^\s+(\d+)x(\d+)\S*\s+(.*)$/;
const RATE = /(\d+(?:\.\d+)?)([*+]*)/g;

const ROTATION_OF_WORD: Readonly<Record<string, DisplayOutput['rotation']>> = {
  normal: 0,
  left: 90,
  inverted: 180,
  right: 270,
};

const WORD_OF_ROTATION: Readonly<Record<number, string>> = {
  0: 'normal',
  90: 'left',
  180: 'inverted',
  270: 'right',
};

interface RawOutput {
  readonly name: string;
  readonly primary: boolean;
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly rotation: DisplayOutput['rotation'];
  readonly current: DisplayMode | null;
  readonly modes: DisplayMode[];
}

function rawOutput(match: RegExpExecArray): RawOutput {
  const [, name, primary, width, , x, y, word] = match;
  return {
    name: name ?? '',
    primary: primary === 'primary',
    active: width !== undefined,
    x: Number(x ?? 0),
    y: Number(y ?? 0),
    rotation: ROTATION_OF_WORD[word ?? 'normal'] ?? 0,
    current: null,
    modes: [],
  };
}

interface RateEntry {
  readonly mode: DisplayMode;
  readonly current: boolean;
}

function rateEntries(width: number, height: number, rates: string): RateEntry[] {
  return [...rates.matchAll(RATE)].map(([, rate, flags]) => ({
    mode: {
      width,
      height,
      refreshHz: roundRefresh(Number(rate)),
      preferred: flags?.includes('+') === true,
    },
    current: flags?.includes('*') === true,
  }));
}

export function parseXrandr(text: string): readonly RawOutput[] {
  const outputs: RawOutput[] = [];
  for (const line of text.split('\n')) {
    const header = OUTPUT_LINE.exec(line);
    if (header !== null) {
      outputs.push(rawOutput(header));
      continue;
    }
    const mode = MODE_LINE.exec(line);
    const last = outputs.at(-1);
    if (mode === null || last === undefined) {
      continue;
    }
    const [, width, height, rates] = mode;
    const entries = rateEntries(Number(width), Number(height), rates ?? '');
    outputs[outputs.length - 1] = {
      ...last,
      current: entries.find((entry) => entry.current)?.mode ?? last.current,
      modes: [...last.modes, ...entries.map((entry) => entry.mode)],
    };
  }
  if (outputs.length === 0 && !text.includes('connected')) {
    throw new NodeFailureError('failed', 'xrandr did not report any outputs.');
  }
  return outputs;
}

export function toDisplayOutputs(raws: readonly RawOutput[]): DisplayOutput[] {
  return raws.map((raw) => ({
    id: raw.name,
    name: raw.name,
    builtIn: BUILT_IN.test(raw.name),
    enabled: raw.active,
    primary: raw.primary,
    mode: raw.active ? raw.current : null,
    modes: raw.modes,
    scalePercent: 100,
    rotation: raw.rotation,
    x: raw.x,
    y: raw.y,
    brightness: null,
    hdr: { supported: false, enabled: false },
    vrr: null,
    mirrorOf: null,
  }));
}

function modeArguments(mode: DisplayMode): readonly string[] {
  return [
    '--mode',
    `${String(mode.width)}x${String(mode.height)}`,
    '--rate',
    String(mode.refreshHz),
  ];
}

export function restoreArguments(raws: readonly RawOutput[]): DisplayRestore {
  return raws.flatMap((raw) => {
    if (!raw.active || raw.current === null) {
      return ['--output', raw.name, '--off'];
    }
    return [
      '--output',
      raw.name,
      ...modeArguments(raw.current),
      '--pos',
      `${String(raw.x)}x${String(raw.y)}`,
      '--rotate',
      WORD_OF_ROTATION[raw.rotation] ?? 'normal',
      ...(raw.primary ? ['--primary'] : []),
    ];
  });
}

function unsupported(kind: BackendChange['kind']): NodeFailureError {
  return new NodeFailureError(
    'not_supported',
    `This computer's screen tool cannot change ${kind} yet.`,
  );
}

function enableFlag(enabled: boolean): string {
  return enabled ? '--auto' : '--off';
}

function rotateWord(degrees: number): string {
  return WORD_OF_ROTATION[degrees] ?? 'normal';
}

export function changeArguments(change: BackendChange): readonly string[] {
  const head = ['--output', change.output];
  switch (change.kind) {
    case 'enabled':
      return [...head, enableFlag(change.enabled)];
    case 'mode':
      return [...head, ...modeArguments(change.mode)];
    case 'rotation':
      return [...head, '--rotate', rotateWord(change.degrees)];
    case 'position':
      return [...head, '--pos', `${String(change.x)}x${String(change.y)}`];
    case 'primary':
      return [...head, '--primary'];
    case 'scale':
    case 'hdr':
    case 'vrr':
    case 'brightness':
      throw unsupported(change.kind);
  }
}

export class XrandrDisplays implements DisplayBackend {
  readonly name = 'xrandr';

  constructor(private readonly run: RunProgram) {}

  async read(): Promise<readonly DisplayOutput[]> {
    return toDisplayOutputs(await this.raw());
  }

  async capture(): Promise<DisplayRestore> {
    return restoreArguments(await this.raw());
  }

  async apply(change: BackendChange): Promise<void> {
    await this.run(PROGRAM, [...changeArguments(change)]);
  }

  async restore(restore: DisplayRestore): Promise<void> {
    await this.run(PROGRAM, [...restore]);
  }

  private async raw(): Promise<readonly RawOutput[]> {
    return parseXrandr(await this.run(PROGRAM, ['--query']));
  }
}
