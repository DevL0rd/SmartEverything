import { join } from 'node:path';
import { PLANNER_RSVP_PAGE, type CommittedNotice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailService } from '../../src/mail/service';
import { MailSettingsStore } from '../../src/mail/settings';
import { setGuestList } from '../../src/planner/guests/guest-list';
import { PublicRsvp } from '../../src/planner/invites/public';
import { InviteService } from '../../src/planner/invites/service';
import { inviteToken } from '../../src/planner/invites/token';
import { CollaborationDesk } from '../../src/planner/sharing/desk';
import { SecretStore } from '../../src/secrets/store';
import { startFakeSmtp, type FakeSmtp } from '../fakes/smtp/server';
import { calendarOf, eventOf } from '../support/collab-fixtures';
import { testLogger } from '../support/logs';
import { readable, rsvpLinks } from '../support/mail-fixtures';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-14T08:00:00.000Z');
const KEY = Buffer.alloc(32, 9);
const SAM = { kind: 'email', email: 'sam@example.com', name: 'Sam' } as const;

let test: TestStore;
let ann: TestPerson;
let smtp: FakeSmtp;
let settings: MailSettingsStore;
let mail: MailService;
let invites: InviteService;
let rsvp: PublicRsvp;
let notices: CommittedNotice[];
let stops: (() => void)[];

async function configure(): Promise<void> {
  await settings.write({
    host: '127.0.0.1',
    port: smtp.port,
    security: 'none',
    user: null,
    from_name: 'Home',
    from_address: 'home@example.com',
    password: { action: 'keep' },
  });
}

