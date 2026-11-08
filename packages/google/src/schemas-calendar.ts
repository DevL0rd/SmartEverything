import { z } from 'zod';

export const ACCESS_ROLES = ['freeBusyReader', 'reader', 'writer', 'owner'] as const;
export const EVENT_STATUSES = ['confirmed', 'tentative', 'cancelled'] as const;
export const EVENT_TYPES = [
  'default',
  'birthday',
  'focusTime',
  'fromGmail',
  'outOfOffice',
  'workingLocation',
] as const;

export const CalendarListEntrySchema = z.object({
  id: z.string().min(1),
  etag: z.string().optional(),
  summary: z.string().optional(),
  summaryOverride: z.string().optional(),
  description: z.string().optional(),
  timeZone: z.string().optional(),
  colorId: z.string().optional(),
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  accessRole: z.enum(ACCESS_ROLES),
  primary: z.boolean().optional(),
  selected: z.boolean().optional(),
  hidden: z.boolean().optional(),
  deleted: z.boolean().optional(),
});
export type CalendarListEntry = z.infer<typeof CalendarListEntrySchema>;

export const CalendarListSchema = z.object({
  items: z.array(CalendarListEntrySchema).default([]),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});
export type CalendarList = z.infer<typeof CalendarListSchema>;

export const EventTimeSchema = z.object({
  date: z.string().optional(),
  dateTime: z.string().optional(),
  timeZone: z.string().optional(),
});
export type EventTime = z.infer<typeof EventTimeSchema>;

export const ReminderOverrideSchema = z.object({
  method: z.enum(['email', 'popup']),
  minutes: z.number().int().min(0),
});
export type ReminderOverride = z.infer<typeof ReminderOverrideSchema>;

export const EventRemindersSchema = z.object({
  useDefault: z.boolean().optional(),
  overrides: z.array(ReminderOverrideSchema).optional(),
});
export type EventReminders = z.infer<typeof EventRemindersSchema>;

export const EntryPointSchema = z.object({
  entryPointType: z.string(),
  uri: z.string().optional(),
  label: z.string().optional(),
});

export const ConferenceDataSchema = z.object({
  entryPoints: z.array(EntryPointSchema).optional(),
});

export const ExtendedPropertiesSchema = z.object({
  private: z.record(z.string(), z.string()).optional(),
  shared: z.record(z.string(), z.string()).optional(),
});
export type ExtendedProperties = z.infer<typeof ExtendedPropertiesSchema>;

export const GoogleEventSchema = z.object({
  id: z.string().min(1),
  etag: z.string().min(1),
  status: z.enum(EVENT_STATUSES),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  start: EventTimeSchema.optional(),
  end: EventTimeSchema.optional(),
  recurrence: z.array(z.string()).optional(),
  recurringEventId: z.string().optional(),
  originalStartTime: EventTimeSchema.optional(),
  reminders: EventRemindersSchema.optional(),
  conferenceData: ConferenceDataSchema.optional(),
  hangoutLink: z.string().optional(),
  htmlLink: z.string().optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  transparency: z.enum(['opaque', 'transparent']).optional(),
  visibility: z.enum(['default', 'public', 'private', 'confidential']).optional(),
  iCalUID: z.string().optional(),
  sequence: z.number().int().optional(),
  updated: z.string().optional(),
  extendedProperties: ExtendedPropertiesSchema.optional(),
});
export type GoogleEvent = z.infer<typeof GoogleEventSchema>;

export const EventsPageSchema = z.object({
  items: z.array(GoogleEventSchema).default([]),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
  timeZone: z.string().optional(),
  updated: z.string().optional(),
});
export type EventsPage = z.infer<typeof EventsPageSchema>;

export const ColorDefinitionSchema = z.object({
  background: z.string(),
  foreground: z.string(),
});

export const ColorsSchema = z.object({
  calendar: z.record(z.string(), ColorDefinitionSchema).default({}),
  event: z.record(z.string(), ColorDefinitionSchema).default({}),
});
export type Colors = z.infer<typeof ColorsSchema>;
