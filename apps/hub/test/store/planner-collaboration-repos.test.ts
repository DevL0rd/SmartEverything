import type { LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPublicToken, newPublicToken } from '../../src/store/repositories/public-token';
import { StoreConflictError } from '../../src/store/sql';
import type { PlannerCollectionInput } from '../../src/store/repositories/planner-collections';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import type { PlannerBookingPageInput } from '../../src/store/repositories/planner-booking-pages';
import type { PlannerGuestInput } from '../../src/store/repositories/planner-guests';
import { captureLogs } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let clock = new Date('2026-11-14T10:00:00.000Z');

let test: TestStore;
let ann: TestPerson;
let bob: TestPerson;
let changes: LiveChange[];

function collectionOf(profileId: string, name: string): PlannerCollectionInput {
  return {
    profile_id: profileId,
    kind: 'calendar',
    name,
    colour: 'work',
    icon: 'briefcase',
    position: 1,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
  };
}

function itemOf(profileId: string, collectionId: string, title: string): PlannerItemInput {
  return {
    profile_id: profileId,
    collection_id: collectionId,
    kind: 'event',
    parent_id: null,
    title,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-16T09:00',
    end_local: '2026-11-16T10:00',
    time_zone: 'UTC',
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: '2026-11-16T09:00:00.000Z',
    end: '2026-11-16T10:00:00.000Z',
    series_end: null,
    status: 'open',
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    assignee_id: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: 'person',
  };
}

const PAGE: PlannerBookingPageInput = {
  collection_id: '',
  title: 'Call',
  description: '',
  minutes: 30,
  availability: [{ day: 1, start: '09:00', end: '12:00' }],
  buffer_before: 0,
  buffer_after: 0,
  notice_minutes: 0,
  ahead_days: 14,
  location: null,
  enabled: true,
};

function emailGuest(itemId: string, email: string, name: string | null = null): PlannerGuestInput {
  return {
    item_id: itemId,
    kind: 'email' as const,
    profile_id: null,
    email,
    name,
    delivery: 'link_only' as const,
    delivery_detail: null,
    token_hash: hashPublicToken(`${itemId}${email}`),
  };
}

function tables(): string[] {
  return changes.map((change) => `${change.table} ${change.operation}`);
}

beforeEach(async () => {
  captureLogs();
  clock = new Date('2026-11-14T10:00:00.000Z');
  test = await testStore(() => clock);
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  changes = [];
  test.store.feed.subscribe((change) => changes.push(change));
});

afterEach(async () => {
  await test.close();
});

