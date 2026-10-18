import { z } from 'zod';

const HOUR_MS = 3_600_000;

export const DIFFUSER_STRENGTH_IDS = ['light', 'medium', 'strong'] as const;

export type DiffuserStrengthId = (typeof DIFFUSER_STRENGTH_IDS)[number];

export type DiffuserStrength = DiffuserStrengthId | 'custom';

export const DIFFUSER_STRENGTH_LABELS: Readonly<Record<DiffuserStrength, string>> = {
  light: 'Light',
  medium: 'Medium',
  strong: 'Strong',
  custom: 'Custom',
};

export interface SprayRhythm {
  readonly intervalMinutes: number;
  readonly durationSeconds: number;
}

export const DIFFUSER_STRENGTHS: Readonly<Record<DiffuserStrengthId, SprayRhythm>> = {
  light: { intervalMinutes: 20, durationSeconds: 2 },
  medium: { intervalMinutes: 15, durationSeconds: 4 },
  strong: { intervalMinutes: 10, durationSeconds: 6 },
};

export interface StrengthStep {
  readonly role: 'spray_interval' | 'spray_duration';
  readonly value: number;
}

export function diffuserStrength(rhythm: SprayRhythm): DiffuserStrength {
  return (
    DIFFUSER_STRENGTH_IDS.find(
      (id) =>
        DIFFUSER_STRENGTHS[id].intervalMinutes === rhythm.intervalMinutes &&
        DIFFUSER_STRENGTHS[id].durationSeconds === rhythm.durationSeconds,
    ) ?? 'custom'
  );
}

export function strengthPlan(id: DiffuserStrengthId): readonly [StrengthStep, StrengthStep] {
  const { intervalMinutes, durationSeconds } = DIFFUSER_STRENGTHS[id];
  return [
    { role: 'spray_interval', value: intervalMinutes },
    { role: 'spray_duration', value: durationSeconds },
  ];
}

export const DEVICE_REFILLS = z
  .record(z.uuid(), z.iso.datetime({ offset: true }))
  .describe(
    'When each scent diffuser was last refilled with fragrance, as device id to ISO time, shared by the whole household; the diffusers have no fragrance sensor, so this is the only record. Say a diffuser was refilled with call_operation recordDeviceRefill',
  );

export type DeviceRefills = z.infer<typeof DEVICE_REFILLS>;

export function withRefill(refills: DeviceRefills, deviceId: string, at: Date): DeviceRefills {
  return { ...refills, [deviceId]: at.toISOString() };
}

export function hoursSinceRefill(refilledAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(refilledAt)) / HOUR_MS));
}
