import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import {
  PLANNER_BOOKING_CONFIRMATION,
  PLANNER_BOOKING_PAGE_ROW,
  PLANNER_BOOKING_SLOTS,
  type CommittedNotice,
  type PlannerBookingPageRow,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailService } from '../../src/mail/service';
import { MailSettingsStore } from '../../src/mail/settings';
import { BookingService } from '../../src/planner/booking/service';
import { bookableSlots } from '../../src/planner/booking/slots';
import { PublicRsvp } from '../../src/planner/invites/public';
import { InviteService } from '../../src/planner/invites/service';
import { CollaborationDesk } from '../../src/planner/sharing/desk';
import { SecretStore } from '../../src/secrets/store';
import type { Caller } from '../../src/server/auth';
import { plannerBookingRoutes } from '../../src/server/handlers/planner-booking';
import { plannerPublicRoutes } from '../../src/server/planner-public-routes';
import { httpFailureOf } from '../../src/server/errors';
import { sendError } from '../../src/server/http';
import type { Bound } from '../../src/server/router';
import { startFakeSmtp, type FakeSmtp } from '../fakes/smtp/server';
import { calendarOf, eventOf } from '../support/collab-fixtures';
import { testLogger } from '../support/logs';
import { readable } from '../support/mail-fixtures';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let now = new Date('2026-11-14T08:00:00.000Z');