describe('planner collections with audience and feed', () => {
  it('stores a feed descriptor and finds feeds by kind and the household calendars', () => {
    const { plannerCollections: collections } = test.store;
    const feed = {
      kind: 'ics',
      url: 'https://example.com/a.ics',
      refresh_minutes: 360,
      etag: 'abc',
      last_modified: null,
      fetched_at: null,
      failure: null,
    } as const;
    const stored = collections.insert({
      ...collectionOf(ann.profileId, 'Team'),
      source: 'feed',
      feed,
    });
    expect(collections.byId(stored.id, ann.profileId).feed).toEqual(feed);
    collections.insert({
      ...collectionOf(bob.profileId, 'Birthdays'),
      source: 'feed',
      feed: { kind: 'birthdays' },
    });
    expect(collections.feeds('ics').map((row) => row.name)).toStrictEqual(['Team']);
    expect(collections.feeds('birthdays').map((row) => row.name)).toStrictEqual(['Birthdays']);
    expect(collections.feeds('holidays')).toStrictEqual([]);
    expect(collections.household().map((row) => row.name)).toStrictEqual(['Family']);
  });

  it('finds any collection whoever owns it and lists all', () => {
    const { plannerCollections: collections } = test.store;
    const made = collections.insert(collectionOf(ann.profileId, 'Work'));
    expect(collections.findAny(made.id)?.profile_id).toBe(ann.profileId);
    expect(collections.anyById(made.id).name).toBe('Work');
    expect(collections.findAny(bob.profileId)).toBeUndefined();
    expect(() => collections.anyById(bob.profileId)).toThrow();
    expect(collections.all().map((row) => row.name)).toContain('Work');
  });

  it('removes the shares, booking pages, guests and feed link with the collection and announces each', () => {
    const {
      plannerCollections,
      plannerItems,
      plannerShares,
      plannerGuests,
      plannerBookingPages,
      plannerExportLinks,
    } = test.store;
    const collection = plannerCollections.insert(collectionOf(ann.profileId, 'Work'));
    const item = plannerItems.insert(itemOf(ann.profileId, collection.id, 'Dinner'));
    plannerShares.save({ collection_id: collection.id, profile_id: bob.profileId, role: 'view' });
    plannerGuests.insert(emailGuest(item.id, 'a@example.com'));
    plannerBookingPages.insert(ann.profileId, { ...PAGE, collection_id: collection.id });
    const link = plannerExportLinks.publish(collection.id);
    changes.length = 0;
    plannerCollections.remove(collection.id, ann.profileId);
    expect(tables().sort()).toStrictEqual(
      [
        'planner_booking_pages DELETE',
        'planner_collection_shares DELETE',
        'planner_collections DELETE',
        'planner_guests DELETE',
        'planner_items DELETE',
      ].sort(),
    );
    expect(plannerShares.forCollection(collection.id)).toStrictEqual([]);
    expect(plannerGuests.forItem(item.id)).toStrictEqual([]);
    expect(plannerBookingPages.list(ann.profileId)).toStrictEqual([]);
    expect(plannerExportLinks.byToken(link.token)).toBeUndefined();
  });
});

describe('planner items with assignee and calendar UID', () => {
  it('assigns a task and lists what is assigned to a person', () => {
    const { plannerCollections, plannerItems } = test.store;
    const collection = plannerCollections.insert({
      ...collectionOf(ann.profileId, 'Home'),
      kind: 'list',
    });
    const task = plannerItems.insert({
      ...itemOf(ann.profileId, collection.id, 'Bins'),
      kind: 'task',
      start_local: null,
      end_local: null,
      time_zone: null,
      start: null,
      end: null,
      assignee_id: bob.profileId,
    });
    expect(plannerItems.assignedTo(bob.profileId).map((row) => row.id)).toStrictEqual([task.id]);
    expect(plannerItems.assignedTo(ann.profileId)).toStrictEqual([]);
    expect(
      plannerItems.update(task.id, ann.profileId, { assignee_id: null }).assignee_id,
    ).toBeNull();
    expect(plannerItems.assignedTo(bob.profileId)).toStrictEqual([]);
  });

  it('refuses an assignee on an event', () => {
    const { plannerCollections, plannerItems } = test.store;
    const collection = plannerCollections.insert(collectionOf(ann.profileId, 'Work'));
    expect(() =>
      plannerItems.insert({
        ...itemOf(ann.profileId, collection.id, 'Dinner'),
        assignee_id: bob.profileId,
      }),
    ).toThrow();
  });

  it('finds an item by its UID in one calendar and keeps the UID unique there', () => {
    const { plannerCollections, plannerItems } = test.store;
    const work = plannerCollections.insert(collectionOf(ann.profileId, 'Work'));
    const other = plannerCollections.insert(collectionOf(ann.profileId, 'Other'));
    const first = plannerItems.insert({
      ...itemOf(ann.profileId, work.id, 'A'),
      ical_uid: 'uid-1@x',
      ical_sequence: 2,
    });
    expect(plannerItems.byIcalUid(work.id, 'uid-1@x')?.id).toBe(first.id);
    expect(plannerItems.byIcalUid(other.id, 'uid-1@x')).toBeUndefined();
    expect(() =>
      plannerItems.insert({ ...itemOf(ann.profileId, work.id, 'B'), ical_uid: 'uid-1@x' }),
    ).toThrow(StoreConflictError);
    plannerItems.insert({ ...itemOf(ann.profileId, other.id, 'B'), ical_uid: 'uid-1@x' });
    const override = plannerItems.insert({
      ...itemOf(ann.profileId, work.id, 'A moved'),
      ical_uid: 'uid-1@x',
      series_id: first.id,
      original_start: '2026-11-17T09:00',
    });
    expect(plannerItems.byIcalUid(work.id, 'uid-1@x')?.id).toBe(first.id);
    expect(override.series_id).toBe(first.id);
  });

  it('finds any live item whoever owns it and lists a calendar', () => {
    const { plannerCollections, plannerItems } = test.store;
    const work = plannerCollections.insert(collectionOf(ann.profileId, 'Work'));
    const made = plannerItems.insert(itemOf(ann.profileId, work.id, 'A'));
    expect(plannerItems.findAny(made.id)?.title).toBe('A');
    expect(plannerItems.anyById(made.id).profile_id).toBe(ann.profileId);
    expect(plannerItems.inCollection(work.id).map((row) => row.id)).toStrictEqual([made.id]);
    plannerItems.trash(made.id, ann.profileId);
    expect(plannerItems.findAny(made.id)).toBeUndefined();
    expect(plannerItems.inCollection(work.id)).toStrictEqual([]);
  });
});

