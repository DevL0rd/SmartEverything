import { IrCodeError } from '../ir-codes';

export const FLIPPER_PROTOCOLS = [
  'NEC',
  'NECext',
  'NEC42',
  'Samsung32',
  'SIRC',
  'SIRC15',
  'SIRC20',
  'RC5',
  'RC5X',
  'RC6',
  'RCA',
] as const;

export type FlipperProtocol = (typeof FLIPPER_PROTOCOLS)[number];

export function isFlipperProtocol(name: string): name is FlipperProtocol {
  return FLIPPER_PROTOCOLS.some((protocol) => protocol === name);
}

export interface ProtocolFrame {
  readonly address: number;
  readonly command: number;
}

interface Field {
  readonly value: number;
  readonly width: number;
}

interface Distance {
  readonly header: readonly [number, number];
  readonly mark: number;
  readonly one: number;
  readonly zero: number;
}

const NEC: Distance = { header: [9000, 4500], mark: 560, one: 1690, zero: 560 };
const SAMSUNG: Distance = { header: [4500, 4500], mark: 550, one: 1650, zero: 550 };
const RCA: Distance = { header: [4000, 4000], mark: 500, one: 2000, zero: 1000 };

const SIRC_HEADER = [2400, 600] as const;
const SIRC_ONE_MARK = 1200;
const SIRC_ZERO_MARK = 600;
const SIRC_GAP = 600;
const SIRC_COMMAND_BITS = 7;
const SIRC_ADDRESS_BITS: Readonly<Record<'SIRC' | 'SIRC15' | 'SIRC20', number>> = {
  SIRC: 5,
  SIRC15: 8,
  SIRC20: 13,
};

const RC5_HALF_BIT = 889;
const RC6_UNIT = 444;
const RC6_LEADER = { mark: 6, space: 2 } as const;
const RC5_ADDRESS_BITS = 5;
const RC5_COMMAND_BITS = 6;
const RC5_COMMAND_FIELD = 64;
const RC6_FIELD_BITS = 8;
const NEC42_ADDRESS_BITS = 13;
const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
const NIBBLE_BITS = 4;

function fieldBits(field: Field, order: 'lsb' | 'msb'): boolean[] {
  const bits = Array.from(
    { length: field.width },
    (_, index) => ((field.value >> index) & 1) === 1,
  );
  return order === 'lsb' ? bits : bits.reverse();
}

function inverse(field: Field): Field {
  return { value: ~field.value & ((1 << field.width) - 1), width: field.width };
}

function fitted(protocol: string, name: string, value: number, width: number): Field {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) {
    throw new IrCodeError(
      'pulses',
      `the ${protocol} ${name} ${String(value)} does not fit in ${String(width)} bits`,
    );
  }
  return { value, width };
}

function distanceCoded(timing: Distance, bits: readonly boolean[]): readonly number[] {
  return [
    ...timing.header,
    ...bits.flatMap((bit) => [timing.mark, bit ? timing.one : timing.zero]),
    timing.mark,
  ];
}

function sircCoded(
  protocol: keyof typeof SIRC_ADDRESS_BITS,
  frame: ProtocolFrame,
): readonly number[] {
  const command = fitted(protocol, 'command', frame.command, SIRC_COMMAND_BITS);
  const address = fitted(protocol, 'address', frame.address, SIRC_ADDRESS_BITS[protocol]);
  const bits = [...fieldBits(command, 'lsb'), ...fieldBits(address, 'lsb')];
  const pulses = bits.flatMap((bit) => [bit ? SIRC_ONE_MARK : SIRC_ZERO_MARK, SIRC_GAP]);
  return [...SIRC_HEADER, ...pulses.slice(0, -1)];
}

interface Run {
  readonly mark: boolean;
  length: number;
}

function manchester(halves: readonly boolean[], unit: number): readonly number[] {
  const runs: Run[] = [];
  halves.forEach((mark) => {
    const last = runs.at(-1);
    if (last?.mark === mark) {
      last.length += 1;
    } else {
      runs.push({ mark, length: 1 });
    }
  });
  const started = runs[0]?.mark === false ? runs.slice(1) : runs;
  const closed = started.at(-1)?.mark === false ? started.slice(0, -1) : started;
  return closed.map((run) => run.length * unit);
}

