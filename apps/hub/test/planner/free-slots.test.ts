import { ApiError, type PlannerItemRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freeSlots, freeSlotsFromStore, type Span } from '../../src/planner/free-slots';
import { instantsOf } from '../../src/planner/instants';
import { acceptProposal, listProposals, rejectProposal } from '../../src/planner/proposals';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const ZONE = 'Europe/Berlin';

function at(time: string): Temporal.Instant {
  return Temporal.Instant.from(`2026-11-09T${time}:00Z`);
}

function span(from: string, to: string): Span {
  return { from: at(from), to: at(to) };
}

function times(slots: ReturnType<typeof freeSlots>): string[] {
  return slots.map(
    (slot) => `${slot.from.slice(11, 16)}-${slot.to.slice(11, 16)}:${String(slot.minutes)}`,
  );
}

describe('free slots', () => {
  const day = span('08:00', '18:00');

  it('returns the whole window when nothing is busy', () => {
    expect(times(freeSlots([], day, 30))).toEqual(['08:00-18:00:600']);
  });

  it('returns the gaps between events that are long enough', () => {
    const busy = [span('09:00', '10:00'), span('10:20', '12:00'), span('12:30', '13:00')];
    expect(times(freeSlots(busy, day, 30))).toEqual([
      '08:00-09:00:60',
      '12:00-12:30:30',
      '13:00-18:00:300',
    ]);
    expect(times(freeSlots(busy, day, 31))).toEqual(['08:00-09:00:60', '13:00-18:00:300']);
  });

  it('merges overlapping and touching events and clips events outside the window', () => {
    const busy = [
      span('07:00', '09:00'),
      span('08:30', '10:00'),
      span('10:00', '11:00'),
      span('17:00', '19:00'),
    ];
    expect(times(freeSlots(busy, day, 15))).toEqual(['11:00-17:00:360']);
  });

  it('has no slot when an event covers the window', () => {
    expect(freeSlots([span('07:00', '19:00')], day, 1)).toEqual([]);
  });
});

describe('from the store', () => {
  let test: TestStore;
  let owner: TestPerson;
  let other: TestPerson;
  let collectionId: string;

  function add(change: Partial<PlannerItemInput>, profileId = owner.profileId): PlannerItemRow {
    const base: PlannerItemInput = {
      profile_id: profileId,
      collection_id: collectionId,
      kind: 'event',
      parent_id: null,
      title: 'Meeting',
      notes: '',
      location: null,
      priority: null,
      tags: [],
      estimate_minutes: null,
      start_local: '2026-11-09T10:00',
      end_local: '2026-11-09T11:00',
      time_zone: ZONE,
      all_day: false,
      due_date: null,
      due_at: null,
      rrule: null,
      exdates: [],
      series_id: null,
      original_start: null,
      start: null,
      end: null,
      series_end: null,
      status: 'open',
      position: 0,
      completion: { kind: 'manual' },
      attachments: [],
      reminders: [],
      google: null,
      created_by: 'person',
      ...change,
    };
    return test.store.plannerItems.insert({ ...base, ...instantsOf(base) });
  }

  beforeEach(async () => {
    test = await testStore(() => new Date('2026-11-09T06:00:00.000Z'));
    owner = addPerson(test, 'Owner', 'owner');
    other = addPerson(test, 'Other', 'member');
    collectionId = test.store.plannerCollections.insert({
      profile_id: owner.profileId,
      kind: 'calendar',
      name: 'Work',
      colour: 'work',
      icon: 'briefcase',
      position: 0,
      visible: true,
      default_reminders: [],
      source: 'local',
      google: null,
    }).id;
  });

  afterEach(async () => {
    await test.close();
  });

  function query(minutes: number): Parameters<typeof freeSlotsFromStore>[1] {
    return {
      profileId: owner.profileId,
      from: at('08:00'),
      to: at('16:00'),
      minutes,
      timeZone: ZONE,
      now: at('06:00'),
    };
  }

  it('blocks timed events, repeats, scheduled tasks and ignores the rest', () => {
    add({ title: 'Meeting' });
    add({
      title: 'Standup',
      start_local: '2026-11-02T14:00',
      end_local: '2026-11-02T14:30',
      rrule: 'FREQ=DAILY',
    });
    add({
      kind: 'task',
      title: 'Write',
      start_local: '2026-11-09T12:00',
      end_local: null,
      estimate_minutes: 60,
    });
    add({
      title: 'Holiday',
      start_local: '2026-11-09',
      end_local: '2026-11-09',
      all_day: true,
      time_zone: null,
    });
    add({
      title: 'Cancelled',
      start_local: '2026-11-09T09:00',
      end_local: '2026-11-09T09:45',
      status: 'cancelled',
    });
    add({
      title: 'Proposed',
      start_local: '2026-11-09T15:00',
      end_local: '2026-11-09T16:00',
      status: 'proposed',
    });
    add(
      { title: 'Other person', start_local: '2026-11-09T09:30', end_local: '2026-11-09T10:30' },
      other.profileId,
    );
    expect(times(freeSlotsFromStore(test.store, query(30)))).toEqual([
      '08:00-09:00:60',
      '10:00-11:00:60',
      '12:00-13:00:60',
      '13:30-16:00:150',
    ]);
    expect(times(freeSlotsFromStore(test.store, query(61)))).toEqual(['13:30-16:00:150']);
  });
});

