import { z } from 'zod';
import { clientPref, noLegacy } from '../client-pref-definition';
import { NODE_KIND_ID } from './node';

export const EDITOR_VIEWS = ['auto', 'canvas', 'outline'] as const;

export const MAX_RECENT_KINDS = 20;
export const MAX_FAVOURITE_KINDS = 60;
export const MAX_BREAKPOINTS_PER_AUTOMATION = 50;
export const MAX_BREAKPOINT_AUTOMATIONS = 200;

export const AUTOMATIONS_EDITOR_PREF = z.strictObject({
  view: z
    .strictObject({
      phone: z.enum(EDITOR_VIEWS),
      tablet: z.enum(EDITOR_VIEWS),
      desktop: z.enum(EDITOR_VIEWS),
    })
    .describe(
      'Which editor view each device class opens: auto picks the best one, canvas is the graph, outline is the readable list',
    ),
});

export type AutomationsEditorPref = z.infer<typeof AUTOMATIONS_EDITOR_PREF>;

export const AUTOMATIONS_PALETTE_PREF = z.strictObject({
  recents: z
    .array(NODE_KIND_ID)
    .max(MAX_RECENT_KINDS)
    .describe('Step kinds the person added most recently, newest first'),
  favourites: z
    .array(NODE_KIND_ID)
    .max(MAX_FAVOURITE_KINDS)
    .describe('Step kinds the person pinned to the top of the palette'),
});

export type AutomationsPalettePref = z.infer<typeof AUTOMATIONS_PALETTE_PREF>;

export const AUTOMATIONS_BREAKPOINTS_PREF = z.strictObject({
  byAutomation: z
    .record(z.uuid(), z.array(z.uuid()).max(MAX_BREAKPOINTS_PER_AUTOMATION))
    .refine((all) => Object.keys(all).length <= MAX_BREAKPOINT_AUTOMATIONS, {
      message: `at most ${String(MAX_BREAKPOINT_AUTOMATIONS)} automations keep breakpoints`,
    })
    .describe(
      'Per automation id, the step ids where a dry run or simulation pauses. Only for this person, never part of the program',
    ),
});

export type AutomationsBreakpointsPref = z.infer<typeof AUTOMATIONS_BREAKPOINTS_PREF>;

export const AUTOMATION_CLIENT_PREFS = {
  automations_editor: clientPref({
    storageKey: 'automations-editor',
    scope: 'profile',
    version: 1,
    defaultValue: {
      view: { phone: 'auto', tablet: 'auto', desktop: 'auto' },
    },
    schema: AUTOMATIONS_EDITOR_PREF,
    legacy: noLegacy,
  }),
  automations_palette: clientPref({
    storageKey: 'automations-palette',
    scope: 'profile',
    version: 1,
    defaultValue: { recents: [], favourites: [] },
    schema: AUTOMATIONS_PALETTE_PREF,
    legacy: noLegacy,
  }),
  automations_breakpoints: clientPref({
    storageKey: 'automations-breakpoints',
    scope: 'profile',
    version: 1,
    defaultValue: { byAutomation: {} },
    schema: AUTOMATIONS_BREAKPOINTS_PREF,
    legacy: noLegacy,
  }),
} as const;
