import { z } from 'zod';
import { DRIVE_ITEM } from './item';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_SUGGESTION_REASONS = [
  'opened',
  'edited',
  'edited_by',
  'shared',
  'commented',
  'mentioned',
] as const;

export type DriveSuggestionReason = (typeof DRIVE_SUGGESTION_REASONS)[number];

const WHEN = { item: DRIVE_ITEM, at: MOMENT };

export const DRIVE_SUGGESTION = z
  .discriminatedUnion('reason', [
    z.strictObject({ ...WHEN, reason: z.literal('opened') }),
    z.strictObject({ ...WHEN, reason: z.literal('edited') }),
    z.strictObject({ ...WHEN, reason: z.literal('edited_by'), actorProfileId: ID }),
    z.strictObject({ ...WHEN, reason: z.literal('shared'), actorProfileId: ID }),
    z.strictObject({ ...WHEN, reason: z.literal('commented'), actorProfileId: ID }),
    z.strictObject({ ...WHEN, reason: z.literal('mentioned'), actorProfileId: ID }),
  ])
  .readonly();

export type DriveSuggestion = z.infer<typeof DRIVE_SUGGESTION>;