describe('proposals', () => {
  let test: TestStore;
  let owner: TestPerson;
  let other: TestPerson;
  let collectionId: string;

  function propose(profileId = owner.profileId): PlannerItemRow {
    const base: PlannerItemInput = {
      profile_id: profileId,
      collection_id: collectionId,
      kind: 'task',
      parent_id: null,
      title: 'Plan',
      notes: '',
      location: null,
      priority: null,
      tags: [],
      estimate_minutes: 30,
      start_local: '2026-11-09T09:00',
      end_local: null,
      time_zone: ZONE,
      all_day: false,
      due_date: null,
      due_at: null,
      rrule: null,
      exdates: [],
      series_id: null,
      original_start: null,
      start: null,
      end: null,
      series_end: null,
      status: 'proposed',
      position: 0,
      completion: { kind: 'manual' },
      attachments: [],
      reminders: [],
      google: null,
      created_by: 'ai',
    };
    return test.store.plannerItems.insert({ ...base, ...instantsOf(base) });
  }

  beforeEach(async () => {
    test = await testStore();
    owner = addPerson(test, 'Owner', 'owner');
    other = addPerson(test, 'Other', 'member');
    collectionId = test.store.plannerCollections.insert({
      profile_id: owner.profileId,
      kind: 'list',
      name: 'Tasks',
      colour: 'personal',
      icon: 'list',
      position: 0,
      visible: true,
      default_reminders: [],
      source: 'local',
      google: null,
    }).id;
  });

  afterEach(async () => {
    await test.close();
  });

  it('lists proposals and turns an accepted one into an open item', () => {
    const proposal = propose();
    expect(listProposals(test.store, owner.profileId).map((item) => item.id)).toEqual([
      proposal.id,
    ]);
    expect(acceptProposal(test.store, owner.profileId, proposal.id)).toMatchObject({
      status: 'open',
    });
    expect(listProposals(test.store, owner.profileId)).toEqual([]);
  });

  it('removes a rejected proposal', () => {
    const proposal = propose();
    rejectProposal(test.store, owner.profileId, proposal.id);
    expect(test.store.plannerItems.find(proposal.id, owner.profileId)).toBeUndefined();
  });

  it('refuses an item that is not a proposal or belongs to another person', () => {
    const proposal = propose();
    expect(() => {
      acceptProposal(test.store, other.profileId, proposal.id);
    }).toThrow(ApiError);
    acceptProposal(test.store, owner.profileId, proposal.id);
    expect(() => {
      acceptProposal(test.store, owner.profileId, proposal.id);
    }).toThrow(ApiError);
    expect(() => {
      rejectProposal(test.store, owner.profileId, proposal.id);
    }).toThrow(ApiError);
  });
});