describe('planner shares', () => {
  function calendar(): string {
    return test.store.plannerCollections.insert(collectionOf(ann.profileId, 'Work')).id;
  }

  it('shares with a role, changes the role and keeps what the viewer chose', () => {
    const { plannerShares } = test.store;
    const id = calendar();
    const first = plannerShares.save({
      collection_id: id,
      profile_id: bob.profileId,
      role: 'view',
    });
    expect(first).toMatchObject({ role: 'view', colour: null, visible: true });
    plannerShares.change(id, bob.profileId, { colour: 'home', visible: false });
    changes.length = 0;
    const promoted = plannerShares.save({
      collection_id: id,
      profile_id: bob.profileId,
      role: 'edit',
    });
    expect(promoted).toMatchObject({ role: 'edit', colour: 'home', visible: false });
    expect(tables()).toStrictEqual(['planner_collection_shares UPDATE']);
    changes.length = 0;
    plannerShares.save({ collection_id: id, profile_id: bob.profileId, role: 'edit' });
    expect(changes).toStrictEqual([]);
  });

  it('changes only what the viewer sends and lists by calendar and by person', () => {
    const { plannerShares } = test.store;
    const id = calendar();
    plannerShares.save({ collection_id: id, profile_id: bob.profileId, role: 'view' });
    expect(plannerShares.change(id, bob.profileId, { colour: 'health' })).toMatchObject({
      colour: 'health',
      visible: true,
    });
    expect(plannerShares.change(id, bob.profileId, { visible: false })).toMatchObject({
      colour: 'health',
      visible: false,
    });
    expect(plannerShares.change(id, bob.profileId, { colour: null }).colour).toBeNull();
    expect(plannerShares.forCollection(id).map((row) => row.profile_id)).toStrictEqual([
      bob.profileId,
    ]);
    expect(plannerShares.forProfile(bob.profileId).map((row) => row.collection_id)).toStrictEqual([
      id,
    ]);
    expect(plannerShares.forProfile(ann.profileId)).toStrictEqual([]);
    expect(plannerShares.all()).toHaveLength(1);
  });

  it('stops sharing and refuses to change or remove what is not shared', () => {
    const { plannerShares } = test.store;
    const id = calendar();
    plannerShares.save({ collection_id: id, profile_id: bob.profileId, role: 'view' });
    plannerShares.remove(id, bob.profileId);
    expect(plannerShares.find(id, bob.profileId)).toBeUndefined();
    expect(() => {
      plannerShares.remove(id, bob.profileId);
    }).toThrow();
    expect(() => plannerShares.change(id, bob.profileId, { visible: false })).toThrow();
    expect(() => plannerShares.byKey(id, bob.profileId)).toThrow();
  });

  it('refuses a share to nobody or for a calendar that does not exist', () => {
    const { plannerShares } = test.store;
    expect(() =>
      plannerShares.save({ collection_id: calendar(), profile_id: calendar(), role: 'view' }),
    ).toThrow(StoreConflictError);
    expect(() =>
      plannerShares.save({ collection_id: bob.profileId, profile_id: bob.profileId, role: 'view' }),
    ).toThrow(StoreConflictError);
  });
});

