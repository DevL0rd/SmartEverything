import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { PLANNER_ENDPOINTS, PLANNER_SEARCH_QUERY } from '../src/api/endpoints-planner';
import { PLANNER_FEED_CHANGES, PLANNER_FEED_CREATE } from '../src/api/endpoints-planner-feeds';
import { PLANNER_ITEM_CREATE, PLANNER_ITEM_PATCH } from '../src/api/endpoints-planner-items';
import {
  PLANNER_BOOKING_AVAILABILITY,
  PLANNER_BOOKING_CONFIRMATION,
  PLANNER_BOOKING_PAGE_CHANGES,
  PLANNER_BOOKING_PAGE_CREATE,
  PLANNER_BOOKING_PAGE_ROW,
  PLANNER_BOOKING_REQUEST,
  PLANNER_BOOKING_SLOTS,
  PLANNER_BOOKING_SLOTS_QUERY,
} from '../src/planner/booking';
import {
  PLANNER_EXPORT_LINK,
  PLANNER_FEED,
  PLANNER_FEED_PATHS,
  PLANNER_HOLIDAY_REGION,
  PLANNER_IMPORT_RESULT,
  PLANNER_PUBLISHED_FEED_FILE,
} from '../src/planner/feeds';
import {
  PLANNER_GUEST_ENTRY,
  PLANNER_GUEST_ROW,
  PLANNER_GUESTS_SET,
  PLANNER_RSVP_BODY,
  PLANNER_RSVP_PAGE,
  PLANNER_RSVP_RECEIPT,
} from '../src/planner/guests';
import { PLANNER_SEARCH_PAGE } from '../src/planner/search';
import {
  PLANNER_COLLECTION_SHARE_ROW,
  PLANNER_SHARE_SET,
  PLANNER_SHARE_VIEWER_CHANGES,
} from '../src/planner/sharing';
import { PLANNER_PUBLIC_TOKEN } from '../src/planner/tokens';

const ID = '3f2b8c1e-5a4d-4b7e-9c6f-1a2b3c4d5e6f';
const OTHER = '7d1e9a2c-8b3f-4c5d-a6e7-0f1a2b3c4d5e';
const NOW = '2026-11-07T08:00:00Z';
const TOKEN = 'A'.repeat(43);

const personGuest = {
  id: ID,
  item_id: OTHER,
  kind: 'person',
  profile_id: OTHER,
  email: null,
  name: null,
  response: 'needs_action',
  note: null,
  delivery: 'not_sent',
  delivery_detail: null,
  invited_at: NOW,
  responded_at: null,
};

const emailGuest = {
  ...personGuest,
  kind: 'email',
  profile_id: null,
  email: 'sam@example.com',
  name: 'Sam',
  delivery: 'sent',
};

describe('planner guest rows', () => {
  it('reads a member guest and an email guest', () => {
    expect(PLANNER_GUEST_ROW.safeParse(personGuest).success).toBe(true);
    expect(PLANNER_GUEST_ROW.safeParse(emailGuest).success).toBe(true);
  });

  it('keeps a member guest to a person and a notice, never an address or an email', () => {
    expect(PLANNER_GUEST_ROW.safeParse({ ...personGuest, profile_id: null }).success).toBe(false);
    expect(PLANNER_GUEST_ROW.safeParse({ ...personGuest, email: 'a@b.co' }).success).toBe(false);
    expect(PLANNER_GUEST_ROW.safeParse({ ...personGuest, delivery: 'sent' }).success).toBe(false);
  });

  it('keeps an email guest to a valid address and no person', () => {
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, email: null }).success).toBe(false);
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, email: 'sam' }).success).toBe(false);
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, profile_id: OTHER }).success).toBe(false);
  });

  it('ties a failed delivery to its reason', () => {
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, delivery: 'failed' }).success).toBe(false);
    expect(
      PLANNER_GUEST_ROW.safeParse({
        ...emailGuest,
        delivery: 'failed',
        delivery_detail: 'mailbox full',
      }).success,
    ).toBe(true);
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, delivery_detail: 'x' }).success).toBe(
      false,
    );
  });

  it('ties an answer to its time and a note to an answer', () => {
    const answered = { ...emailGuest, response: 'maybe', responded_at: NOW };
    expect(PLANNER_GUEST_ROW.safeParse(answered).success).toBe(true);
    expect(PLANNER_GUEST_ROW.safeParse({ ...answered, note: 'late' }).success).toBe(true);
    expect(PLANNER_GUEST_ROW.safeParse({ ...answered, responded_at: null }).success).toBe(false);
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, responded_at: NOW }).success).toBe(false);
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, note: 'late' }).success).toBe(false);
    expect(PLANNER_GUEST_ROW.safeParse({ ...answered, response: 'later' }).success).toBe(false);
  });

  it('is strict about unknown fields', () => {
    expect(PLANNER_GUEST_ROW.safeParse({ ...emailGuest, token_hash: 'x' }).success).toBe(false);
  });
});

