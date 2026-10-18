import { z } from 'zod';
import { ID } from './api/primitives';
import { NAV_TARGET } from './navigation-layout';

export const APP_VIEW_ACTIONS = ['open', 'highlight', 'dismiss'] as const;

export type AppViewAction = (typeof APP_VIEW_ACTIONS)[number];

export const APP_VIEW_ANSWER_SECONDS = 4;

export const SHOW_IN_APP_INPUT = z.strictObject({
  action: z
    .enum(APP_VIEW_ACTIONS)
    .describe(
      'open: go to the target and, with focus, point at that element. highlight: point at something on the current screen without navigating. dismiss: clear the pointer and close what was opened; the person stays where they are',
    ),
  target: NAV_TARGET.optional().describe(
    'Required for open and highlight. kind nav with node points at a navigation item',
  ),
  focus: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe('A setting id, capability key, section or step id on that page to point at'),
  appId: ID.optional().describe(
    'Which of the person’s apps; default the app this conversation runs in, else the one open in front',
  ),
});

export type ShowInAppInput = z.infer<typeof SHOW_IN_APP_INPUT>;

export const SHOW_IN_APP_TEXT =
  'Show the person something in their app: open a page, point at one thing on it, or clear it. Only when they ask to see, open, find or be shown something. Say what you opened afterwards.';

export const APP_VIEW_REQUEST = z.strictObject({
  requestId: ID,
  action: z.enum(APP_VIEW_ACTIONS),
  target: NAV_TARGET.nullable(),
  focus: z.string().min(1).max(120).nullable(),
});

export type AppViewRequest = z.infer<typeof APP_VIEW_REQUEST>;

export const APP_VIEW_HIGHLIGHT_REASONS = ['not_on_screen', 'unknown_focus'] as const;

export const APP_VIEW_REFUSALS = ['app_not_in_front', 'target_not_found'] as const;

export const APP_VIEW_RESULT = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    opened: z.string().min(1).nullable(),
    highlighted: z.boolean(),
    reason: z.enum(APP_VIEW_HIGHLIGHT_REASONS).nullable(),
  }),
  z.strictObject({ ok: z.literal(false), reason: z.enum(APP_VIEW_REFUSALS) }),
]);

export type AppViewResult = z.infer<typeof APP_VIEW_RESULT>;

export const APP_VIEW_ANSWER = z.strictObject({
  requestId: ID,
  result: APP_VIEW_RESULT,
});

export type AppViewAnswer = z.infer<typeof APP_VIEW_ANSWER>;

export const APP_VIEW_NOTICE = z.strictObject({
  type: z.literal('app_view'),
  request: APP_VIEW_REQUEST,
});

export type AppViewNotice = z.infer<typeof APP_VIEW_NOTICE>;
