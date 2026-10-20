import {
  OPERATION,
  STATUS,
  multipartBoundary,
  parseResponse,
  readEvent,
  requireSuccess,
  splitMultipart,
  type IppResponse,
  type PrinterEvent,
} from '@smarteverything/ipp';
import type { HttpReply } from './transport';

export interface Notification {
  readonly events: readonly PrinterEvent[];
  readonly intervalSeconds: number | null;
  readonly lapsed: boolean;
}

const LAPSED_STATUSES: ReadonlySet<number> = new Set([STATUS.notFound, STATUS.gone]);
const WAIT_STATUSES: ReadonlySet<number> = new Set([
  STATUS.busy,
  STATUS.serviceUnavailable,
  STATUS.temporaryError,
]);

function eventsOf(response: IppResponse): readonly PrinterEvent[] {
  return response.events.flatMap((group) => {
    const event = readEvent(group);
    return event === null ? [] : [event];
  });
}

function intervalOf(responses: readonly IppResponse[]): number | null {
  const interval = responses
    .map((response) => response.operation['notify-get-interval'])
    .find((value) => typeof value === 'number');
  return typeof interval === 'number' ? interval : null;
}

export function notificationOf(reply: HttpReply): Notification {
  const boundary = multipartBoundary(reply.contentType);
  const parts = boundary === null ? [reply.body] : splitMultipart(reply.body, boundary);
  const responses = parts.map((part) => parseResponse(part));
  const lapsed = responses.some((response) => LAPSED_STATUSES.has(response.status));
  const answered = responses.filter(
    (response) => !LAPSED_STATUSES.has(response.status) && !WAIT_STATUSES.has(response.status),
  );
  for (const response of answered) requireSuccess(OPERATION.getNotifications, response);
  return {
    events: lapsed ? [] : answered.flatMap(eventsOf),
    intervalSeconds: intervalOf(responses),
    lapsed,
  };
}