describe('planner guest bodies', () => {
  it('sets the whole guest list from members and email contacts', () => {
    const body = {
      guests: [
        { kind: 'person', profile_id: ID },
        { kind: 'email', email: 'sam@example.com' },
      ],
    };
    const parsed = PLANNER_GUESTS_SET.parse(body);
    expect(parsed.guests[1]).toEqual({ kind: 'email', email: 'sam@example.com', name: null });
    expect(PLANNER_GUESTS_SET.safeParse({ guests: [] }).success).toBe(true);
    expect(PLANNER_GUEST_ENTRY.safeParse({ kind: 'person', email: 'a@b.co' }).success).toBe(false);
    expect(PLANNER_GUEST_ENTRY.safeParse({ kind: 'email', email: 'nope' }).success).toBe(false);
  });

  it('answers with yes, no or maybe and never with needs action', () => {
    expect(PLANNER_RSVP_BODY.parse({ response: 'yes' })).toEqual({ response: 'yes', note: null });
    expect(PLANNER_RSVP_BODY.safeParse({ response: 'needs_action' }).success).toBe(false);
    expect(PLANNER_RSVP_BODY.safeParse({ response: 'no', note: '' }).success).toBe(false);
  });

  it('describes what the invitation page shows and what it answers', () => {
    const page = {
      title: 'Dinner',
      location: null,
      organiser: 'Ida',
      all_day: false,
      start_local: '2026-11-09T19:00',
      end_local: null,
      time_zone: 'Asia/Bangkok',
      guest_name: 'Sam',
      response: 'needs_action',
      note: null,
      cancelled: false,
      booking: false,
    };
    expect(PLANNER_RSVP_PAGE.safeParse(page).success).toBe(true);
    expect(PLANNER_RSVP_PAGE.safeParse({ ...page, start_local: 'soon' }).success).toBe(false);
    expect(PLANNER_RSVP_RECEIPT.safeParse({ response: 'yes', responded_at: NOW }).success).toBe(
      true,
    );
  });
});

