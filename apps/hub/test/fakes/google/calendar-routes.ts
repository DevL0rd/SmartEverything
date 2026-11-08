import type { GoogleAccount } from './account';
import type { FakeClock } from './clock';
import { stringField, type JsonObject } from './json';
import { apiFailure, noContent, ok, type Reply } from './reply';
import { boolParam, intParam, jsonBody, unsupportedParams, type RequestContext } from './request';
import { CALENDAR_HOST, authed, decodeGroup, type AuthedRoute, type Route } from './route';
import { CALENDAR_LIST_READ, EVENTS_READ, EVENTS_WRITE } from './scopes';

const MAX_EVENTS_PAGE = 2500;
const DEFAULT_EVENTS_PAGE = 250;
const MAX_LIST_PAGE = 250;
const UNSUPPORTED_EVENT_FILTERS = [
  'timeMin',
  'timeMax',
  'updatedMin',
  'q',
  'orderBy',
  'iCalUID',
  'privateExtendedProperty',
  'sharedExtendedProperty',
  'timeZone',
  'eventTypes',
];

const COLOURS: Readonly<Record<string, JsonObject>> = {
  '1': { background: '#a4bdfc', foreground: '#1d1d1d' },
  '2': { background: '#7ae7bf', foreground: '#1d1d1d' },
  '3': { background: '#dbadff', foreground: '#1d1d1d' },
  '4': { background: '#ff887c', foreground: '#1d1d1d' },
  '5': { background: '#fbd75b', foreground: '#1d1d1d' },
  '6': { background: '#ffb878', foreground: '#1d1d1d' },
  '7': { background: '#46d6db', foreground: '#1d1d1d' },
  '8': { background: '#e1e1e1', foreground: '#1d1d1d' },
  '9': { background: '#5484ed', foreground: '#1d1d1d' },
  '10': { background: '#51b749', foreground: '#1d1d1d' },
  '11': { background: '#dc2127', foreground: '#1d1d1d' },
};

function requireWriter(account: GoogleAccount, calendarId: string): void {
  const role = account.calendars.accessRole(calendarId);
  if (role !== 'owner' && role !== 'writer') {
    throw apiFailure(
      403,
      'You need to have writer access to this calendar.',
      'requiredAccessLevel',
    );
  }
}

function listCalendars(context: RequestContext, account: GoogleAccount): Reply {
  const page = account.calendars.list({
    syncToken: context.query.get('syncToken'),
    pageToken: context.query.get('pageToken'),
    maxResults: intParam(context.query, 'maxResults', MAX_LIST_PAGE, MAX_LIST_PAGE),
    showDeleted: boolParam(context.query, 'showDeleted', false),
    showHidden: boolParam(context.query, 'showHidden', false),
  });
  return ok({
    kind: 'calendar#calendarList',
    items: page.items,
    ...(page.nextPageToken === null ? {} : { nextPageToken: page.nextPageToken }),
    ...(page.nextSyncToken === null ? {} : { nextSyncToken: page.nextSyncToken }),
  });
}

function listEvents(clock: FakeClock): (context: RequestContext, account: GoogleAccount) => Reply {
  return (context, account) => {
    const calendarId = decodeGroup(context, 0);
    const entry = account.calendars.entry(calendarId);
    const events = account.calendars.events(calendarId);
    unsupportedParams(context.query, UNSUPPORTED_EVENT_FILTERS);
    if (boolParam(context.query, 'singleEvents', false)) {
      throw apiFailure(
        400,
        'The fake Google server does not expand recurring events.',
        'fakeUnsupported',
      );
    }
    const syncToken = context.query.get('syncToken');
    if (syncToken !== null && context.query.get('showDeleted') === 'false') {
      throw apiFailure(400, 'showDeleted cannot be false when a sync token is used.', 'invalid');
    }
    const page = events.list({
      syncToken,
      pageToken: context.query.get('pageToken'),
      maxResults: intParam(context.query, 'maxResults', DEFAULT_EVENTS_PAGE, MAX_EVENTS_PAGE),
      showDeleted: boolParam(context.query, 'showDeleted', false),
    });
    return ok({
      kind: 'calendar#events',
      summary: stringField(entry, 'summary'),
      timeZone: stringField(entry, 'timeZone'),
      accessRole: stringField(entry, 'accessRole'),
      updated: clock.iso(),
      defaultReminders: [],
      items: page.items,
      ...(page.nextPageToken === null ? {} : { nextPageToken: page.nextPageToken }),
      ...(page.nextSyncToken === null ? {} : { nextSyncToken: page.nextSyncToken }),
    });
  };
}

function insertEvent(context: RequestContext, account: GoogleAccount): Reply {
  const calendarId = decodeGroup(context, 0);
  requireWriter(account, calendarId);
  return ok(account.calendars.events(calendarId).insert(jsonBody(context)));
}

function getEvent(context: RequestContext, account: GoogleAccount): Reply {
  return ok(account.calendars.events(decodeGroup(context, 0)).get(decodeGroup(context, 1)));
}

function patchEvent(context: RequestContext, account: GoogleAccount): Reply {
  const calendarId = decodeGroup(context, 0);
  requireWriter(account, calendarId);
  const events = account.calendars.events(calendarId);
  return ok(
    events.patch(decodeGroup(context, 1), jsonBody(context), context.headers.get('if-match')),
  );
}

function deleteEvent(context: RequestContext, account: GoogleAccount): Reply {
  const calendarId = decodeGroup(context, 0);
  requireWriter(account, calendarId);
  account.calendars
    .events(calendarId)
    .remove(decodeGroup(context, 1), context.headers.get('if-match'));
  return noContent();
}

function getColours(): Reply {
  return ok({ kind: 'calendar#colors', calendar: COLOURS, event: COLOURS });
}

function route(
  method: string,
  pattern: RegExp,
  auth: readonly string[],
  handle: AuthedRoute['handle'],
): Route {
  return authed({ host: CALENDAR_HOST, method, pattern, auth, handle });
}

export function calendarRoutes(clock: FakeClock): readonly Route[] {
  const list = /^\/calendar\/v3\/users\/me\/calendarList$/;
  const events = /^\/calendar\/v3\/calendars\/([^/]+)\/events$/;
  const event = /^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/;
  const both = [...CALENDAR_LIST_READ, ...EVENTS_READ];
  return [
    route('GET', list, CALENDAR_LIST_READ, listCalendars),
    route('GET', /^\/calendar\/v3\/colors$/, both, getColours),
    route('GET', events, EVENTS_READ, listEvents(clock)),
    route('POST', events, EVENTS_WRITE, insertEvent),
    route('GET', event, EVENTS_READ, getEvent),
    route('PATCH', event, EVENTS_WRITE, patchEvent),
    route('DELETE', event, EVENTS_WRITE, deleteEvent),
  ];
}
