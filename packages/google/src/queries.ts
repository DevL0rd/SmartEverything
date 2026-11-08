export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

export const VENDOR_MAX_EVENTS_PAGE = 2500;
export const VENDOR_MAX_TASKS_PAGE = 100;
export const VENDOR_MAX_REMINDER_OVERRIDES = 5;

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query.length === 0 ? path : `${path}?${query}`;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

export interface PageRequest {
  readonly pageToken?: string | undefined;
}

export interface EventsListRequest extends PageRequest {
  readonly calendarId: string;
  readonly syncToken?: string | undefined;
}

export function calendarListQuery(request: PageRequest & { readonly syncToken?: string }): string {
  const params = new URLSearchParams({ showDeleted: 'true', showHidden: 'true' });
  if (request.syncToken !== undefined) params.set('syncToken', request.syncToken);
  if (request.pageToken !== undefined) params.set('pageToken', request.pageToken);
  return withQuery(`${CALENDAR_API}/users/me/calendarList`, params);
}

export function eventsListQuery(request: EventsListRequest): string {
  const params = new URLSearchParams({
    singleEvents: 'false',
    showDeleted: 'true',
    maxResults: String(VENDOR_MAX_EVENTS_PAGE),
  });
  if (request.syncToken !== undefined) params.set('syncToken', request.syncToken);
  if (request.pageToken !== undefined) params.set('pageToken', request.pageToken);
  return withQuery(`${CALENDAR_API}/calendars/${segment(request.calendarId)}/events`, params);
}

export function eventPath(calendarId: string, eventId: string): string {
  return `${CALENDAR_API}/calendars/${segment(calendarId)}/events/${segment(eventId)}`;
}

export function eventInsertPath(calendarId: string): string {
  return `${CALENDAR_API}/calendars/${segment(calendarId)}/events`;
}

export function colorsPath(): string {
  return `${CALENDAR_API}/colors`;
}

export function taskListsQuery(request: PageRequest): string {
  const params = new URLSearchParams({ maxResults: String(VENDOR_MAX_TASKS_PAGE) });
  if (request.pageToken !== undefined) params.set('pageToken', request.pageToken);
  return withQuery(`${TASKS_API}/users/@me/lists`, params);
}

export interface TasksListRequest extends PageRequest {
  readonly taskListId: string;
  readonly updatedMin?: string | undefined;
}

export function tasksListQuery(request: TasksListRequest): string {
  const params = new URLSearchParams({
    showCompleted: 'true',
    showDeleted: 'true',
    showHidden: 'true',
    maxResults: String(VENDOR_MAX_TASKS_PAGE),
  });
  if (request.updatedMin !== undefined) params.set('updatedMin', request.updatedMin);
  if (request.pageToken !== undefined) params.set('pageToken', request.pageToken);
  return withQuery(`${TASKS_API}/lists/${segment(request.taskListId)}/tasks`, params);
}

export function taskPath(taskListId: string, taskId: string): string {
  return `${TASKS_API}/lists/${segment(taskListId)}/tasks/${segment(taskId)}`;
}

export function taskInsertPath(taskListId: string): string {
  return `${TASKS_API}/lists/${segment(taskListId)}/tasks`;
}

export function taskMoveQuery(
  taskListId: string,
  taskId: string,
  placement: { readonly parent?: string; readonly previous?: string },
): string {
  const params = new URLSearchParams();
  if (placement.parent !== undefined) params.set('parent', placement.parent);
  if (placement.previous !== undefined) params.set('previous', placement.previous);
  return withQuery(`${taskPath(taskListId, taskId)}/move`, params);
}