const WEEKDAYS = [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' }));
const MONDAY = '2026-11-16';

let test: TestStore;
let ann: TestPerson;
let smtp: FakeSmtp;
let invites: InviteService;
let booking: BookingService;
let rsvp: PublicRsvp;
let calendarId: string;
let notices: CommittedNotice[];
let signals: SignalInput[];
let stops: (() => void)[];

function pageOf(overrides: Partial<PlannerBookingPageRow> = {}): PlannerBookingPageRow {
  return test.store.plannerBookingPages.insert(ann.profileId, {
    profile_id: ann.profileId,
    collection_id: calendarId,
    title: 'Intro call',
    description: 'Thirty minutes',
    minutes: 30,
    availability: WEEKDAYS,
    buffer_before: 0,
    buffer_after: 0,
    notice_minutes: 60,
    ahead_days: 14,
    location: 'Phone',
    enabled: true,
    ...overrides,
  });
}

const day = (date: string): { from: string; to: string } => ({
  from: `${date}T00:00:00.000Z`,
  to: `${date}T23:59:59.000Z`,
});

const starts = (page: PlannerBookingPageRow, date: string): string[] =>
  booking.slots(page.token, day(date)).slots.map((slot) => slot.start.slice(11, 16));

beforeEach(async () => {
  now = new Date('2026-11-14T08:00:00.000Z');
  test = await testStore(() => now);
  ann = addPerson(test, 'Ann', 'owner');
  calendarId = calendarOf(test.store, ann.profileId).id;
  smtp = await startFakeSmtp();
  const secrets = await SecretStore.open(join(test.directory, 'secrets'), Buffer.alloc(32, 3));
  const settings = new MailSettingsStore({ settingsKv: test.store.settingsKv, secrets });
  await settings.write({
    host: '127.0.0.1',
    port: smtp.port,
    security: 'none',
    user: null,
    from_name: 'Ann',
    from_address: 'ann@example.com',
    password: { action: 'keep' },
  });
  const mail = new MailService({ settings, store: test.store, log: testLogger('mail') });
  invites = new InviteService({
    store: test.store,
    mail,
    key: Buffer.alloc(32, 5),
    origin: (): string => 'http://hub.test',
    now: (): Date => now,
    log: testLogger('planner'),
  });
  notices = [];
  signals = [];
  booking = new BookingService({
    store: test.store,
    invites,
    now: (): Date => now,
    emit: (signal): void => {
      signals.push(signal);
    },
  });
  rsvp = new PublicRsvp({ store: test.store, now: (): Date => now });
  const desk = new CollaborationDesk({
    store: test.store,
    clock: { now: (): Date => now },
    emit: (): void => undefined,
  });
  desk.start();
  stops = [
    (): void => {
      desk.stop();
    },
    test.store.feed.subscribe((change): void => {
      invites.follow(change);
    }),
    test.store.feed.subscribeNotices((notice): void => {
      notices.push(notice);
    }),
  ];
});

afterEach(async () => {
  for (const stop of stops) stop();
  await smtp.close();
  await test.close();
});

describe('bookable times', () => {
  it('offers the weekly windows in steps of the page length and nothing on a weekend', () => {
    const page = pageOf();
    const monday = starts(page, MONDAY);
    expect(monday).toHaveLength(16);
    expect(monday[0]).toBe('09:00');
    expect(monday.at(-1)).toBe('16:30');
    expect(starts(page, '2026-11-15')).toEqual([]);
    expect(PLANNER_BOOKING_SLOTS.parse(booking.slots(page.token, day(MONDAY)))).toMatchObject({
      page: { title: 'Intro call', host: 'Ann', minutes: 30, host_time_zone: 'UTC' },
    });
  });

  it('keeps the minimum notice and the booking horizon', () => {
    now = new Date('2026-11-16T08:30:00.000Z');
    const page = pageOf({ notice_minutes: 60, ahead_days: 1 });
    expect(starts(page, MONDAY)[0]).toBe('09:30');
    expect(starts(page, '2026-11-17').length).toBeLessThan(16);
    expect(starts(page, '2026-11-18')).toEqual([]);
  });

  it('takes the buffers around busy time out', () => {
    const page = pageOf({ buffer_before: 15, buffer_after: 15 });
    eventOf(test.store, ann.profileId, calendarId, {
      start_local: `${MONDAY}T10:00`,
      end_local: `${MONDAY}T11:00`,
    });
    const times = starts(page, MONDAY);
    expect(times).toContain('09:00');
    expect(times).not.toContain('09:30');
    expect(times).not.toContain('10:30');
    expect(times).toContain('11:30');
  });

  it('does not block on all-day items and blocks on accepted or maybe guests only', () => {
    const page = pageOf();
    const bob = addPerson(test, 'Bob', 'member');
    const bobsCalendar = calendarOf(test.store, bob.profileId, { name: 'Bob' });
    eventOf(test.store, ann.profileId, calendarId, {
      all_day: true,
      time_zone: null,
      start_local: MONDAY,
      end_local: null,
    });
    expect(starts(page, MONDAY)).toHaveLength(16);
    const answers = ['needs_action', 'no', 'yes', 'maybe'] as const;
    answers.forEach((answer, index) => {
      const hour = String(9 + index).padStart(2, '0');
      const invited = eventOf(test.store, bob.profileId, bobsCalendar.id, {
        start_local: `${MONDAY}T${hour}:00`,
        end_local: `${MONDAY}T${hour}:30`,
      });
      const guest = test.store.plannerGuests.insert({
        item_id: invited.id,
        kind: 'person',
        profile_id: ann.profileId,
        email: null,
        name: null,
        delivery: 'not_sent',
        delivery_detail: null,
        token_hash: null,
      });
      if (answer !== 'needs_action') {
        test.store.plannerGuests.update(guest.id, {
          response: answer,
          responded_at: now.toISOString(),
        });
      }
    });
    const times = starts(page, MONDAY);
    expect(times).toContain('09:00');
    expect(times).toContain('10:00');
    expect(times).not.toContain('11:00');
    expect(times).not.toContain('12:00');
    expect(times).toContain('13:00');
  });

  it('refuses a page that is off, unknown or malformed', () => {
    const page = pageOf({ enabled: false });
    expect(() => booking.view(page.token)).toThrow(/not available/);
    expect(() => booking.view('x'.repeat(43))).toThrow(/not available/);
    expect(() => booking.view('nope')).toThrow(/not available/);
  });

  it('computes slots in the host zone across a daylight saving change', () => {
    const page = pageOf({ availability: [{ day: 1, start: '09:00', end: '10:00' }] });
    const slots = bookableSlots(test.store, {
      page,
      from: Temporal.Instant.from('2026-11-16T00:00:00Z'),
      to: Temporal.Instant.from('2026-11-17T00:00:00Z'),
      now: Temporal.Instant.from(now.toISOString()),
      timeZone: 'Europe/Berlin',
    });
    expect(slots.map((slot) => slot.start)).toEqual([
      '2026-11-16T08:00:00.000Z',
      '2026-11-16T08:30:00.000Z',
    ]);
  });
});

describe('making a booking', () => {
  const request = (start: string): Parameters<BookingService['book']>[1] => ({
    name: 'Sam',
    email: 'sam@example.com',
    note: 'Looking forward',
    start,
    time_zone: 'Europe/Paris',
  });

  it('adds the event, the booker as a guest who said yes, a notice and a confirmation mail', async () => {
    const page = pageOf();
    const confirmation = PLANNER_BOOKING_CONFIRMATION.parse(
      await booking.book(page.token, request(`${MONDAY}T10:00:00.000Z`)),
    );
    expect(confirmation).toMatchObject({
      title: 'Intro call',
      start: `${MONDAY}T10:00:00.000Z`,
      end: `${MONDAY}T10:30:00.000Z`,
      location: 'Phone',
    });
    expect(confirmation.cancel_path).toMatch(/^\/rsvp\/[A-Za-z0-9_-]{43}$/);
    const item = test.store.plannerItems.list(ann.profileId, { collectionIds: [calendarId] })[0];
    expect(item).toMatchObject({
      created_by: 'booking',
      title: 'Intro call: Sam',
      booking_page_id: page.id,
      notes: 'Looking forward',
      location: 'Phone',
      start_local: `${MONDAY}T10:00`,
    });
    const [guest] = test.store.plannerGuests.forItem(item?.id ?? '');
    expect(guest).toMatchObject({ kind: 'email', response: 'yes', name: 'Sam', delivery: 'sent' });
    expect(notices.find((notice) => notice.type === 'planner_booked')).toMatchObject({
      personId: ann.profileId,
      pageId: page.id,
      startsAt: `${MONDAY}T10:00:00.000Z`,
    });
    expect(signals.map((signal) => signal.kind)).toEqual(['booking_made']);
    expect(notices.filter((notice) => notice.type === 'planner_rsvp')).toEqual([]);
    expect(smtp.mails).toHaveLength(1);
    const text = readable(smtp.mails[0]?.data ?? '');
    expect(text).toContain('Subject: Confirmed: Intro call: Sam');
    expect(text).toContain('Cancel the booking: http://hub.test/rsvp/');
    expect(text).toContain('METHOD:REQUEST');
    expect(starts(page, MONDAY)).not.toContain('10:00');
  });

  it('refuses a second booking of the same time and a time that is not offered', async () => {
    const page = pageOf();
    await booking.book(page.token, request(`${MONDAY}T10:00:00.000Z`));
    await expect(
      booking.book(page.token, request(`${MONDAY}T10:00:00.000Z`)),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      booking.book(page.token, request(`${MONDAY}T10:10:00.000Z`)),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      booking.book(page.token, request('2026-11-15T10:00:00.000Z')),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(
      test.store.plannerItems.list(ann.profileId, { collectionIds: [calendarId] }),
    ).toHaveLength(1);
  });

  it('lets the booker cancel through the answer page and keeps the time held', async () => {
    const page = pageOf();
    const confirmation = await booking.book(page.token, request(`${MONDAY}T10:00:00.000Z`));
    await invites.idle();
    const token = confirmation.cancel_path.slice('/rsvp/'.length);
    expect(rsvp.pageOf(token)).toMatchObject({ booking: true, cancelled: false });
    rsvp.respond(token, { response: 'no', note: 'Sorry' });
    await invites.idle();
    const item = test.store.plannerItems.list(ann.profileId, { collectionIds: [calendarId] })[0];
    expect(item?.status).toBe('cancelled');
    expect(rsvp.pageOf(token).cancelled).toBe(true);
    expect(readable(smtp.mails.at(-1)?.data ?? '')).toContain('METHOD:CANCEL');
    expect(starts(page, MONDAY)).not.toContain('10:00');
    expect(notices.some((notice) => notice.type === 'planner_rsvp')).toBe(true);
  });

  it('stops mailing after a book, cancel and rebook loop on the same time', async () => {
    const page = pageOf();
    const confirmation = await booking.book(page.token, request(`${MONDAY}T10:00:00.000Z`));
    await invites.idle();
    rsvp.respond(confirmation.cancel_path.slice('/rsvp/'.length), { response: 'no', note: null });
    await invites.idle();
    const sent = smtp.mails.length;
    await expect(
      booking.book(page.token, request(`${MONDAY}T10:00:00.000Z`)),
    ).rejects.toMatchObject({ code: 'conflict' });
    await invites.idle();
    expect(smtp.mails).toHaveLength(sent);
  });

  it('books without a mail server and still gives the cancel link', async () => {
    const quiet = new BookingService({
      store: test.store,
      invites: new InviteService({
        store: test.store,
        mail: {
          configured: false,
          fromAddress: (): null => null,
          fromName: (): null => null,
          send: (): Promise<never> => Promise.reject(new Error('no')),
        },
        key: Buffer.alloc(32, 5),
        origin: (): string => 'http://hub.test',
        now: (): Date => now,
        log: testLogger('planner'),
      }),
      now: (): Date => now,
      emit: (): void => undefined,
    });
    const page = pageOf();
    const confirmation = await quiet.book(page.token, request(`${MONDAY}T11:00:00.000Z`));
    expect(confirmation.cancel_path).toMatch(/^\/rsvp\//);
    expect(smtp.mails).toEqual([]);
  });
});

const as = (person: TestPerson): Caller => ({ kind: 'client', client: person.client });

const call = (
  route: Bound,
  person: TestPerson,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    as(person),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

describe('the booking page routes', () => {
  it('creates, lists, changes, resets and deletes pages of the caller', async () => {
    const routes = plannerBookingRoutes({ store: test.store });
    const created = PLANNER_BOOKING_PAGE_ROW.parse(
      await call(routes.createPlannerBookingPage, ann, {
        body: {
          collection_id: calendarId,
          title: 'Chat',
          minutes: 20,
          availability: WEEKDAYS,
          notice_minutes: 0,
          ahead_days: 30,
        },
      }),
    );
    expect(created).toMatchObject({
      title: 'Chat',
      buffer_before: 0,
      enabled: true,
      location: null,
    });
    const listed = await call(routes.listPlannerBookingPages, ann);
    expect(listed).toHaveLength(1);
    const changed = PLANNER_BOOKING_PAGE_ROW.parse(
      await call(routes.updatePlannerBookingPage, ann, {
        params: { pageId: created.id },
        body: { enabled: false, minutes: 45 },
      }),
    );
    expect(changed).toMatchObject({ enabled: false, minutes: 45 });
    const reset = PLANNER_BOOKING_PAGE_ROW.parse(
      await call(routes.resetPlannerBookingLink, ann, { params: { pageId: created.id } }),
    );
    expect(reset.token).not.toBe(created.token);
    expect(() => booking.view(created.token)).toThrow(/not available/);
    await call(routes.deletePlannerBookingPage, ann, { params: { pageId: created.id } });
    expect(await call(routes.listPlannerBookingPages, ann)).toEqual([]);
  });

  it('keeps pages private to their owner and refuses a list or a subscription as the target', async () => {
    const routes = plannerBookingRoutes({ store: test.store });
    const bob = addPerson(test, 'Bob', 'member');
    const page = pageOf();
    await expect(
      call(routes.updatePlannerBookingPage, bob, {
        params: { pageId: page.id },
        body: { title: 'Mine' },
      }),
    ).rejects.toThrow(/no planner booking page/);
    expect(await call(routes.listPlannerBookingPages, bob)).toEqual([]);
    const list = calendarOf(test.store, ann.profileId, { kind: 'list', name: 'Tasks' });
    await expect(
      call(routes.updatePlannerBookingPage, ann, {
        params: { pageId: page.id },
        body: { collection_id: list.id },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    const feed = calendarOf(test.store, ann.profileId, {
      source: 'feed',
      name: 'Feed',
      feed: {
        kind: 'ics',
        url: 'https://example.com/a.ics',
        refresh_minutes: 60,
        etag: null,
        last_modified: null,
        fetched_at: null,
        failure: null,
      },
    });
    await expect(
      call(routes.updatePlannerBookingPage, ann, {
        params: { pageId: page.id },
        body: { collection_id: feed.id },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('the public pages', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const routes = plannerPublicRoutes({ rsvp, booking });
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://hub.test');
      for (const route of routes) {
        const names = [...route.path.matchAll(/:(\w+)/g)].map((match) => match[1] ?? '');
        const pattern = new RegExp(`^${route.path.replace(/:\w+/g, '([^/]+)')}$`);
        const found = pattern.exec(url.pathname);
        if (request.method === route.method && found !== null) {
          const params = Object.fromEntries(
            names.map((name, index) => [name, found[index + 1] ?? '']),
          );
          route.handle(request, response, params).catch((cause: unknown) => {
            sendError(response, httpFailureOf(cause).error);
          });
          return;
        }
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  async function confirmed(): Promise<{ page: PlannerBookingPageRow; cancelPath: string }> {
    const page = pageOf();
    const confirmation = await booking.book(page.token, {
      name: 'Sam',
      email: 'sam@example.com',
      note: '',
      start: `${MONDAY}T10:00:00.000Z`,
      time_zone: 'UTC',
    });
    return { page, cancelPath: confirmation.cancel_path };
  }

  it('shows the booking page with a script that only runs under its own nonce', async () => {
    const page = pageOf();
    const reply = await fetch(`${base}/book/${page.token}`);
    const html = await reply.text();
    const csp = reply.headers.get('content-security-policy') ?? '';
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(reply.status).toBe(200);
    expect(html).toContain('Intro call');
    expect(html).toContain(`<script nonce="${nonce ?? ''}">`);
    expect(csp).toContain("default-src 'none'");
    expect(reply.headers.get('cache-control')).toBe('no-store');
  });

  it('answers the slot query as JSON and books through the JSON post', async () => {
    const page = pageOf();
    const query = new URLSearchParams({ ...day(MONDAY), time_zone: 'UTC' });
    const slots = PLANNER_BOOKING_SLOTS.parse(
      await (await fetch(`${base}/book/${page.token}/slots?${query.toString()}`)).json(),
    );
    expect(slots.slots).toHaveLength(16);
    const reply = await fetch(`${base}/book/${page.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Sam',
        email: 'sam@example.com',
        start: slots.slots[2]?.start,
        time_zone: 'UTC',
      }),
    });
    expect(PLANNER_BOOKING_CONFIRMATION.parse(await reply.json())).toMatchObject({
      title: 'Intro call',
    });
    const again = await fetch(`${base}/book/${page.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Kim',
        email: 'kim@example.com',
        start: slots.slots[2]?.start,
        time_zone: 'UTC',
      }),
    });
    expect(again.status).toBe(409);
  });

  it('shows the answer page, takes a form answer and a JSON answer', async () => {
    const { cancelPath } = await confirmed();
    const html = await (await fetch(`${base}${cancelPath}`)).text();
    expect(html).toContain('Cancel the booking');
    const plain = test.store.plannerGuests.all()[0];
    expect(plain?.response).toBe('yes');
    const form = await fetch(`${base}${cancelPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ response: 'no', note: 'Sorry' }).toString(),
    });
    expect(form.status).toBe(200);
    expect(await form.text()).toContain('This event was cancelled.');
    const json = await fetch(`${base}${cancelPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response: 'yes' }),
    });
    expect(json.status).toBe(409);
  });

  it('takes a form answer with an empty note field', async () => {
    const { cancelPath } = await confirmed();
    const form = await fetch(`${base}${cancelPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ response: 'no', note: '' }).toString(),
    });
    expect(form.status).toBe(200);
    expect(test.store.plannerGuests.all()[0]?.response).toBe('no');
  });

  it('answers an unknown or malformed link with one plain page that reveals nothing', async () => {
    const unknown = await fetch(`${base}/rsvp/${'a'.repeat(43)}`);
    const malformed = await fetch(`${base}/rsvp/short`);
    const booking404 = await fetch(`${base}/book/${'a'.repeat(43)}`);
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(booking404.status).toBe(404);
    const bodies = await Promise.all([unknown.text(), malformed.text(), booking404.text()]);
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain('no longer available');
  });

  it('refuses a malformed booking request with a clear reason', async () => {
    const page = pageOf();
    const reply = await fetch(`${base}/book/${page.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'not-an-address', start: 'x', time_zone: 'UTC' }),
    });
    expect(reply.status).toBe(400);
  });
});
