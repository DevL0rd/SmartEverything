import { z } from 'zod';

const ID = z.uuid();

export const PLANNER_NOISE_COLOURS = ['white', 'pink', 'brown'] as const;

export type PlannerNoiseColour = (typeof PLANNER_NOISE_COLOURS)[number];

const STATION = {
  station_id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  url: z.url({ protocol: /^https?$/ }),
} as const;

export const PLANNER_RADIO_STATION = z.strictObject(STATION).readonly();

export type PlannerRadioStation = z.infer<typeof PLANNER_RADIO_STATION>;

export const PLANNER_RADIO_RESULT = z
  .strictObject({
    ...STATION,
    country: z.string().trim().min(1).nullable(),
    bitrate: z.int().positive().nullable(),
    codec: z.string().trim().min(1).nullable(),
  })
  .readonly();

export type PlannerRadioResult = z.infer<typeof PLANNER_RADIO_RESULT>;

const TONE = z.strictObject({ kind: z.literal('tone'), id: z.string().trim().min(1) });

const NOISE = z.strictObject({ kind: z.literal('noise'), colour: z.enum(PLANNER_NOISE_COLOURS) });

const FILE = z.strictObject({ kind: z.literal('file'), item_id: ID });

const PLAYLIST = z.strictObject({
  kind: z.literal('playlist'),
  item_id: ID,
  shuffle: z.boolean(),
});

const RADIO = z.strictObject({ ...STATION, kind: z.literal('radio') });

export const PLANNER_ALARM_SOUND = z
  .discriminatedUnion('kind', [TONE, FILE, PLAYLIST, RADIO])
  .readonly();

export type PlannerAlarmSound = z.infer<typeof PLANNER_ALARM_SOUND>;

export const PLANNER_SLEEP_SOUND = z
  .discriminatedUnion('kind', [NOISE, FILE, PLAYLIST, RADIO])
  .readonly();

export type PlannerSleepSound = z.infer<typeof PLANNER_SLEEP_SOUND>;

export const PLANNER_RESOLVED_SOUND = z
  .discriminatedUnion('kind', [
    TONE,
    z.strictObject({
      kind: z.literal('file'),
      item_id: ID,
      name: z.string().min(1),
      etag: z.string().min(1),
    }),
    RADIO,
  ])
  .readonly();

export type PlannerResolvedSound = z.infer<typeof PLANNER_RESOLVED_SOUND>;

export const PLANNER_SLEEP_SOURCE = z
  .discriminatedUnion('kind', [
    NOISE,
    z.strictObject({
      kind: z.literal('files'),
      files: z
        .array(
          z.strictObject({
            item_id: ID,
            name: z.string().min(1),
            etag: z.string().min(1),
          }),
        )
        .min(1)
        .readonly(),
      shuffle: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('radio'),
      name: STATION.name,
      url: STATION.url,
    }),
  ])
  .readonly();

export type PlannerSleepSource = z.infer<typeof PLANNER_SLEEP_SOURCE>;
