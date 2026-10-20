import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const FOLDER = join(import.meta.dirname, '..', 'fixtures', 'oralb');

function load<T extends z.ZodType>(name: string, schema: T): z.infer<T> {
  return schema.parse(JSON.parse(readFileSync(join(FOLDER, `${name}.json`), 'utf8')));
}

const SECTOR = z.strictObject({ position: z.number().nullable(), last: z.boolean() });

const ADVERT = z.strictObject({
  name: z.string(),
  hex: z.string(),
  protocol: z.number(),
  modelId: z.number(),
  firmware: z.number(),
  state: z.number(),
  status: z.number(),
  pressure: z.enum(['normal', 'high']),
  powerButton: z.boolean(),
  modeButton: z.boolean(),
  timerS: z.number(),
  modeId: z.number(),
  sector: SECTOR,
  face: z.number(),
  secondsInSector: z.number(),
  sectorCount: z.number(),
});

const ADVERTS = z.strictObject({
  decoded: z.array(ADVERT),
  refused: z.array(z.strictObject({ name: z.string(), hex: z.string(), protocol: z.number() })),
});

const BATTERY = z.strictObject({
  name: z.string(),
  hex: z.string(),
  protocol: z.number().nullable(),
  expect: z.record(z.string(), z.number().nullable()),
});

const GATT = z.strictObject({
  deviceInfo: z.strictObject({
    hex: z.string(),
    modelId: z.number(),
    protocol: z.number(),
    firmware: z.number(),
  }),
  mac: z.strictObject({ hex: z.string(), mac: z.string() }),
  battery: z.array(BATTERY),
  pacerConfig: z.array(
    z.strictObject({ hex: z.string(), sectors: z.number(), targetS: z.number() }),
  ),
  modeSlots: z.array(z.strictObject({ hex: z.string(), slots: z.array(z.number()) })),
  pressure: z.array(z.strictObject({ hex: z.string(), expect: z.record(z.string(), z.number()) })),
  head: z.strictObject({
    hex: z.string(),
    headState: z.number(),
    headDaysLeft: z.number(),
    headSecondsLeft: z.number(),
  }),
  ring: z.array(
    z.strictObject({
      name: z.string(),
      hex: z.string(),
      colour: z.string(),
      display: z.tuple([z.number(), z.number(), z.number()]),
    }),
  ),
});

const SAMPLE = z.strictObject({
  name: z.string(),
  hex: z.string(),
  sessionId: z.number(),
  userId: z.number(),
  targetS: z.number(),
  sectorCount: z.number(),
  startClock: z.number(),
});

const RECORDS = z.strictObject({
  protocol8: z.strictObject({
    hex: z.string(),
    startClock: z.number(),
    sessionId: z.number(),
    userId: z.number(),
    targetS: z.number(),
    sectorCount: z.number(),
    durationS: z.number(),
    highPressureMs: z.number(),
    lowPressureMs: z.number(),
    modeId: z.number(),
    batteryEnd: z.number(),
    clockRead: z.number(),
  }),
  protocol8UnknownBattery: z.string(),
  protocol6: z.array(SAMPLE),
  metadata: z.strictObject({
    hex: z.string(),
    model: z.number(),
    colour: z.number(),
    language: z.number(),
    modeSlots: z.array(z.number()),
  }),
});

const CAPTURE = z.strictObject({
  source: z.string(),
  advert: z.string(),
  initial: z.strictObject({
    ff02: z.string(),
    ff25: z.string(),
    ff26: z.string(),
    ff09: z.string(),
  }),
  notifications: z.array(z.strictObject({ characteristic: z.string(), hex: z.string() })),
});

export const adverts = (): z.infer<typeof ADVERTS> => load('adverts', ADVERTS);

export const gatt = (): z.infer<typeof GATT> => load('gatt', GATT);

export const records = (): z.infer<typeof RECORDS> => load('records', RECORDS);

export const capture = (): z.infer<typeof CAPTURE> => load('s4-capture', CAPTURE);
