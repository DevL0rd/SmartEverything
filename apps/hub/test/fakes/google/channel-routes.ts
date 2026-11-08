import type { ChannelHub } from './channels';
import { jsonBody } from './request';
import { CALENDAR_HOST, authed, decodeGroup, type Route } from './route';
import { CALENDAR_LIST_READ, EVENTS_READ } from './scopes';

export function channelRoutes(hub: ChannelHub): readonly Route[] {
  const base = { host: CALENDAR_HOST, method: 'POST' };
  return [
    authed({
      ...base,
      pattern: /^\/calendar\/v3\/calendars\/([^/]+)\/events\/watch$/,
      auth: EVENTS_READ,
      handle: (context, account) => {
        const calendarId = account.calendars.resolveId(decodeGroup(context, 0));
        account.calendars.events(calendarId);
        return hub.watch(account.email, { kind: 'events', calendarId }, jsonBody(context));
      },
    }),
    authed({
      ...base,
      pattern: /^\/calendar\/v3\/users\/me\/calendarList\/watch$/,
      auth: CALENDAR_LIST_READ,
      handle: (context, account) =>
        hub.watch(account.email, { kind: 'calendarList' }, jsonBody(context)),
    }),
    authed({
      ...base,
      pattern: /^\/calendar\/v3\/channels\/stop$/,
      auth: [...CALENDAR_LIST_READ, ...EVENTS_READ],
      handle: (context, account) => hub.stop(account.email, jsonBody(context)),
    }),
  ];
}