function rc5Coded(frame: ProtocolFrame): readonly number[] {
  const address = fitted('RC5', 'address', frame.address, RC5_ADDRESS_BITS);
  fitted('RC5', 'command', frame.command, RC5_COMMAND_BITS + 1);
  const low = fitted('RC5', 'command', frame.command % RC5_COMMAND_FIELD, RC5_COMMAND_BITS);
  const bits = [
    true,
    frame.command < RC5_COMMAND_FIELD,
    false,
    ...fieldBits(address, 'msb'),
    ...fieldBits(low, 'msb'),
  ];
  return manchester(
    bits.flatMap((bit) => (bit ? [false, true] : [true, false])),
    RC5_HALF_BIT,
  );
}

function single(bit: boolean): boolean[] {
  return bit ? [true, false] : [false, true];
}

function rc6Coded(frame: ProtocolFrame): readonly number[] {
  const address = fitted('RC6', 'address', frame.address, RC6_FIELD_BITS);
  const command = fitted('RC6', 'command', frame.command, RC6_FIELD_BITS);
  const leader = [
    ...Array.from({ length: RC6_LEADER.mark }, () => true),
    ...Array.from({ length: RC6_LEADER.space }, () => false),
  ];
  const halves = [
    ...leader,
    ...single(true),
    ...[false, false, false].flatMap(single),
    ...single(false).flatMap((half) => [half, half]),
    ...[...fieldBits(address, 'msb'), ...fieldBits(command, 'msb')].flatMap(single),
  ];
  return manchester(halves, RC6_UNIT);
}

function necCoded(
  protocol: string,
  frame: ProtocolFrame,
  widths: readonly [number, number],
): readonly number[] {
  const address = fitted(protocol, 'address', frame.address, widths[0]);
  const command = fitted(protocol, 'command', frame.command, widths[1]);
  return distanceCoded(NEC, [
    ...fieldBits(address, 'lsb'),
    ...fieldBits(inverse(address), 'lsb'),
    ...fieldBits(command, 'lsb'),
    ...fieldBits(inverse(command), 'lsb'),
  ]);
}

function necExtendedCoded(frame: ProtocolFrame): readonly number[] {
  const address = fitted('NECext', 'address', frame.address, 2 * BYTE_BITS);
  const command = fitted('NECext', 'command', frame.command, 2 * BYTE_BITS);
  return distanceCoded(NEC, [...fieldBits(address, 'lsb'), ...fieldBits(command, 'lsb')]);
}

function samsungCoded(frame: ProtocolFrame): readonly number[] {
  const short = frame.address <= BYTE_MASK;
  const address = fitted('Samsung32', 'address', frame.address, short ? BYTE_BITS : 2 * BYTE_BITS);
  const command = fitted('Samsung32', 'command', frame.command, BYTE_BITS);
  const addressBits = short
    ? [...fieldBits(address, 'lsb'), ...fieldBits(address, 'lsb')]
    : fieldBits(address, 'lsb');
  return distanceCoded(SAMSUNG, [
    ...addressBits,
    ...fieldBits(command, 'lsb'),
    ...fieldBits(inverse(command), 'lsb'),
  ]);
}

function rcaCoded(frame: ProtocolFrame): readonly number[] {
  const address = fitted('RCA', 'address', frame.address, NIBBLE_BITS);
  const command = fitted('RCA', 'command', frame.command, BYTE_BITS);
  return distanceCoded(RCA, [
    ...fieldBits(address, 'msb'),
    ...fieldBits(command, 'msb'),
    ...fieldBits(inverse(address), 'msb'),
    ...fieldBits(inverse(command), 'msb'),
  ]);
}

const ENCODERS: Readonly<Record<FlipperProtocol, (frame: ProtocolFrame) => readonly number[]>> = {
  NEC: (frame) => necCoded('NEC', frame, [BYTE_BITS, BYTE_BITS]),
  NECext: necExtendedCoded,
  NEC42: (frame) => necCoded('NEC42', frame, [NEC42_ADDRESS_BITS, BYTE_BITS]),
  Samsung32: samsungCoded,
  SIRC: (frame) => sircCoded('SIRC', frame),
  SIRC15: (frame) => sircCoded('SIRC15', frame),
  SIRC20: (frame) => sircCoded('SIRC20', frame),
  RC5: rc5Coded,
  RC5X: rc5Coded,
  RC6: rc6Coded,
  RCA: rcaCoded,
};

export function protocolPulses(protocol: FlipperProtocol, frame: ProtocolFrame): readonly number[] {
  return ENCODERS[protocol](frame);
}
