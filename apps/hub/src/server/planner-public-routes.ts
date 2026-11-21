import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  PLANNER_BOOKING_PATHS,
  PLANNER_BOOKING_REQUEST,
  PLANNER_BOOKING_SLOTS_QUERY,
  PLANNER_RSVP_BODY,
  PLANNER_RSVP_PAGE_QUERY,
  PLANNER_RSVP_PATHS,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { BookingService } from '../planner/booking/service';
import type { PublicRsvp } from '../planner/invites/public';
import { bookingPageHtml } from '../planner/public-pages/booking-page';
import { rsvpPageHtml } from '../planner/public-pages/rsvp-page';
import { noticePageHtml } from '../planner/public-pages/shell';
import { apiErrorFor } from './errors';
import { invalid } from './invalid';
import { PUBLIC_BODY_LIMIT, parseJsonBody, readBody, sendJson } from './http';
import type { RawRoute } from './http-server';

export interface PlannerPublicServices {
  readonly rsvp: Pick<PublicRsvp, 'pageOf' | 'respond'>;
  readonly booking: Pick<BookingService, 'view' | 'slots' | 'book'>;
}

type Params = Readonly<Record<string, string>>;

const FORM_TYPE = 'application/x-www-form-urlencoded';

function headers(nonce: string | null): Record<string, string> {
  const script = nonce === null ? [] : [`script-src 'nonce-${nonce}'`, "connect-src 'self'"];
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      ...script,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

function sendHtml(response: ServerResponse, status: number, html: string, nonce?: string): void {
  response.writeHead(status, headers(nonce ?? null));
  response.end(html);
}

function sendProblem(response: ServerResponse, cause: unknown): void {
  const error = apiErrorFor(cause);
  if (error === null) throw cause;
  const gone = error.code === 'not_found';
  sendHtml(
    response,
    error.status,
    noticePageHtml(
      gone ? 'This link is no longer available' : 'That did not work',
      gone ? 'Ask the person who sent it for a new one.' : error.message,
    ),
  );
}

function queryOf<S extends z.ZodType>(request: IncomingMessage, schema: S): z.output<S> {
  const url = new URL(request.url ?? '/', 'http://server');
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw invalid('query', parsed.error);
  return parsed.data;
}

async function bodyOf<S extends z.ZodType>(
  request: IncomingMessage,
  schema: S,
): Promise<z.output<S>> {
  const raw = await readBody(request, PUBLIC_BODY_LIMIT);
  const type = (request.headers['content-type'] ?? '').toLowerCase();
  const value: unknown = type.startsWith(FORM_TYPE)
    ? Object.fromEntries(
        [...new URLSearchParams(raw.toString('utf8'))].filter(([, field]) => field.trim() !== ''),
      )
    : parseJsonBody(request, raw);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalid('request', parsed.error);
  return parsed.data;
}

function tokenOf(params: Params): string {
  return params['token'] ?? '';
}

async function rsvpPage(
  services: PlannerPublicServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  try {
    const token = tokenOf(params);
    const { answer = null } = queryOf(request, PLANNER_RSVP_PAGE_QUERY);
    sendHtml(response, 200, rsvpPageHtml(await services.rsvp.pageOf(token), { token, answer }));
  } catch (cause) {
    sendProblem(response, cause);
  }
}

async function rsvpAnswer(
  services: PlannerPublicServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const token = tokenOf(params);
  const asForm = (request.headers['content-type'] ?? '').toLowerCase().startsWith(FORM_TYPE);
  try {
    const answer = await bodyOf(request, PLANNER_RSVP_BODY);
    const receipt = await services.rsvp.respond(token, {
      response: answer.response,
      note: answer.note,
    });
    if (!asForm) {
      sendJson(response, 200, receipt);
      return;
    }
    sendHtml(
      response,
      200,
      rsvpPageHtml(await services.rsvp.pageOf(token), { token, answer: null }),
    );
  } catch (cause) {
    if (!asForm) throw cause;
    sendProblem(response, cause);
  }
}

async function bookingPage(
  services: PlannerPublicServices,
  _request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  try {
    const nonce = randomBytes(16).toString('base64');
    sendHtml(
      response,
      200,
      bookingPageHtml(await services.booking.view(tokenOf(params)), nonce),
      nonce,
    );
  } catch (cause) {
    sendProblem(response, cause);
  }
}

async function bookingSlots(
  services: PlannerPublicServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const query = queryOf(request, PLANNER_BOOKING_SLOTS_QUERY);
  sendJson(response, 200, await services.booking.slots(tokenOf(params), query));
}

async function bookingBook(
  services: PlannerPublicServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const body = await bodyOf(request, PLANNER_BOOKING_REQUEST);
  sendJson(response, 200, await services.booking.book(tokenOf(params), body));
}

type Handler = (
  services: PlannerPublicServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
) => Promise<void> | void;

const bound =
  (services: PlannerPublicServices, handler: Handler): RawRoute['handle'] =>
  async (request, response, params) => {
    await handler(services, request, response, params);
  };

export function plannerPublicRoutes(services: PlannerPublicServices): readonly RawRoute[] {
  return [
    { method: 'GET', path: PLANNER_RSVP_PATHS.page, handle: bound(services, rsvpPage) },
    { method: 'POST', path: PLANNER_RSVP_PATHS.page, handle: bound(services, rsvpAnswer) },
    { method: 'GET', path: PLANNER_BOOKING_PATHS.page, handle: bound(services, bookingPage) },
    { method: 'GET', path: PLANNER_BOOKING_PATHS.slots, handle: bound(services, bookingSlots) },
    { method: 'POST', path: PLANNER_BOOKING_PATHS.book, handle: bound(services, bookingBook) },
  ];
}
