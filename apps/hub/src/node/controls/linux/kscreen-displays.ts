import type { DisplayMode, DisplayOutput } from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import {
  REFRESH_TOLERANCE_HZ,
  roundRefresh,
  type BackendChange,
  type DisplayBackend,
  type DisplayRestore,
} from './display-backend';
import { messageOf } from '@smarteverything/logging';

const PROGRAM = 'kscreen-doctor';
const PANEL_TYPE = 7;
const PRIMARY_PRIORITY = 1;
const PERCENT = 100;
const SCALE_PRECISION = 100;

const ROTATION_OF_FLAG: Readonly<Record<number, DisplayOutput['rotation']>> = {
  1: 0,
  2: 90,
  4: 180,
  8: 270,
};

const FLAG_OF_ROTATION: Readonly<Record<number, string>> = {
  0: 'none',
  90: 'left',
  180: 'inverted',
  270: 'right',
};

const VRR_OF_FLAG: Readonly<Record<number, NonNullable<DisplayOutput['vrr']>>> = {
  0: 'never',
  1: 'always',
  2: 'automatic',
};

const MODE = z.object({
  id: z.string(),
  refreshRate: z.number(),
  size: z.object({ width: z.number(), height: z.number() }),
});

const OUTPUT = z.object({
  id: z.number(),
  name: z.string(),
  connected: z.boolean(),
  enabled: z.boolean(),
  type: z.number(),
  currentModeId: z.string(),
  preferredModes: z.array(z.string()),
  modes: z.array(MODE),
  pos: z.object({ x: z.number(), y: z.number() }),
  scale: z.number(),
  rotation: z.number(),
  priority: z.number(),
  replicationSource: z.number(),
  brightness: z.number().optional(),
  hdr: z.boolean().optional(),
  vrrPolicy: z.number().optional(),
});

const CONFIG = z.object({ outputs: z.array(OUTPUT) });

type RawOutput = z.infer<typeof OUTPUT>;

export function parseKscreen(text: string): readonly RawOutput[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new NodeFailureError(
      'failed',
      `kscreen-doctor returned text that is not JSON: ${messageOf(cause)}`,
    );
  }
  const result = CONFIG.safeParse(json);
  if (!result.success) {
    throw new NodeFailureError(
      'failed',
      `kscreen-doctor returned a layout in a shape we do not know: ${result.error.message.slice(0, 200)}`,
    );
  }
  return result.data.outputs.filter((output) => output.connected);
}

function displayMode(raw: RawOutput, id: string): DisplayMode | null {
  const mode = raw.modes.find((candidate) => candidate.id === id);
  return mode === undefined
    ? null
    : {
        width: mode.size.width,
        height: mode.size.height,
        refreshHz: roundRefresh(mode.refreshRate),
        preferred: raw.preferredModes.includes(mode.id),
      };
}

function nameOfSource(outputs: readonly RawOutput[], source: number): string | null {
  return source === 0 ? null : (outputs.find((output) => output.id === source)?.name ?? null);
}

export function toDisplayOutputs(raws: readonly RawOutput[]): DisplayOutput[] {
  return raws.map((raw) => ({
    id: raw.name,
    name: raw.name,
    builtIn: raw.type === PANEL_TYPE,
    enabled: raw.enabled,
    primary: raw.enabled && raw.priority === PRIMARY_PRIORITY,
    mode: raw.enabled ? displayMode(raw, raw.currentModeId) : null,
    modes: raw.modes.flatMap((mode) => displayMode(raw, mode.id) ?? []),
    scalePercent: Math.round(raw.scale * PERCENT),
    rotation: ROTATION_OF_FLAG[raw.rotation & 0xf] ?? 0,
    x: raw.pos.x,
    y: raw.pos.y,
    brightness: raw.brightness === undefined ? null : Math.round(raw.brightness * PERCENT),
    hdr: { supported: raw.hdr !== undefined, enabled: raw.hdr === true },
    vrr: raw.vrrPolicy === undefined ? null : (VRR_OF_FLAG[raw.vrrPolicy] ?? null),
    mirrorOf: nameOfSource(raws, raw.replicationSource),
  }));
}

