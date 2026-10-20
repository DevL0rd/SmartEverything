import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { BRUSH_GATT_DUMP, type BrushGattDump } from '@smarteverything/domain';
import { hexToBytes } from '../../src';

const FOLDER = join(import.meta.dirname, '..', 'fixtures', 'sonicare');

const CAPTURE = z.looseObject({
  adv_name: z.string(),
  gatt_services: z.array(
    z.looseObject({
      uuid: z.string(),
      characteristics: z.array(
        z.looseObject({
          uuid: z.string(),
          properties: z.array(z.string()),
          value_hex: z.string().nullable(),
        }),
      ),
    }),
  ),
  condor: z.record(z.string(), z.looseObject({ ports: z.record(z.string(), z.unknown()) })),
});

const PROPERTY_NAMES = new Map([
  ['read', 'read'],
  ['write', 'write'],
  ['write-without-response', 'write_no_response'],
  ['notify', 'notify'],
  ['indicate', 'indicate'],
]);

export type Capture = z.infer<typeof CAPTURE>;

export function capture(name: string): Capture {
  return CAPTURE.parse(JSON.parse(readFileSync(join(FOLDER, `${name}.json`), 'utf8')));
}

export function dumpOf(name: string): BrushGattDump {
  const loaded = capture(name);
  return BRUSH_GATT_DUMP.parse({
    name: loaded.adv_name,
    services: loaded.gatt_services.map((service) => ({
      uuid: service.uuid,
      characteristics: service.characteristics.map((characteristic) => ({
        uuid: characteristic.uuid,
        properties: characteristic.properties.flatMap((property) => {
          const mapped = PROPERTY_NAMES.get(property);
          return mapped === undefined ? [] : [mapped];
        }),
        ...(characteristic.value_hex === null ? {} : { value: characteristic.value_hex }),
      })),
    })),
  });
}

export interface ReadValue {
  readonly uuid: string;
  readonly bytes: Uint8Array;
}

export function readValues(name: string): readonly ReadValue[] {
  return dumpOf(name).services.flatMap((service) =>
    service.characteristics.flatMap((characteristic) =>
      characteristic.value === undefined
        ? []
        : [{ uuid: characteristic.uuid, bytes: hexToBytes(characteristic.value) }],
    ),
  );
}

export function condorPorts(name: string, product: string): Record<string, unknown> {
  return capture(name).condor[product]?.ports ?? {};
}

const STORED = z.looseObject({
  live: z.looseObject({
    brushing_time_peak_seconds: z.number(),
    routine_length: z.string(),
    brushing_mode: z.string(),
    intensity: z.string(),
    available_routine_ids: z.string(),
    latest_session_id: z.string(),
  }),
  stored_session: z.looseObject({ transfer_header: z.string(), routine_record: z.string() }),
});

export function storedSession(): z.infer<typeof STORED> {
  return STORED.parse(
    JSON.parse(readFileSync(join(FOLDER, 'fx_classic_hx999x_stored_session.json'), 'utf8')),
  );
}