describe('planner guests', () => {
  function event(): string {
    const collection = test.store.plannerCollections.insert(collectionOf(ann.profileId, 'Work'));
    return test.store.plannerItems.insert(itemOf(ann.profileId, collection.id, 'Dinner')).id;
  }

  it('invites a member and an email contact who both start waiting for an answer', () => {
    const { plannerGuests } = test.store;
    const id = event();
    const member = plannerGuests.insert({
      item_id: id,
      kind: 'person',
      profile_id: bob.profileId,
      email: null,
      name: null,
      delivery: 'not_sent',
      delivery_detail: null,
      token_hash: null,
    });
    clock = new Date('2026-11-14T10:01:00.000Z');
    const contact = plannerGuests.insert(emailGuest(id, 'sam@example.com', 'Sam'));
    expect(member).toMatchObject({ response: 'needs_action', responded_at: null, note: null });
    expect(contact).toMatchObject({ kind: 'email', email: 'sam@example.com', name: 'Sam' });
    expect(plannerGuests.forItem(id).map((row) => row.id)).toStrictEqual([member.id, contact.id]);
    expect(plannerGuests.ofPerson(id, bob.profileId)?.id).toBe(member.id);
    expect(plannerGuests.ofPerson(id, ann.profileId)).toBeUndefined();
    expect(plannerGuests.forProfile(bob.profileId).map((row) => row.id)).toStrictEqual([member.id]);
    expect(plannerGuests.forItems([id])).toHaveLength(2);
    expect(plannerGuests.forItems([])).toStrictEqual([]);
    expect(plannerGuests.all()).toHaveLength(2);
  });

  it('finds an email guest by the hash of the link token and never returns the hash', () => {
    const { plannerGuests } = test.store;
    const id = event();
    const token = newPublicToken();
    const made = plannerGuests.insert({
      ...emailGuest(id, 'sam@example.com'),
      token_hash: hashPublicToken(token),
    });
    const found = plannerGuests.byToken(hashPublicToken(token));
    expect(found).toEqual(made);
    expect(Object.keys(made)).not.toContain('token_hash');
    expect(plannerGuests.byToken(hashPublicToken('other'))).toBeUndefined();
    const renewed = newPublicToken();
    plannerGuests.replaceToken(made.id, hashPublicToken(renewed));
    expect(plannerGuests.byToken(hashPublicToken(token))).toBeUndefined();
    expect(plannerGuests.byToken(hashPublicToken(renewed))?.id).toBe(made.id);
  });

  it('records an answer with its time and note and a delivery result', () => {
    const { plannerGuests } = test.store;
    const id = event();
    const made = plannerGuests.insert(emailGuest(id, 'sam@example.com'));
    changes.length = 0;
    const answered = plannerGuests.update(made.id, {
      response: 'maybe',
      note: 'Running late',
      responded_at: '2026-11-14T10:05:00.000Z',
    });
    expect(answered).toMatchObject({ response: 'maybe', note: 'Running late' });
    const failed = plannerGuests.update(made.id, {
      delivery: 'failed',
      delivery_detail: 'mailbox full',
    });
    expect(failed).toMatchObject({
      delivery: 'failed',
      delivery_detail: 'mailbox full',
      response: 'maybe',
    });
    const resent = plannerGuests.update(made.id, { delivery: 'sent', delivery_detail: null });
    expect(resent.delivery_detail).toBeNull();
    expect(tables()).toStrictEqual(Array(3).fill('planner_guests UPDATE'));
    expect(() => plannerGuests.update(made.id, { response: 'needs_action' })).toThrow();
  });

  it('keeps one guest per member and per address whatever its letter case', () => {
    const { plannerGuests } = test.store;
    const id = event();
    plannerGuests.insert(emailGuest(id, 'Sam@Example.com'));
    expect(() => plannerGuests.insert(emailGuest(id, 'sam@example.com'))).toThrow(
      StoreConflictError,
    );
    const member = {
      item_id: id,
      kind: 'person' as const,
      profile_id: bob.profileId,
      email: null,
      name: null,
      delivery: 'not_sent' as const,
      delivery_detail: null,
      token_hash: null,
    };
    plannerGuests.insert(member);
    expect(() => plannerGuests.insert(member)).toThrow(StoreConflictError);
  });

  it('removes a guest and announces it', () => {
    const { plannerGuests } = test.store;
    const made = plannerGuests.insert(emailGuest(event(), 'sam@example.com'));
    changes.length = 0;
    plannerGuests.remove(made.id);
    expect(tables()).toStrictEqual(['planner_guests DELETE']);
    expect(() => {
      plannerGuests.remove(made.id);
    }).toThrow();
    expect(() => {
      plannerGuests.replaceToken(made.id, hashPublicToken('x'));
    }).toThrow();
  });

  it('suggests the email contacts a person invited before, newest first, one per address', () => {
    const { plannerGuests } = test.store;
    const first = event();
    const second = event();
    plannerGuests.insert(emailGuest(first, 'old@example.com', 'Old'));
    clock = new Date('2026-11-14T11:00:00.000Z');
    plannerGuests.insert(emailGuest(first, 'sam@example.com', 'Sam'));
    clock = new Date('2026-11-14T12:00:00.000Z');
    plannerGuests.insert(emailGuest(second, 'SAM@example.com', 'Sam'));
    const contacts = plannerGuests.emailContacts(ann.profileId);
    expect(contacts.map((row) => row.email.toLowerCase())).toStrictEqual([
      'sam@example.com',
      'old@example.com',
    ]);
    expect(contacts[0]).toMatchObject({ name: 'Sam', lastInvitedAt: '2026-11-14T12:00:00.000Z' });
    expect(plannerGuests.emailContacts(bob.profileId)).toStrictEqual([]);
  });
});

