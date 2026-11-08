import {
  CommandRefusedError,
  IR_SPEED_STEPS,
  type IrApplianceApply,
  type IrRemoteState,
} from '@smarteverything/domain';
import type { LibraryClimate } from '@smarteverything/tuya';
import { known, type IrEncoder, type IrEncoderFamily, type IrFrame } from '../encoders';
import type { IrLibrary } from './ir-library';

export const LIBRARY_ENCODER_PREFIX = 'library';

export const OFF_KEY = 'Off';

const MODE_NAMES: ReadonlyMap<string, readonly string[]> = new Map([
  ['Cool', ['cool']],
  ['Heat', ['heat']],
  ['Dry', ['dry']],
  ['Fan', ['fan_only', 'fan']],
  ['Auto', ['auto', 'heat_cool']],
]);

const AUTO_FAN = 'auto';

type FanCommands = LibraryClimate['commands'][string];

function frame(key: string, code: string): IrFrame {
  return { key, format: 'pulses', code };
}

function powered(from: IrRemoteState, goal: IrApplianceApply): void {
  if (goal.on === true) return;
  if (!known(from.on, 'power')) {
    throw new CommandRefusedError('state', 'it is off, so turn it on in the same request');
  }
}

function commandsOf(model: LibraryClimate, mode: string): FanCommands {
  const names = MODE_NAMES.get(mode) ?? [];
  const found = names.find((name) => name in model.commands);
  const commands = found === undefined ? undefined : model.commands[found];
  if (commands === undefined) {
    throw new CommandRefusedError(
      'mode',
      `it has no ${mode} mode, its modes are ${Object.keys(model.commands).join(', ')}`,
    );
  }
  return commands;
}

function fanOf(commands: FanCommands, speed: number): string {
  const fans = Object.keys(commands);
  const stepped = fans.filter((fan) => fan.toLowerCase() !== AUTO_FAN);
  const pool = stepped.length > 0 ? stepped : fans;
  const fan = pool[Math.round(((speed - 1) * (pool.length - 1)) / (IR_SPEED_STEPS - 1))];
  if (fan === undefined) {
    throw new CommandRefusedError('fan speed', 'this mode has no fan speeds');
  }
  return fan;
}

interface Selection {
  readonly model: LibraryClimate;
  readonly mode: string;
  readonly fan: string;
  readonly commands: FanCommands;
  readonly temp: number | null;
}

function codeOf({ model, mode, fan, commands, temp }: Selection): string {
  const command = commands[fan];
  if (typeof command === 'string') return command;
  const wanted = String(known(temp, 'temperature'));
  const code = command?.[wanted];
  if (code === undefined) {
    throw new CommandRefusedError(
      'temperature',
      `${wanted} is not a ${mode} temperature of this air conditioner, it takes ${String(model.minTemperature)} to ${String(model.maxTemperature)}`,
    );
  }
  return code;
}

function climateFrames(
  model: LibraryClimate,
  from: IrRemoteState,
  goal: IrApplianceApply,
): readonly IrFrame[] {
  if (goal.on === false) return [frame(OFF_KEY, model.off)];
  powered(from, goal);
  const mode = known(goal.mode ?? from.mode, 'mode');
  const commands = commandsOf(model, mode);
  const fan = fanOf(commands, known(goal.speed ?? from.speed, 'fan speed'));
  const temp = goal.temp ?? from.temp;
  const code = codeOf({ model, mode, fan, commands, temp });
  const parts = [mode, ...(temp === null ? [] : [String(temp)]), `fan ${fan}`];
  return [frame(parts.join(' '), code)];
}

function climateEncoder(libraryId: string, model: LibraryClimate): IrEncoder {
  return {
    id: `${LIBRARY_ENCODER_PREFIX}:${libraryId}`,
    frames: (_keys, from, goal) => climateFrames(model, from, goal),
  };
}

class LibraryModelNotClimateError extends Error {
  override readonly name = 'LibraryModelNotClimateError';

  constructor(readonly libraryId: string) {
    super(`The library model ${libraryId} sends buttons, so it has no state encoder.`);
  }
}

export function libraryEncoders(library: Pick<IrLibrary, 'model'>): IrEncoderFamily {
  return {
    prefix: LIBRARY_ENCODER_PREFIX,
    encoder: (libraryId): IrEncoder => {
      const model = library.model(libraryId);
      if (model.kind !== 'climate') {
        throw new LibraryModelNotClimateError(libraryId);
      }
      return climateEncoder(libraryId, model);
    },
  };
}