describe('planner sharing', () => {
  const share = {
    collection_id: ID,
    profile_id: OTHER,
    role: 'edit',
    colour: null,
    visible: true,
    created_at: NOW,
  };

  it('shares a calendar as viewer or editor and nothing else', () => {
    expect(PLANNER_COLLECTION_SHARE_ROW.safeParse(share).success).toBe(true);
    expect(PLANNER_COLLECTION_SHARE_ROW.safeParse({ ...share, role: 'owner' }).success).toBe(false);
    expect(PLANNER_SHARE_SET.safeParse({ role: 'view' }).success).toBe(true);
    expect(PLANNER_SHARE_SET.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('lets a viewer change their own colour and visibility only', () => {
    expect(PLANNER_SHARE_VIEWER_CHANGES.safeParse({ colour: 'home' }).success).toBe(true);
    expect(PLANNER_SHARE_VIEWER_CHANGES.safeParse({ colour: null, visible: false }).success).toBe(
      true,
    );
    expect(PLANNER_SHARE_VIEWER_CHANGES.safeParse({}).success).toBe(false);
    expect(PLANNER_SHARE_VIEWER_CHANGES.safeParse({ role: 'edit' }).success).toBe(false);
  });

  it('reads a public link token of exactly 43 URL-safe characters', () => {
    expect(PLANNER_PUBLIC_TOKEN.safeParse(TOKEN).success).toBe(true);
    expect(PLANNER_PUBLIC_TOKEN.safeParse('A'.repeat(42)).success).toBe(false);
    expect(PLANNER_PUBLIC_TOKEN.safeParse(`${'A'.repeat(42)}+`).success).toBe(false);
  });
});

describe('planner feeds', () => {
  const ics = {
    kind: 'ics',
    url: 'https://example.com/a.ics',
    refresh_minutes: 360,
    etag: null,
    last_modified: null,
    fetched_at: null,
    failure: null,
  };

  it('reads the three feed descriptors and rejects an unknown kind', () => {
    expect(PLANNER_FEED.safeParse(ics).success).toBe(true);
    expect(PLANNER_FEED.safeParse({ kind: 'holidays', country: 'SE', state: null }).success).toBe(
      true,
    );
    expect(PLANNER_FEED.safeParse({ kind: 'birthdays' }).success).toBe(true);
    expect(PLANNER_FEED.safeParse({ kind: 'rss' }).success).toBe(false);
  });

  it('subscribes only by http, https or webcal', () => {
    for (const url of ['webcal://example.com/a.ics', 'http://example.com/a.ics']) {
      expect(PLANNER_FEED.safeParse({ ...ics, url }).success, url).toBe(true);
    }
    for (const url of ['ftp://example.com/a.ics', 'file:///etc/passwd', 'example.com']) {
      expect(PLANNER_FEED.safeParse({ ...ics, url }).success, url).toBe(false);
    }
    expect(PLANNER_FEED.safeParse({ ...ics, refresh_minutes: 0 }).success).toBe(false);
  });

  it('keeps the last failure with its time and reason', () => {
    const failure = { at: NOW, reason: 'HTTP 404' };
    expect(PLANNER_FEED.safeParse({ ...ics, failure }).success).toBe(true);
    expect(PLANNER_FEED.safeParse({ ...ics, failure: { at: NOW } }).success).toBe(false);
  });

  it('reads country and region codes in their formats', () => {
    expect(PLANNER_FEED.safeParse({ kind: 'holidays', country: 'se', state: null }).success).toBe(
      false,
    );
    expect(PLANNER_FEED.safeParse({ kind: 'holidays', country: 'DE', state: 'by' }).success).toBe(
      true,
    );
    expect(PLANNER_FEED.safeParse({ kind: 'holidays', country: 'DE', state: 'b y' }).success).toBe(
      false,
    );
  });

  it('creates a subscription with the standard refresh and rejects other fields', () => {
    const made = PLANNER_FEED_CREATE.parse({ kind: 'ics', url: 'webcal://example.com/a.ics' });
    expect(made).toMatchObject({ kind: 'ics', refresh_minutes: 360 });
    expect(PLANNER_FEED_CREATE.parse({ kind: 'holidays', country: 'SE' })).toMatchObject({
      state: null,
    });
    expect(PLANNER_FEED_CREATE.safeParse({ kind: 'birthdays', url: 'x' }).success).toBe(false);
    expect(PLANNER_FEED_CHANGES.safeParse({}).success).toBe(false);
    expect(PLANNER_FEED_CHANGES.safeParse({ refresh_minutes: 60 }).success).toBe(true);
  });

  it('lists holiday regions with their states', () => {
    expect(
      PLANNER_HOLIDAY_REGION.safeParse({
        country: 'DE',
        name: 'Germany',
        states: [{ code: 'by', name: 'Bavaria' }],
      }).success,
    ).toBe(true);
  });

  it('describes import results, export links and the published file name', () => {
    expect(
      PLANNER_IMPORT_RESULT.safeParse({
        added: 2,
        updated: 1,
        unchanged: 0,
        unsupported: [{ part: 'attachment', detail: 'binary attachment', count: 1 }],
      }).success,
    ).toBe(true);
    expect(
      PLANNER_IMPORT_RESULT.safeParse({
        added: 0,
        updated: 0,
        unchanged: 0,
        unsupported: [{ part: 'other', detail: 'x', count: 1 }],
      }).success,
    ).toBe(false);
    const link = {
      collection_id: ID,
      token: TOKEN,
      url: `https://hub.example.com/cal/${TOKEN}.ics`,
      reach: 'public',
      created_at: NOW,
    };
    expect(PLANNER_EXPORT_LINK.safeParse(link).success).toBe(true);
    expect(PLANNER_EXPORT_LINK.safeParse({ ...link, reach: 'lan' }).success).toBe(false);
    expect(PLANNER_PUBLISHED_FEED_FILE.safeParse(`${TOKEN}.ics`).success).toBe(true);
    expect(PLANNER_PUBLISHED_FEED_FILE.safeParse(TOKEN).success).toBe(false);
    expect(PLANNER_FEED_PATHS.publishedFeed).toBe('/cal/:file');
  });
});

describe('planner booking pages', () => {
  const window = { day: 1, start: '09:00', end: '12:00' };
  const page = {
    id: ID,
    profile_id: OTHER,
    collection_id: ID,
    title: 'Intro call',
    description: '',
    minutes: 30,
    availability: [window],
    buffer_before: 0,
    buffer_after: 10,
    notice_minutes: 60,
    ahead_days: 30,
    location: null,
    enabled: true,
    token: TOKEN,
    created_at: NOW,
    updated_at: NOW,
  };

  it('reads a booking page and rejects a bad length', () => {
    expect(PLANNER_BOOKING_PAGE_ROW.safeParse(page).success).toBe(true);
    expect(PLANNER_BOOKING_PAGE_ROW.safeParse({ ...page, minutes: 0 }).success).toBe(false);
    expect(PLANNER_BOOKING_PAGE_ROW.safeParse({ ...page, token: 'short' }).success).toBe(false);
  });

  it('keeps each window inside one day and windows of one day apart', () => {
    expect(PLANNER_BOOKING_AVAILABILITY.safeParse([window]).success).toBe(true);
    expect(PLANNER_BOOKING_AVAILABILITY.safeParse([{ ...window, end: '09:00' }]).success).toBe(
      false,
    );
    expect(PLANNER_BOOKING_AVAILABILITY.safeParse([{ ...window, day: 7 }]).success).toBe(false);
    expect(
      PLANNER_BOOKING_AVAILABILITY.safeParse([window, { day: 1, start: '11:00', end: '13:00' }])
        .success,
    ).toBe(false);
    expect(
      PLANNER_BOOKING_AVAILABILITY.safeParse([window, { day: 1, start: '12:00', end: '13:00' }])
        .success,
    ).toBe(true);
    expect(
      PLANNER_BOOKING_AVAILABILITY.safeParse([window, { day: 2, start: '09:00', end: '12:00' }])
        .success,
    ).toBe(true);
  });

  it('creates a page with no buffers, no location and on, and changes one field at a time', () => {
    const made = PLANNER_BOOKING_PAGE_CREATE.parse({
      collection_id: ID,
      title: 'Call',
      minutes: 15,
      availability: [window],
      notice_minutes: 0,
      ahead_days: 14,
    });
    expect(made).toMatchObject({
      buffer_before: 0,
      buffer_after: 0,
      location: null,
      enabled: true,
    });
    expect(PLANNER_BOOKING_PAGE_CHANGES.safeParse({ enabled: false }).success).toBe(true);
    expect(PLANNER_BOOKING_PAGE_CHANGES.safeParse({}).success).toBe(false);
    expect(PLANNER_BOOKING_PAGE_CHANGES.safeParse({ token: TOKEN }).success).toBe(false);
  });

  it('asks for slots in the booker zone and books with a name and an address', () => {
    const query = {
      from: '2026-11-09T00:00:00Z',
      to: '2026-11-16T00:00:00Z',
      time_zone: 'Europe/Berlin',
    };
    expect(PLANNER_BOOKING_SLOTS_QUERY.safeParse(query).success).toBe(true);
    expect(PLANNER_BOOKING_SLOTS_QUERY.safeParse({ ...query, to: query.from }).success).toBe(false);
    expect(
      PLANNER_BOOKING_SLOTS_QUERY.safeParse({ ...query, time_zone: 'Mars/Base' }).success,
    ).toBe(false);
    const request = {
      name: 'Sam',
      email: 'sam@example.com',
      start: '2026-11-09T09:00:00Z',
      time_zone: 'Europe/Berlin',
    };
    expect(PLANNER_BOOKING_REQUEST.parse(request).note).toBe('');
    expect(PLANNER_BOOKING_REQUEST.safeParse({ ...request, email: 'sam' }).success).toBe(false);
  });

  it('describes the public page slots and the confirmation', () => {
    const slots = {
      page: {
        title: 'Call',
        description: '',
        minutes: 30,
        location: null,
        host: 'Ida',
        host_time_zone: 'Asia/Bangkok',
        ahead_days: 30,
      },
      slots: [{ start: '2026-11-09T09:00:00Z', end: '2026-11-09T09:30:00Z' }],
    };
    expect(PLANNER_BOOKING_SLOTS.safeParse(slots).success).toBe(true);
    expect(
      PLANNER_BOOKING_SLOTS.safeParse({
        ...slots,
        slots: [{ start: '2026-11-09T09:30:00Z', end: '2026-11-09T09:00:00Z' }],
      }).success,
    ).toBe(false);
    expect(
      PLANNER_BOOKING_CONFIRMATION.safeParse({
        title: 'Call',
        start: '2026-11-09T09:00:00Z',
        end: '2026-11-09T09:30:00Z',
        location: null,
        cancel_path: `/rsvp/${TOKEN}`,
      }).success,
    ).toBe(true);
  });
});

describe('planner search', () => {
  it('searches text with filters and defaults to all times', () => {
    const query = PLANNER_ENDPOINTS.readPlannerSearch.query;
    expect(PLANNER_SEARCH_QUERY).toBe(query);
    expect(query.parse({ text: 'dentist' }).when).toBe('all');
    expect(query.safeParse({ text: ' ' }).success).toBe(false);
    expect(query.safeParse({ text: 'x', kinds: 'task,event', collections: ID }).success).toBe(true);
    expect(query.safeParse({ text: 'x', kinds: 'note' }).success).toBe(false);
    expect(query.safeParse({ text: 'x', when: 'tomorrow' }).success).toBe(false);
  });

  it('pages hits with a cursor', () => {
    expect(PLANNER_SEARCH_PAGE.safeParse({ hits: [], next: null }).success).toBe(true);
    expect(PLANNER_SEARCH_PAGE.safeParse({ hits: [], next: '' }).success).toBe(false);
  });
});

describe('planner item assignment', () => {
  it('creates a task with no assignee and assigns by patch', () => {
    const made = PLANNER_ITEM_CREATE.parse({ collection_id: ID, kind: 'task', title: 'Bins' });
    expect(made.assignee_id).toBeNull();
    expect(PLANNER_ITEM_PATCH.safeParse({ changes: { assignee_id: OTHER } }).success).toBe(true);
    expect(PLANNER_ITEM_PATCH.safeParse({ changes: { assignee_id: null } }).success).toBe(true);
    expect(PLANNER_ITEM_PATCH.safeParse({ changes: { ical_uid: 'x' } }).success).toBe(false);
  });
});

describe('collaboration endpoints', () => {
  const MEMBER_PATHS = [
    ['PUT', '/api/planner/collections/:collectionId/shares/:personId'],
    ['PATCH', '/api/planner/collections/:collectionId/shares/:personId'],
    ['DELETE', '/api/planner/collections/:collectionId/shares/:personId'],
    ['PUT', '/api/planner/items/:itemId/guests'],
    ['POST', '/api/planner/items/:itemId/rsvp'],
    ['POST', '/api/planner/items/:itemId/guests/:guestId/resend'],
    ['GET', '/api/planner/guest-suggestions'],
    ['POST', '/api/planner/feeds'],
    ['PATCH', '/api/planner/feeds/:collectionId'],
    ['POST', '/api/planner/feeds/:collectionId/refresh'],
    ['GET', '/api/planner/holiday-regions'],
    ['POST', '/api/planner/collections/:collectionId/import'],
    ['GET', '/api/planner/collections/:collectionId/export.ics'],
    ['GET', '/api/planner/items/:itemId/export.ics'],
    ['GET', '/api/planner/collections/:collectionId/export-link'],
    ['POST', '/api/planner/collections/:collectionId/export-link'],
    ['DELETE', '/api/planner/collections/:collectionId/export-link'],
    ['GET', '/api/planner/booking-pages'],
    ['POST', '/api/planner/booking-pages'],
    ['PATCH', '/api/planner/booking-pages/:pageId'],
    ['DELETE', '/api/planner/booking-pages/:pageId'],
    ['POST', '/api/planner/booking-pages/:pageId/reset-link'],
    ['GET', '/api/planner/search'],
  ] as const;

  it('registers every member call once under the planner path', () => {
    const endpoints = Object.values(API_ENDPOINTS);
    for (const [method, path] of MEMBER_PATHS) {
      const found = endpoints.filter((e) => e.method === method && e.path === path);
      expect(found.length, `${method} ${path}`).toBe(1);
      expect(found[0]?.access).toBe('member');
    }
  });

  it('keeps the email settings with the owner', () => {
    const mail = Object.values(API_ENDPOINTS).filter((e) => e.path.startsWith('/api/mail'));
    expect(mail.map((e) => `${e.method} ${e.path}`).sort()).toStrictEqual([
      'GET /api/mail/settings',
      'POST /api/mail/test',
      'PUT /api/mail/settings',
    ]);
    for (const endpoint of mail) expect(endpoint.access).toBe('owner');
  });

  it('shares and answers with one body shape each', () => {
    expect(API_ENDPOINTS.sharePlannerCollection.body).toBe(PLANNER_SHARE_SET);
    expect(API_ENDPOINTS.respondPlannerInvite.body).toBe(PLANNER_RSVP_BODY);
    expect(API_ENDPOINTS.setPlannerGuests.body).toBe(PLANNER_GUESTS_SET);
  });
});
