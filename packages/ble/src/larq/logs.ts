import type { BottleLog } from '@smarteverything/domain';
import { z } from 'zod';
import { FAULT_TYPES, TRIGGER_TYPES, UV_LOG_MODES, nameOfCode } from './enums';
import { decodeResponse, expectBody } from './envelope';
import { LOG_REQUESTS } from './requests';
import {
  EMPTY,
  fieldsOf,
  readBool,
  readFixed32,
  readFloat,
  readMessages,
  readVarint,
  type WireField,
} from './wire';

const COUNT = z.int().nonnegative();

export const TOF_ROW = z.strictObject({
  at: COUNT,
  trigger: z.string().min(1),
  distanceMm: COUNT,
  kcps: COUNT,
  ledOhm: z.number(),
});

export const ACTIVATION_ROW = z.strictObject({
  at: COUNT,
  mode: z.string().min(1),
  socPct: COUNT,
});

export const STATE_ROW = z.strictObject({
  at: COUNT,
  hall: z.boolean(),
  bottle: z.boolean(),
  ambient: z.boolean(),
  sip: z.boolean(),
  bottleValue: z.number(),
  ambientValue: z.number(),
  sipValue: z.number(),
});

export const FAULT_ROW = z.strictObject({ at: COUNT, type: z.string().min(1) });

export const ADC_ROW = z.strictObject({
  at: COUNT,
  batteryVolt: z.number(),
  batteryOhm: z.number(),
  uvLedVolt: z.number(),
  uvLedMa: z.number(),
  uvLedOhm: z.number(),
  pcbOhm: z.number(),
});

export interface LogRows {
  readonly tof: z.infer<typeof TOF_ROW>;
  readonly activation: z.infer<typeof ACTIVATION_ROW>;
  readonly state: z.infer<typeof STATE_ROW>;
  readonly fault: z.infer<typeof FAULT_ROW>;
  readonly activation_adc: z.infer<typeof ADC_ROW>;
  readonly charging_adc: z.infer<typeof ADC_ROW>;
}

function adcRow(item: readonly WireField[]): z.infer<typeof ADC_ROW> {
  return ADC_ROW.parse({
    at: readVarint(item, 1),
    batteryVolt: readFloat(item, 2),
    batteryOhm: readFloat(item, 3),
    uvLedVolt: readFloat(item, 4),
    uvLedMa: readFloat(item, 5),
    uvLedOhm: readFloat(item, 6),
    pcbOhm: readFloat(item, 7),
  });
}

const ROW_DECODERS: { readonly [L in BottleLog]: (item: readonly WireField[]) => LogRows[L] } = {
  tof: (item) =>
    TOF_ROW.parse({
      at: readVarint(item, 1),
      trigger: nameOfCode(TRIGGER_TYPES, readVarint(item, 2)),
      distanceMm: readFixed32(item, 3),
      kcps: readFixed32(item, 4),
      ledOhm: readFloat(item, 5),
    }),
  activation: (item) =>
    ACTIVATION_ROW.parse({
      at: readVarint(item, 1),
      mode: nameOfCode(UV_LOG_MODES, readVarint(item, 2)),
      socPct: readFixed32(item, 3),
    }),
  state: (item) =>
    STATE_ROW.parse({
      at: readVarint(item, 1),
      hall: readBool(item, 2),
      bottle: readBool(item, 3),
      ambient: readBool(item, 4),
      sip: readBool(item, 5),
      bottleValue: readFloat(item, 6),
      ambientValue: readFloat(item, 7),
      sipValue: readFloat(item, 8),
    }),
  fault: (item) =>
    FAULT_ROW.parse({
      at: readVarint(item, 1),
      type: nameOfCode(FAULT_TYPES, readVarint(item, 2)),
    }),
  activation_adc: adcRow,
  charging_adc: adcRow,
};

function pageFields(frame: Uint8Array, log: BottleLog): readonly WireField[] {
  const response = decodeResponse(frame);
  if (response.code === 'success' && response.typeName === null) {
    return fieldsOf(EMPTY);
  }
  return fieldsOf(expectBody(response, LOG_REQUESTS[log]));
}

export function decodeLogPage<L extends BottleLog>(
  frame: Uint8Array,
  log: L,
): readonly LogRows[L][] {
  const decode = ROW_DECODERS[log];
  return readMessages(pageFields(frame, log), 1).map((item) => decode(item));
}

export interface LogPageScan {
  readonly items: number;
  readonly lastTimestamp: number | null;
}

export function scanLogPage(frame: Uint8Array, log: BottleLog): LogPageScan {
  const items = readMessages(pageFields(frame, log), 1);
  const stamps = items.map((item) => readVarint(item, 1));
  return { items: items.length, lastTimestamp: stamps.length === 0 ? null : Math.max(...stamps) };
}

export function nextLogCursor(from: number, limit: number, scan: LogPageScan): number | null {
  if (scan.items < limit || scan.lastTimestamp === null || scan.lastTimestamp <= from) {
    return null;
  }
  return scan.lastTimestamp;
}