export function restoreArguments(raws: readonly RawOutput[]): DisplayRestore {
  const enabled = raws.filter((raw) => raw.enabled);
  const disabled = raws.filter((raw) => !raw.enabled);
  return [
    ...enabled.flatMap((raw) => [
      `output.${raw.name}.enable`,
      `output.${raw.name}.mode.${raw.currentModeId}`,
      `output.${raw.name}.position.${String(raw.pos.x)},${String(raw.pos.y)}`,
      `output.${raw.name}.scale.${String(raw.scale)}`,
      `output.${raw.name}.rotation.${FLAG_OF_ROTATION[raw.rotation & 0xf] ?? 'none'}`,
      `output.${raw.name}.priority.${String(raw.priority)}`,
    ]),
    ...disabled.map((raw) => `output.${raw.name}.disable`),
  ];
}

function findRaw(raws: readonly RawOutput[], output: string): RawOutput {
  const raw = raws.find((candidate) => candidate.name === output);
  if (raw === undefined) {
    throw new NodeFailureError('not_found', `No display named ${output} is connected.`);
  }
  return raw;
}

function modeId(raw: RawOutput, wanted: DisplayMode): string {
  const mode = raw.modes.find(
    (candidate) =>
      candidate.size.width === wanted.width &&
      candidate.size.height === wanted.height &&
      Math.abs(roundRefresh(candidate.refreshRate) - wanted.refreshHz) < REFRESH_TOLERANCE_HZ,
  );
  if (mode === undefined) {
    throw new NodeFailureError('not_found', `${raw.name} no longer offers that mode.`);
  }
  return mode.id;
}

function primaryArguments(raws: readonly RawOutput[], output: string): readonly string[] {
  const others = raws
    .filter((raw) => raw.enabled && raw.name !== output)
    .toSorted((left, right) => left.priority - right.priority);
  return [output, ...others.map((raw) => raw.name)].map(
    (name, index) => `output.${name}.priority.${String(index + PRIMARY_PRIORITY)}`,
  );
}

function onOff(enabled: boolean, on: string, off: string): string {
  return enabled ? on : off;
}

function scaleText(percent: number): string {
  return String(Math.round((percent / PERCENT) * SCALE_PRECISION) / SCALE_PRECISION);
}

function rotationWord(degrees: number): string {
  return FLAG_OF_ROTATION[degrees] ?? 'none';
}

export function changeArguments(
  change: BackendChange,
  raws: readonly RawOutput[],
): readonly string[] {
  const prefix = `output.${change.output}`;
  switch (change.kind) {
    case 'enabled':
      return [`${prefix}.${onOff(change.enabled, 'enable', 'disable')}`];
    case 'mode':
      return [`${prefix}.mode.${modeId(findRaw(raws, change.output), change.mode)}`];
    case 'scale':
      return [`${prefix}.scale.${scaleText(change.percent)}`];
    case 'rotation':
      return [`${prefix}.rotation.${rotationWord(change.degrees)}`];
    case 'primary':
      return primaryArguments(raws, change.output);
    case 'position':
      return [`${prefix}.position.${String(change.x)},${String(change.y)}`];
    case 'hdr':
      return [`${prefix}.hdr.${onOff(change.enabled, 'enable', 'disable')}`];
    case 'vrr':
      return [`${prefix}.vrrpolicy.${change.policy}`];
    case 'brightness':
      return [`${prefix}.brightness.${String(Math.round(change.level))}`];
  }
}

export class KscreenDisplays implements DisplayBackend {
  readonly name = 'kscreen';

  constructor(private readonly run: RunProgram) {}

  async read(): Promise<readonly DisplayOutput[]> {
    return toDisplayOutputs(await this.raw());
  }

  async capture(): Promise<DisplayRestore> {
    return restoreArguments(await this.raw());
  }

  async apply(change: BackendChange): Promise<void> {
    const raws = await this.raw();
    await this.run(PROGRAM, [...changeArguments(change, raws)]);
  }

  async restore(restore: DisplayRestore): Promise<void> {
    await this.run(PROGRAM, [...restore]);
  }

  private async raw(): Promise<readonly RawOutput[]> {
    return parseKscreen(await this.run(PROGRAM, ['-j']));
  }
}