describe('planner booking pages', () => {
  function page(profileId: string): PlannerBookingPageInput {
    const collection = test.store.plannerCollections.insert(collectionOf(profileId, 'Bookings'));
    return { ...PAGE, collection_id: collection.id };
  }

  it('adds a page with its own link token and finds it by token', () => {
    const { plannerBookingPages } = test.store;
    const made = plannerBookingPages.insert(ann.profileId, page(ann.profileId));
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(plannerBookingPages.byToken(made.token)?.id).toBe(made.id);
    expect(plannerBookingPages.byToken('x'.repeat(43))).toBeUndefined();
    expect(plannerBookingPages.list(ann.profileId).map((row) => row.id)).toStrictEqual([made.id]);
    expect(plannerBookingPages.list(bob.profileId)).toStrictEqual([]);
    expect(plannerBookingPages.all()).toHaveLength(1);
  });

  it('changes a page, switches it off and keeps another person from touching it', () => {
    const { plannerBookingPages } = test.store;
    const made = plannerBookingPages.insert(ann.profileId, page(ann.profileId));
    const changed = plannerBookingPages.update(made.id, ann.profileId, {
      enabled: false,
      minutes: 45,
    });
    expect(changed).toMatchObject({ enabled: false, minutes: 45, token: made.token });
    expect(() => plannerBookingPages.update(made.id, bob.profileId, { minutes: 5 })).toThrow();
    expect(() => plannerBookingPages.update(made.id, ann.profileId, { minutes: 0 })).toThrow();
  });

  it('gives a page a new link so the old one stops working', () => {
    const { plannerBookingPages } = test.store;
    const made = plannerBookingPages.insert(ann.profileId, page(ann.profileId));
    const renewed = plannerBookingPages.resetToken(made.id, ann.profileId);
    expect(renewed.token).not.toBe(made.token);
    expect(plannerBookingPages.byToken(made.token)).toBeUndefined();
    expect(plannerBookingPages.byToken(renewed.token)?.id).toBe(made.id);
  });

  it('removes a page and announces each change', () => {
    const { plannerBookingPages } = test.store;
    changes.length = 0;
    const made = plannerBookingPages.insert(ann.profileId, page(ann.profileId));
    plannerBookingPages.update(made.id, ann.profileId, { title: 'Intro' });
    plannerBookingPages.resetToken(made.id, ann.profileId);
    plannerBookingPages.remove(made.id, ann.profileId);
    expect(tables().filter((line) => line.startsWith('planner_booking_pages'))).toStrictEqual([
      'planner_booking_pages INSERT',
      'planner_booking_pages UPDATE',
      'planner_booking_pages UPDATE',
      'planner_booking_pages DELETE',
    ]);
    expect(() => {
      plannerBookingPages.remove(made.id, ann.profileId);
    }).toThrow();
  });
});

