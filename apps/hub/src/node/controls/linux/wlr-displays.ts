import type { DisplayMode, DisplayOutput } from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import {
  roundRefresh,
  type BackendChange,
  type DisplayBackend,
  type DisplayRestore,
} from './display-backend';
import { messageOf } from '@smarteverything/logging';

const PROGRAM = 'wlr-randr';
const PERCENT = 100;
const BUILT_IN = /^(eDP|LVDS|DSI)/;
const FLIPPED = /^flipped-?/;

const ROTATION_OF_TRANSFORM: Readonly<Record<string, DisplayOutput['rotation']>> = {
  normal: 0,
  '90': 90,
  '180': 180,
  '270': 270,
};

const OUTPUT = z.object({
  name: z.string(),
  enabled: z.boolean(),
  modes: z.array(
    z.object({
      width: z.number(),
      height: z.number(),
      refresh: z.number(),
      preferred: z.boolean(),
      current: z.boolean(),
    }),
  ),
  position: z.object({ x: z.number(), y: z.number() }),
  transform: z.string(),
  scale: z.number(),
});

type RawOutput = z.infer<typeof OUTPUT>;

export function parseWlr(text: string): readonly RawOutput[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new NodeFailureError(
      'failed',
      `wlr-randr returned text that is not JSON: ${messageOf(cause)}`,
    );
  }
  const result = z.array(OUTPUT).safeParse(json);
  if (!result.success) {
    throw new NodeFailureError(
      'failed',
      `wlr-randr returned a layout in a shape we do not know: ${result.error.message.slice(0, 200)}`,
    );
  }
  return result.data;
}

function modeOf(mode: RawOutput['modes'][number]): DisplayMode {
  return {
    width: mode.width,
    height: mode.height,
    refreshHz: roundRefresh(mode.refresh),
    preferred: mode.preferred,
  };
}

export function toDisplayOutputs(raws: readonly RawOutput[]): DisplayOutput[] {
  return raws.map((raw) => {
    const current = raw.modes.find((mode) => mode.current);
    return {
      id: raw.name,
      name: raw.name,
      builtIn: BUILT_IN.test(raw.name),
      enabled: raw.enabled,
      primary: false,
      mode: raw.enabled && current !== undefined ? modeOf(current) : null,
      modes: raw.modes.map(modeOf),
      scalePercent: Math.round(raw.scale * PERCENT),
      rotation: ROTATION_OF_TRANSFORM[raw.transform.replace(FLIPPED, '')] ?? 0,
      x: raw.position.x,
      y: raw.position.y,
      brightness: null,
      hdr: { supported: false, enabled: false },
      vrr: null,
      mirrorOf: null,
    };
  });
}

export function restoreArguments(raws: readonly RawOutput[]): DisplayRestore {
  return raws.flatMap((raw) => {
    const current = raw.modes.find((mode) => mode.current);
    if (!raw.enabled || current === undefined) {
      return ['--output', raw.name, '--off'];
    }
    return [
      '--output',
      raw.name,
      '--on',
      '--mode',
      `${String(current.width)}x${String(current.height)}@${String(current.refresh)}`,
      '--pos',
      `${String(raw.position.x)},${String(raw.position.y)}`,
      '--transform',
      raw.transform,
      '--scale',
      String(raw.scale),
    ];
  });
}

function unsupported(kind: BackendChange['kind']): NodeFailureError {
  return new NodeFailureError(
    'not_supported',
    `This computer's screen tool cannot change ${kind} yet.`,
  );
}

function modeText(mode: DisplayMode): string {
  return `${String(mode.width)}x${String(mode.height)}@${String(mode.refreshHz)}`;
}

function transformText(degrees: number): string {
  return degrees === 0 ? 'normal' : String(degrees);
}

function onOffFlag(enabled: boolean): string {
  return enabled ? '--on' : '--off';
}

export function changeArguments(change: BackendChange): readonly string[] {
  const head = ['--output', change.output];
  switch (change.kind) {
    case 'enabled':
      return [...head, onOffFlag(change.enabled)];
    case 'mode':
      return [...head, '--mode', modeText(change.mode)];
    case 'scale':
      return [...head, '--scale', String(change.percent / PERCENT)];
    case 'rotation':
      return [...head, '--transform', transformText(change.degrees)];
    case 'position':
      return [...head, '--pos', `${String(change.x)},${String(change.y)}`];
    case 'primary':
    case 'hdr':
    case 'vrr':
    case 'brightness':
      throw unsupported(change.kind);
  }
}

export class WlrDisplays implements DisplayBackend {
  readonly name = 'wlr-randr';

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
    return parseWlr(await this.run(PROGRAM, ['--json']));
  }
}
