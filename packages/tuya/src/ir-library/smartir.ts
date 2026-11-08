import { z } from 'zod';
import { IrCodeError } from '../ir-codes';
import type { LibraryClimate } from './library';
import {
  pulsesFromBroadlink,
  pulsesFromSigned,
  pulsesFromSignedText,
  pulsesToCode,
} from './pulse-train';

export class SmartIrFileError extends Error {
  override readonly name = 'SmartIrFileError';

  constructor(readonly reason: string) {
    super(`The SmartIR file is not usable: ${reason}.`);
  }
}

const SMARTIR_CLIMATE = z.object({
  manufacturer: z.string().min(1),
  supportedModels: z.array(z.string().min(1)).min(1),
  supportedController: z.string().min(1),
  commandsEncoding: z.string().min(1),
  minTemperature: z.number(),
  maxTemperature: z.number(),
  precision: z.number().positive(),
  operationModes: z.array(z.string().min(1)),
  fanModes: z.array(z.string().min(1)),
  swingModes: z.array(z.string().min(1)).optional(),
  commands: z.record(z.string(), z.unknown()),
});

const COMMAND_TEXT = z.string().min(1);

const TEMPERATURE_COMMANDS = z.record(z.string(), COMMAND_TEXT);

const FAN_COMMAND = z.union([
  COMMAND_TEXT,
  TEMPERATURE_COMMANDS,
  z.record(z.string(), z.union([COMMAND_TEXT, TEMPERATURE_COMMANDS])),
]);

const MODE_COMMANDS = z.record(z.string(), FAN_COMMAND);

const SWING_OFF = 'off';

export interface SmartIrClimate {
  readonly brand: string;
  readonly models: readonly string[];
  readonly climate: LibraryClimate;
}

const STRING_OR_TRAILING_COMMA = /("(?:[^"\\]|\\.)*")|,(\s*[}\]])/g;

export function withoutTrailingCommas(text: string): string {
  return text.replace(
    STRING_OR_TRAILING_COMMA,
    (_match, string: string | undefined, closing: string | undefined) => string ?? closing ?? '',
  );
}

function jsonArrayOf(text: string): readonly number[] {
  const values: unknown = JSON.parse(text);
  return pulsesFromSigned(z.array(z.number()).parse(values));
}

function pulsesOf(controller: string, encoding: string, text: string): readonly number[] {
  const kind = `${controller} ${encoding}`;
  switch (kind) {
    case 'Broadlink Base64':
      return pulsesFromBroadlink(text);
    case 'ESPHome Raw':
      return jsonArrayOf(text);
    case 'LOOKin Raw':
      return pulsesFromSignedText(text);
    default:
      throw new SmartIrFileError(`the ${kind} command encoding has no decoder`);
  }
}

function swungCommand(
  command: Readonly<Record<string, string | Record<string, string>>>,
  swingModes: readonly string[],
): string | Record<string, string> {
  const names = Object.keys(command);
  const swing =
    names.find((name) => name.toLowerCase() === SWING_OFF) ??
    swingModes.find((name) => name in command) ??
    names[0];
  const chosen = swing === undefined ? undefined : command[swing];
  if (chosen === undefined) {
    throw new SmartIrFileError('a fan speed has no commands');
  }
  return chosen;
}

function fanCommand(
  command: z.output<typeof FAN_COMMAND>,
  swingModes: readonly string[],
): string | Record<string, string> {
  if (typeof command === 'string') return command;
  const temperatures = TEMPERATURE_COMMANDS.safeParse(command);
  return temperatures.success ? temperatures.data : swungCommand(command, swingModes);
}

function modeOf(
  decode: (text: string) => string,
  file: z.output<typeof SMARTIR_CLIMATE>,
  source: unknown,
): LibraryClimate['commands'][string] {
  const commands = MODE_COMMANDS.parse(source);
  return Object.fromEntries(
    file.fanModes.flatMap((fan): [string, string | Record<string, string>][] => {
      const found = commands[fan];
      if (found === undefined) return [];
      const command = fanCommand(found, file.swingModes ?? []);
      return [
        [
          fan,
          typeof command === 'string'
            ? decode(command)
            : Object.fromEntries(
                Object.entries(command).map(([temperature, text]) => [temperature, decode(text)]),
              ),
        ],
      ];
    }),
  );
}

export function readSmartIrClimate(text: string): SmartIrClimate {
  const file = SMARTIR_CLIMATE.parse(JSON.parse(withoutTrailingCommas(text)));
  const decode = (code: string): string =>
    pulsesToCode(pulsesOf(file.supportedController, file.commandsEncoding, code));
  const off = file.commands['off'];
  if (typeof off !== 'string') {
    throw new SmartIrFileError('it has no off command');
  }
  const commands = Object.fromEntries(
    file.operationModes
      .flatMap((mode): [string, LibraryClimate['commands'][string]][] =>
        mode in file.commands ? [[mode, modeOf(decode, file, file.commands[mode])]] : [],
      )
      .filter(([, fans]) => Object.keys(fans).length > 0),
  );
  if (Object.keys(commands).length === 0) {
    throw new SmartIrFileError('none of its operation modes has commands');
  }
  return {
    brand: file.manufacturer,
    models: file.supportedModels,
    climate: {
      kind: 'climate',
      minTemperature: file.minTemperature,
      maxTemperature: file.maxTemperature,
      precision: file.precision,
      off: decode(off),
      commands,
    },
  };
}

export function isSkippableSmartIrError(error: unknown): boolean {
  return (
    error instanceof SmartIrFileError ||
    error instanceof IrCodeError ||
    error instanceof z.ZodError ||
    error instanceof SyntaxError
  );
}