beforeEach(async () => {
  test = await testStore(() => NOW);
  ann = addPerson(test, 'Ann', 'owner');
  smtp = await startFakeSmtp();
  const secrets = await SecretStore.open(join(test.directory, 'secrets'), Buffer.alloc(32, 3));
  settings = new MailSettingsStore({ settingsKv: test.store.settingsKv, secrets });
  mail = new MailService({ settings, store: test.store, log: testLogger('mail') });
  invites = new InviteService({
    store: test.store,
    mail,
    key: KEY,
    origin: (): string => 'http://hub.test',
    now: (): Date => NOW,
    log: testLogger('planner'),
  });
  rsvp = new PublicRsvp({ store: test.store, now: (): Date => NOW });
  notices = [];
  const desk = new CollaborationDesk({
    store: test.store,
    clock: { now: (): Date => NOW },
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

function dinner(overrides: Parameters<typeof eventOf>[3] = {}): ReturnType<typeof eventOf> {
  const calendar = calendarOf(test.store, ann.profileId);
  return eventOf(test.store, ann.profileId, calendar.id, overrides);
}

describe('email invitations', () => {
  it('sends an iTIP request with answer links and records the delivery', async () => {
    await configure();
    const item = dinner({ location: 'Home' });
    setGuestList(test.store, item, [SAM]);
    await invites.idle();
    expect(smtp.mails).toHaveLength(1);
    const [sent] = smtp.mails;
    const text = readable(sent?.data ?? '');
    expect(sent?.to).toEqual(['sam@example.com']);
    expect(text).toContain('Subject: Invitation: Dinner @ Mon, 16 Nov 2026, 19:00 to 20:00 (UTC)');
    expect(text).toContain('METHOD:REQUEST');
    expect(text).toContain('SEQUENCE:0');
    expect(text).toMatch(/ORGANIZER;CN=Home:mailto:home@example\.com/);
    expect(text).toContain('mailto:sam@example.com');
    expect(text).toContain('Replies to this email are not read');
    expect([...new Set(rsvpLinks(sent?.data ?? '').map((link) => link.split('?')[1]))]).toEqual([
      'answer=yes',
      'answer=maybe',
      'answer=no',
    ]);
    const [guest] = test.store.plannerGuests.forItem(item.id);
    expect(guest).toMatchObject({ delivery: 'sent', delivery_detail: null });
    expect(mail.recent(3).map((row) => row.kind)).toEqual(['invite']);
  });

  it('marks link only without a mail server and shows no error', async () => {
    const item = dinner();
    setGuestList(test.store, item, [SAM]);
    await invites.idle();
    expect(smtp.mails).toEqual([]);
    expect(test.store.plannerGuests.forItem(item.id)[0]?.delivery).toBe('link_only');
    const token = inviteToken(KEY, test.store.plannerGuests.forItem(item.id)[0]?.id ?? '');
    expect(rsvp.pageOf(token).title).toBe('Dinner');
  });

  it('records a failed delivery with its reason and lets the owner resend it', async () => {
    await smtp.close();
    smtp = await startFakeSmtp({ refuseRecipient: () => true });
    await configure();
    const item = dinner();
    setGuestList(test.store, item, [SAM]);
    await invites.idle();
    const [failed] = test.store.plannerGuests.forItem(item.id);
    expect(failed?.delivery).toBe('failed');
    expect(failed?.delivery_detail).toBeTruthy();
    expect(failed?.delivery_detail).not.toContain('sam@');
    await smtp.close();
    smtp = await startFakeSmtp();
    await configure();
    const resent = await invites.deliver(failed?.id ?? '', 'invite');
    expect(resent.delivery).toBe('sent');
    expect(smtp.mails).toHaveLength(1);
  });

  it('sends an update with a higher sequence when the time or place changes', async () => {
    await configure();
    const item = dinner();
    setGuestList(test.store, item, [SAM]);
    await invites.idle();
    test.store.plannerItems.update(item.id, ann.profileId, { location: 'Garden' });
    await invites.idle();
    expect(smtp.mails).toHaveLength(2);
    const update = readable(smtp.mails[1]?.data ?? '');
    expect(update).toContain('Subject: Updated invitation: Dinner');
    expect(update).toContain('SEQUENCE:1');
    expect(update).toContain('LOCATION:Garden');
    expect(test.store.plannerItems.anyById(item.id).ical_sequence).toBe(1);
    test.store.plannerItems.update(item.id, ann.profileId, { reminders: [{ minutes_before: 5 }] });
    await invites.idle();
    expect(smtp.mails).toHaveLength(2);
  });

  it('cancels when the event is trashed', async () => {
    await configure();
    const item = dinner();
    setGuestList(test.store, item, [SAM]);
    await invites.idle();
    test.store.plannerItems.trash(item.id, ann.profileId);
    await invites.idle();
    const cancel = readable(smtp.mails[1]?.data ?? '');
    expect(cancel).toContain('METHOD:CANCEL');
    expect(cancel).toContain('STATUS:CANCELLED');
    expect(cancel).toContain('Subject: Cancelled: Dinner');
    expect(cancel).not.toContain('answer=yes');
  });

  it('tells a guest who is taken off the list and sends nothing for member guests', async () => {
    await configure();
    const bob = addPerson(test, 'Bob', 'member');
    const item = dinner();
    setGuestList(test.store, item, [SAM, { kind: 'person', profile_id: bob.profileId }]);
    await invites.idle();
    expect(smtp.mails).toHaveLength(1);
    setGuestList(test.store, item, [{ kind: 'person', profile_id: bob.profileId }]);
    await invites.idle();
    expect(smtp.mails).toHaveLength(2);
    expect(readable(smtp.mails[1]?.data ?? '')).toContain('METHOD:CANCEL');
    expect(smtp.mails[1]?.to).toEqual(['sam@example.com']);
  });

  it('leaves invitations of a Google calendar to Google', async () => {
    await configure();
    const calendar = calendarOf(test.store, ann.profileId, {
      source: 'google',
      google: { id: 'ann@example.com', etag: null, syncToken: null },
    });
    const item = eventOf(test.store, ann.profileId, calendar.id);
    setGuestList(test.store, item, [SAM]);
    await invites.idle();
    expect(smtp.mails).toEqual([]);
    expect(test.store.plannerGuests.forItem(item.id)[0]?.delivery).toBe('google');
  });
});

describe('the answer page', () => {
  async function invited(): Promise<{ item: ReturnType<typeof dinner>; token: string }> {
    await configure();
    const item = dinner();
    setGuestList(test.store, item, [SAM]);
    await invites.idle();
    const guest = test.store.plannerGuests.forItem(item.id)[0];
    return { item, token: inviteToken(KEY, guest?.id ?? '') };
  }

  it('shows the event to the holder of the link and nothing about anyone else', async () => {
    const { token } = await invited();
    const page = rsvp.pageOf(token);
    expect(PLANNER_RSVP_PAGE.parse(page)).toMatchObject({
      title: 'Dinner',
      organiser: 'Ann',
      guest_name: 'Sam',
      response: 'needs_action',
      cancelled: false,
      booking: false,
    });
    expect(JSON.stringify(page)).not.toContain('sam@example.com');
  });

  it('records an answer with a note and tells the organiser', async () => {
    const { item, token } = await invited();
    const receipt = rsvp.respond(token, { response: 'maybe', note: 'Running late' });
    expect(receipt).toEqual({ response: 'maybe', responded_at: NOW.toISOString() });
    expect(test.store.plannerGuests.forItem(item.id)[0]).toMatchObject({
      response: 'maybe',
      note: 'Running late',
    });
    expect(notices.find((notice) => notice.type === 'planner_rsvp')).toMatchObject({
      personId: ann.profileId,
      response: 'maybe',
    });
    expect(rsvp.respond(token, { response: 'yes', note: null }).response).toBe('yes');
  });

  it('refuses unknown, malformed and cancelled links', async () => {
    const { item, token } = await invited();
    expect(() => rsvp.pageOf('x'.repeat(43))).toThrow(/no longer available/);
    expect(() => rsvp.pageOf('short')).toThrow(/no longer available/);
    test.store.plannerItems.update(item.id, ann.profileId, { status: 'cancelled' });
    expect(rsvp.pageOf(token).cancelled).toBe(true);
    expect(() => rsvp.respond(token, { response: 'yes', note: null })).toThrow(/cancelled/);
  });

  it('stores only a hash of the link token', async () => {
    const { item, token } = await invited();
    const stored = test.store.database
      .prepare('select token_hash from planner_guests where item_id = ?')
      .get(item.id);
    expect(JSON.stringify(stored)).not.toContain(token);
  });
});
