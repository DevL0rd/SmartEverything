import { OralbRefusedError } from './errors';
import { ORALB_NAMED_COLOURS, type OralbColourName } from './ring';
import type { ORALB_KEY } from './uuids';

export const CONFIG_PREFIX = 0x37;

export type OralbPrefixRule = 'prefixed' | 'plain';

export type OralbConfigKey =
  | typeof ORALB_KEY.clock
  | typeof ORALB_KEY.modeSlots
  | typeof ORALB_KEY.pacer
  | typeof ORALB_KEY.ringColour
  | typeof ORALB_KEY.head;

export interface OralbConfigWrite {
  readonly prefix: Uint8Array | null;
  readonly characteristic: OralbConfigKey;
  readonly payload: Uint8Array;
}

const PREFIX_BYTE: Readonly<Record<OralbConfigKey, number | null>> = {
  ff22: 0x26,
  ff25: 0x29,
  ff26: 0x2a,
  ff2b: 0x2f,
  ff2d: null,
};

const READ_SELECT = 0x02;

const METADATA_SELECT = 0x05;

const EXTEND = 0x31;

const SESSION_INDEXES = { first: 0, last: 29 } as const;

const SERVICE_INDEXES = { first: 250, last: 255 } as const;

const METADATA_INDEXES: ReadonlySet<number> = new Set([1, 3, 6, 7, 8, 9, 255]);

const SLOT_COUNT = 8;

const EMPTY_SLOT = 0xff;

const HEAD_RESET = 1;

const HEAD_SNOOZE = 2;

const HEAD_PAYLOAD_LENGTH = 5;

function byteOf(name: string, value: number, maximum = 255): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new OralbRefusedError(
      `${name} ${String(value)} is not an integer from 0 to ${String(maximum)}.`,
    );
  }
  return value;
}

export function readSelect(index: number): Uint8Array {
  const valid =
    Number.isInteger(index) &&
    ((index >= SESSION_INDEXES.first && index <= SESSION_INDEXES.last) ||
      (index >= SERVICE_INDEXES.first && index <= SERVICE_INDEXES.last));
  if (!valid) {
    throw new OralbRefusedError(
      `Read-select index ${String(index)} is not a stored session or service id.`,
    );
  }
  return Uint8Array.of(READ_SELECT, index);
}

export function metadataSelect(index: number): Uint8Array {
  if (!METADATA_INDEXES.has(index)) {
    throw new OralbRefusedError(`Metadata index ${String(index)} is not a read-only metadata id.`);
  }
  return Uint8Array.of(METADATA_SELECT, index);
}

export function extendConnection(seconds: number): Uint8Array {
  return Uint8Array.of(EXTEND, byteOf('Extension seconds', seconds));
}

export function configWrite(
  rule: OralbPrefixRule,
  characteristic: OralbConfigKey,
  payload: Uint8Array,
): OralbConfigWrite {
  const command = PREFIX_BYTE[characteristic];
  let prefix: Uint8Array | null = null;
  if (command !== null) {
    prefix = rule === 'prefixed' ? Uint8Array.of(CONFIG_PREFIX, command) : Uint8Array.of(command);
  }
  return { prefix, characteristic, payload };
}

export function modeSlotsPayload(slots: readonly (number | null)[]): Uint8Array {
  if (slots.length > SLOT_COUNT) {
    throw new OralbRefusedError(`Mode slots take at most ${String(SLOT_COUNT)} entries.`);
  }
  const payload = new Uint8Array(SLOT_COUNT).fill(EMPTY_SLOT);
  slots.forEach((slot, index) => {
    payload[index] = slot === null ? EMPTY_SLOT : byteOf('Mode id', slot, EMPTY_SLOT - 1);
  });
  return payload;
}

export function pacerPayload(seconds: readonly number[]): Uint8Array {
  if (seconds.length > SLOT_COUNT) {
    throw new OralbRefusedError(`The pacer takes at most ${String(SLOT_COUNT)} sectors.`);
  }
  const payload = new Uint8Array(SLOT_COUNT);
  seconds.forEach((value, index) => {
    payload[index] = byteOf('Sector seconds', value);
  });
  return payload;
}

export function ringColourPayload(colour: OralbColourName): Uint8Array {
  const [red, green, blue] = ORALB_NAMED_COLOURS[colour];
  return Uint8Array.of(red, green, blue, 0);
}

export function headResetPayload(): Uint8Array {
  return Uint8Array.of(HEAD_RESET, ...new Uint8Array(HEAD_PAYLOAD_LENGTH - 1));
}

export function headSnoozePayload(): Uint8Array {
  return Uint8Array.of(HEAD_SNOOZE, ...new Uint8Array(HEAD_PAYLOAD_LENGTH - 1));
}

export function clockPayload(clockSeconds: number): Uint8Array {
  byteOf('Clock seconds', clockSeconds, 0xffffffff);
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setUint32(0, clockSeconds, true);
  return payload;
}
