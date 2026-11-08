const AUTH = 'https://www.googleapis.com/auth/';

export const SCOPES = {
  email: `${AUTH}userinfo.email`,
  calendar: `${AUTH}calendar`,
  calendarReadonly: `${AUTH}calendar.readonly`,
  calendarEvents: `${AUTH}calendar.events`,
  calendarEventsReadonly: `${AUTH}calendar.events.readonly`,
  calendarList: `${AUTH}calendar.calendarlist`,
  calendarListReadonly: `${AUTH}calendar.calendarlist.readonly`,
  tasks: `${AUTH}tasks`,
  tasksReadonly: `${AUTH}tasks.readonly`,
} as const;

export const CALENDAR_LIST_READ: readonly string[] = [
  SCOPES.calendarListReadonly,
  SCOPES.calendarList,
  SCOPES.calendar,
  SCOPES.calendarReadonly,
];

export const EVENTS_READ: readonly string[] = [
  SCOPES.calendarEvents,
  SCOPES.calendarEventsReadonly,
  SCOPES.calendar,
  SCOPES.calendarReadonly,
];

export const EVENTS_WRITE: readonly string[] = [SCOPES.calendarEvents, SCOPES.calendar];

export const TASKS_READ: readonly string[] = [SCOPES.tasks, SCOPES.tasksReadonly];

export const TASKS_WRITE: readonly string[] = [SCOPES.tasks];

export const IDENTITY_READ: readonly string[] = [SCOPES.email, 'openid'];

const BARE_SCOPES = new Set(['openid', 'email', 'profile']);

export function normaliseScope(scope: string): string {
  return scope === 'email' ? SCOPES.email : scope;
}

export function isKnownScope(scope: string): boolean {
  return BARE_SCOPES.has(scope) || scope.startsWith(AUTH);
}