describe('planner export links', () => {
  function calendar(): string {
    return test.store.plannerCollections.insert(collectionOf(ann.profileId, 'Work')).id;
  }

  it('publishes a calendar, shows the same address again and resets it on publishing again', () => {
    const { plannerExportLinks } = test.store;
    const id = calendar();
    expect(plannerExportLinks.find(id)).toBeUndefined();
    const first = plannerExportLinks.publish(id);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(plannerExportLinks.find(id)).toEqual(first);
    expect(plannerExportLinks.byToken(first.token)?.collection_id).toBe(id);
    const second = plannerExportLinks.publish(id);
    expect(second.token).not.toBe(first.token);
    expect(plannerExportLinks.byToken(first.token)).toBeUndefined();
  });

  it('stops publishing and refuses to stop what was never published', () => {
    const { plannerExportLinks } = test.store;
    const id = calendar();
    plannerExportLinks.publish(id);
    plannerExportLinks.remove(id);
    expect(plannerExportLinks.find(id)).toBeUndefined();
    expect(() => {
      plannerExportLinks.remove(id);
    }).toThrow();
  });

  it('refuses to publish a calendar that does not exist', () => {
    expect(() => test.store.plannerExportLinks.publish(ann.profileId)).toThrow(StoreConflictError);
  });
});

describe('the mail log', () => {
  it('logs each mail with a hashed recipient and lists the newest first', () => {
    const { mailLog } = test.store;
    const first = mailLog.insert({
      kind: 'invite',
      to_hash: hashPublicToken('a@example.com'),
      subject: 'Invitation: Dinner',
      outcome: 'sent',
      detail: null,
    });
    const second = mailLog.insert({
      kind: 'cancel',
      to_hash: hashPublicToken('b@example.com'),
      subject: 'Cancelled: Dinner',
      outcome: 'failed',
      detail: 'refused',
    });
    expect(mailLog.recent(10).map((row) => row.id)).toStrictEqual([first.id, second.id].sort());
    expect(mailLog.recent(1)).toHaveLength(1);
  });

  it('refuses a clear address as the recipient and a failure without a reason', () => {
    const { mailLog } = test.store;
    expect(() =>
      mailLog.insert({
        kind: 'invite',
        to_hash: 'a@example.com',
        subject: 'x',
        outcome: 'sent',
        detail: null,
      }),
    ).toThrow();
    expect(() =>
      mailLog.insert({
        kind: 'invite',
        to_hash: 'a'.repeat(64),
        subject: 'x',
        outcome: 'failed',
        detail: null,
      }),
    ).toThrow();
  });
});

describe('public link tokens', () => {
  it('makes 43 URL-safe characters that never repeat and hashes to 64 hex characters', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newPublicToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashPublicToken('x')).toBe(hashPublicToken('x'));
    expect(hashPublicToken('x')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPublicToken('x')).not.toBe(hashPublicToken('y'));
  });
});
