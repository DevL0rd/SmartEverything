import { z } from 'zod';
import { ID } from './api/primitives';
import { NAV_OPEN_TARGET, NAV_TARGET } from './navigation-layout';

export const APP_VIEW_ACTIONS = ['open', 'highlight', 'dismiss'] as const;

export type AppViewAction = (typeof APP_VIEW_ACTIONS)[number];

export const APP_VIEW_ANSWER_SECONDS = 4;

const APP = ID.describe(
  'Which of the person’s apps; default the app this conversation runs in, else the one open in front',
);

export const SHOW_IN_APP_INPUT = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('open'),
    target: NAV_OPEN_TARGET,
    focus: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('A capability key, step id or setting id on that page to point at after opening'),
    appId: APP.optional(),
  }),
  z.strictObject({
    action: z.literal('highlight'),
    focus: z
      .string()
      .min(1)
      .max(120)
      .describe('The id of the setting, capability, step or navigation item to point at'),
    appId: APP.optional(),
  }),
  z.strictObject({ action: z.literal('dismiss'), appId: APP }),
]);

export type ShowInAppInput = z.infer<typeof SHOW_IN_APP_INPUT>;

export const SHOW_IN_APP_TEXT =
  'Show the person something in their app: open a page, point at one thing on it, or clear the pointer. Only when they ask to see, open, find or be shown something, never on your own. The result says what the app opened or why it could not. Say what you opened afterwards.';

export const APP_VIEW_REQUEST = z.discriminatedUnion('action', [
  z.strictObject({
    requestId: ID,
    action: z.literal('open'),
    target: z.union([NAV_OPEN_TARGET, NAV_TARGET]),
    focus: z.string().min(1).max(120).nullable(),
  }),
  z.strictObject({
    requestId: ID,
    action: z.literal('highlight'),
    focus: z.string().min(1).max(120),
  }),
  z.strictObject({
    requestId: ID,
    action: z.literal('dismiss'),
    target: z.null(),
    focus: z.null(),
  }),
]);

export type AppViewRequest = z.infer<typeof APP_VIEW_REQUEST>;

export const APP_VIEW_HIGHLIGHT_REASONS = ['not_on_screen', 'unknown_focus'] as const;

export const APP_VIEW_REFUSALS = ['app_not_in_front', 'target_not_found'] as const;

export const SHOW_IN_APP_FAILURES = [...APP_VIEW_REFUSALS, 'not_connected', 'no_answer'] as const;

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

export const SHOW_IN_APP_RESULT = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    app: z.string().min(1),
    opened: z.string().min(1).nullable(),
    highlighted: z.boolean(),
    reason: z.enum(APP_VIEW_HIGHLIGHT_REASONS).nullable(),
  }),
  z.strictObject({
    ok: z.literal(false),
    app: z.string().min(1),
    reason: z.enum(SHOW_IN_APP_FAILURES),
    detail: z.string().min(1),
  }),
]);

export type ShowInAppResult = z.infer<typeof SHOW_IN_APP_RESULT>;
