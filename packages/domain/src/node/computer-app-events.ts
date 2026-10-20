import { z } from 'zod';
import type { EventKind } from '../events';
import { SESSION_APP } from './computer-session-state';

export const APP_EVENT_KINDS = ['opened', 'closed', 'focused', 'unfocused'] as const;

export type AppEventKind = (typeof APP_EVENT_KINDS)[number];

export const APP_EVENT_TITLE_LONGEST = 300;

export const APP_EVENT = z.strictObject({
  kind: z.enum(APP_EVENT_KINDS),
  app: SESSION_APP,
  title: z.string().max(APP_EVENT_TITLE_LONGEST).nullable(),
});

export type AppEvent = z.infer<typeof APP_EVENT>;

export const APP_EVENTS_FRAME = z.strictObject({
  type: z.literal('app_events'),
  at: z.iso.datetime({ offset: true }),
  baseline: z.boolean(),
  events: z.array(APP_EVENT).min(1),
});

export const APP_EVENT_STATES = {
  opened: { kind: 'app_open', value: true },
  closed: { kind: 'app_open', value: false },
  focused: { kind: 'app_focus', value: true },
  unfocused: { kind: 'app_focus', value: false },
} as const satisfies Readonly<
  Record<AppEventKind, { readonly kind: string; readonly value: boolean }>
>;

export const APP_EVENT_DEVICE_KINDS = {
  opened: 'app_opened',
  closed: 'app_closed',
  focused: 'app_focused',
  unfocused: 'app_unfocused',
} as const satisfies Readonly<Record<AppEventKind, EventKind>>;

const APP_EVENT_PHRASES = {
  opened: 'opened',
  closed: 'closed',
  focused: 'came to the front',
  unfocused: 'left the front',
} as const satisfies Readonly<Record<AppEventKind, string>>;

export function appEventSummary(kind: AppEventKind, appName: string): string {
  return `${appName} ${APP_EVENT_PHRASES[kind]}`;
}
