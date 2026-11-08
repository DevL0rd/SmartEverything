import { z } from 'zod';
import { IrCodeError } from '../ir-codes';
import { pulsesToCode } from './pulse-train';
import { isFlipperProtocol, protocolPulses } from './protocols';

const BYTE_RADIX = 16;

export class FlipperFileError extends Error {
  override readonly name = 'FlipperFileError';

  constructor(
    readonly reason: string,
    readonly signal: string,
  ) {
    super(`The Flipper signal ${signal} is not usable: ${reason}.`);
  }
}

export class FlipperProtocolUnsupportedError extends Error {
  override readonly name = 'FlipperProtocolUnsupportedError';

  constructor(
    readonly protocol: string,
    readonly signal: string,
  ) {
    super(`The Flipper signal ${signal} uses the ${protocol} protocol, which has no encoder here.`);
  }
}

const RAW_SIGNAL = z.object({
  type: z.literal('raw'),
  data: z.string().regex(/^\d+(?: \d+)*$/),
});

const PARSED_SIGNAL = z.object({
  type: z.literal('parsed'),
  protocol: z.string().min(1),
  address: z.string().regex(/^[0-9a-f]{2}(?: [0-9a-f]{2})*$/i),
  command: z.string().regex(/^[0-9a-f]{2}(?: [0-9a-f]{2})*$/i),
});

const FLIPPER_SIGNAL = z.discriminatedUnion('type', [RAW_SIGNAL, PARSED_SIGNAL]);

export interface FlipperSignal {
  readonly name: string;
  readonly code: string;
}

function littleEndian(bytes: string): number {
  return bytes
    .split(' ')
    .reduce((total, byte, index) => total + Number.parseInt(byte, BYTE_RADIX) * 256 ** index, 0);
}

function blocksOf(text: string): readonly Map<string, string>[] {
  return text
    .split(/^#.*$/m)
    .map((block) => new Map(block.split('\n').flatMap(fieldOf)))
    .filter((fields) => fields.has('name'));
}

function fieldOf(line: string): [string, string][] {
  const split = line.indexOf(':');
  return split < 0 ? [] : [[line.slice(0, split).trim(), line.slice(split + 1).trim()]];
}

function pulsesOf(name: string, fields: Map<string, string>): readonly number[] {
  const parsed = FLIPPER_SIGNAL.safeParse(Object.fromEntries(fields));
  if (!parsed.success) {
    throw new FlipperFileError('its fields are not a raw or parsed signal', name);
  }
  const signal = parsed.data;
  if (signal.type === 'raw') {
    return signal.data.split(' ').map(Number);
  }
  if (!isFlipperProtocol(signal.protocol)) {
    throw new FlipperProtocolUnsupportedError(signal.protocol, name);
  }
  return protocolPulses(signal.protocol, {
    address: littleEndian(signal.address),
    command: littleEndian(signal.command),
  });
}

export interface FlipperFile {
  readonly signals: readonly FlipperSignal[];
  readonly skipped: readonly Error[];
}

export function readFlipperFile(text: string): FlipperFile {
  const signals: FlipperSignal[] = [];
  const skipped: Error[] = [];
  blocksOf(text).forEach((fields) => {
    const name = fields.get('name') ?? '';
    try {
      signals.push({ name, code: pulsesToCode(pulsesOf(name, fields)) });
    } catch (error) {
      if (
        error instanceof FlipperFileError ||
        error instanceof FlipperProtocolUnsupportedError ||
        error instanceof IrCodeError
      ) {
        skipped.push(error);
        return;
      }
      throw error;
    }
  });
  return { signals, skipped };
}
