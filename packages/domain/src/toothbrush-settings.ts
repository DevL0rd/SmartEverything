import { z } from 'zod';
import { BRUSHING_GOAL, DEFAULT_GOAL, type BrushingGoal } from './brushing-session';
import {
  BATTERY_LOW_PERCENT,
  BRUSH_INTENSITIES,
  BRUSH_POLICIES,
  HEAD_DUE_PERCENT,
  HEAD_WARN_PERCENT,
  SENSOR_MOTION,
  SENSOR_PRESSURE,
  SENSOR_TEMPERATURE,
  ORALB_SETTINGS,
  SONICARE_MODES,
  ORALB_SETTINGS_CHANGE,
  type BrushBrand,
  type BrushProfile,
  type SonicareProfile,
} from './toothbrush';

const PERCENT = z.number().int().min(1).max(100);

export const BRUSH_ALERTS = z.strictObject({
  headWarnPercent: PERCENT.default(HEAD_WARN_PERCENT),
  headDuePercent: PERCENT.default(HEAD_DUE_PERCENT),
  batteryLowPercent: PERCENT.default(BATTERY_LOW_PERCENT),
  counterfeitWarning: z.boolean().default(true),
});

export type BrushAlerts = z.infer<typeof BRUSH_ALERTS>;

export const BRUSH_SENSORS = z.strictObject({
  pressure: z.boolean().default(true),
  temperature: z.boolean().default(true),
  motion: z.boolean().default(false),
});

export type BrushSensors = z.infer<typeof BRUSH_SENSORS>;

export const BRUSH_SETTINGS = z.strictObject({
  policy: z.enum(BRUSH_POLICIES).default('on_demand'),
  personId: z.string().min(1).nullable().default(null),
  model: z.string().min(1).nullable().default(null),
  consent: z.boolean().default(false),
  defaultMode: z.enum(SONICARE_MODES).nullable().default(null),
  defaultIntensity: z.enum(BRUSH_INTENSITIES).nullable().default(null),
  alerts: BRUSH_ALERTS.default(BRUSH_ALERTS.parse({})),
  sensors: BRUSH_SENSORS.default(BRUSH_SENSORS.parse({})),
  goals: z.record(z.string(), BRUSHING_GOAL).default({}),
  syncedThrough: z.number().int().nonnegative().nullable().default(null),
  oralb: ORALB_SETTINGS.nullable().default(null),
});

export type BrushSettings = z.infer<typeof BRUSH_SETTINGS>;

export const BRUSH_SETTINGS_CHANGE = z.strictObject({
  policy: BRUSH_SETTINGS.shape.policy.unwrap().optional(),
  personId: BRUSH_SETTINGS.shape.personId.unwrap().optional(),
  model: BRUSH_SETTINGS.shape.model.unwrap().optional(),
  consent: z.boolean().optional(),
  defaultMode: BRUSH_SETTINGS.shape.defaultMode.unwrap().optional(),
  defaultIntensity: BRUSH_SETTINGS.shape.defaultIntensity.unwrap().optional(),
  alerts: z
    .strictObject({
      headWarnPercent: BRUSH_ALERTS.shape.headWarnPercent.unwrap().optional(),
      headDuePercent: BRUSH_ALERTS.shape.headDuePercent.unwrap().optional(),
      batteryLowPercent: BRUSH_ALERTS.shape.batteryLowPercent.unwrap().optional(),
      counterfeitWarning: BRUSH_ALERTS.shape.counterfeitWarning.unwrap().optional(),
    })
    .optional(),
  sensors: z
    .strictObject({
      pressure: BRUSH_SENSORS.shape.pressure.unwrap().optional(),
      temperature: BRUSH_SENSORS.shape.temperature.unwrap().optional(),
      motion: BRUSH_SENSORS.shape.motion.unwrap().optional(),
    })
    .optional(),
  oralb: ORALB_SETTINGS_CHANGE.optional(),
});

export type BrushSettingsChange = z.infer<typeof BRUSH_SETTINGS_CHANGE>;

export function brushSettingsOf(raw: unknown, brand: BrushBrand = 'sonicare'): BrushSettings {
  const settings = BRUSH_SETTINGS.parse(raw ?? {});
  return brand === 'oralb' && settings.oralb === null
    ? { ...settings, oralb: ORALB_SETTINGS.parse({}) }
    : settings;
}

export function brushGoalOf(settings: BrushSettings, personId: string | null): BrushingGoal {
  const own = personId === null ? undefined : settings.goals[personId];
  return own ?? DEFAULT_GOAL;
}

export function sensorMaskOf(sensors: BrushSensors, profile: SonicareProfile): number {
  const pressure = sensors.pressure && profile.pressure !== 'none' ? SENSOR_PRESSURE : 0;
  const temperature = sensors.temperature && profile.temperature ? SENSOR_TEMPERATURE : 0;
  const motion = sensors.motion && profile.motion ? SENSOR_MOTION : 0;
  return pressure | temperature | motion;
}

export function mayWriteHandle(profile: BrushProfile, settings: BrushSettings): boolean {
  return profile.writes && settings.consent;
}
