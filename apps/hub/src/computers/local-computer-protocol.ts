import { LOG_LEVELS } from '@smarteverything/logging';
import { LOG_RECORD, type HubFrame } from '@smarteverything/domain';
import { z } from 'zod';

export const LOCAL_COMPUTER_DATA = z.strictObject({
  machineId: z.string().min(1),
  level: z.enum(LOG_LEVELS),
  release: z.string().min(1),
});

export type LocalComputerData = z.output<typeof LOCAL_COMPUTER_DATA>;

const PARSED_HUB_FRAME = z.custom<HubFrame>(
  (value) => typeof value === 'object' && value !== null && 'type' in value,
);

export const TO_LOCAL_COMPUTER = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('frame'), frame: PARSED_HUB_FRAME }),
  z.strictObject({ type: z.literal('stop') }),
]);

export type ToLocalComputer = z.input<typeof TO_LOCAL_COMPUTER>;

export const FROM_LOCAL_COMPUTER = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('frame'), frame: z.unknown() }),
  z.strictObject({ type: z.literal('log'), record: LOG_RECORD }),
]);

export type FromLocalComputer = z.input<typeof FROM_LOCAL_COMPUTER>;
