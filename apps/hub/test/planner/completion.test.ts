import { PLANNER_SIGNAL, type PlannerItemRow, type SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { CompletionWatcher } from '../../src/planner/completion';
import { instantsOf } from '../../src/planner/instants';
import { SignalBus } from '../../src/signals/bus';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-11-07T07:40:00.000Z';
const BRUSH = '8d4f1a52-7c0e-4b0e-9d58-0a6a3f5d2b01';
const TREADMILL = '3b7c9e10-52fd-4d2c-8c34-5f1e0c7a9d02';

let test: TestStore;
let clock: SimulatedClock;
let ann: TestPerson;
let bob: TestPerson;
let collections: Readonly<Record<string, string>>;
let published: SignalInput[];
let watcher: CompletionWatcher;

function build(): CompletionWatcher {
  return new CompletionWatcher({
    store: test.store,
    clock,
    emit: (signal): void => {
      published.push(signal);
    },
    log: testLogger(),
  });
}

function add(person: TestPerson, change: Partial<PlannerItemInput>): PlannerItemRow {
  const collection =
    collections[person.profileId] ??
    test.store.plannerCollections.insert({
      profile_id: person.profileId,
      kind: 'list',
      name: 'Health',
      colour: 'work',
      icon: 'heart',
      position: 1,
      visible: true,
      default_reminders: [],
      source: 'local',
      google: null,
    }).id;
  collections = { ...collections, [person.profileId]: collection };
  const input: PlannerItemInput = {
    profile_id: person.profileId,
    collection_id: collection,
    kind: 'task',
    parent_id: null,
    title: 'Brush my teeth',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-07T07:30',
    end_local: null,
    time_zone: 'UTC',
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
    position: 1,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    ...change,
  };
  return test.store.plannerItems.insert({ ...input, ...instantsOf(input) });
}

function signalRule(
  subject: string,
  match: Readonly<Record<string, string>>,
  window: 'occurrence' | 'day',
): PlannerItemInput['completion'] {
  return {
    kind: 'signal',
    matcher: { source: 'event', kind: 'activity', subject, match },
    window,
  };
}

function signal(
  subject: string,
  data: Record<string, string | number | boolean>,
  at: string,
): SignalInput {
  return {
    source: 'event',
    kind: 'activity',
    subject,
    field: null,
    value: true,
    previous: null,
    at,
    profileId: null,
    data,
  };
}

const brushed = (person: string, at: string): SignalInput =>
  signal(BRUSH, { brushing: 'finished', person, eventId: 'e-1' }, at);

beforeEach(async () => {
  test = await testStore(() => new Date(NOW));
  clock = new SimulatedClock(NOW);
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  collections = {};
  published = [];
  watcher = build();
});

afterEach(async () => {
  await test.close();
});

describe('completing from a device signal', () => {
  it('completes brush my teeth from the Oral-B session and keeps the evidence', () => {
    const teeth = add(ann, {
      completion: signalRule(BRUSH, { brushing: 'finished', person: 'Ann' }, 'occurrence'),
    });
    const saved = watcher.handle(
      signal(
        BRUSH,
        {
          brushing: 'finished',
          person: 'Ann',
          summary: 'Ann finished brushing with iO9',
          eventId: 'e-1',
        },
        '2026-11-07T07:38:00.000Z',
      ),
    );
    expect(saved).toHaveLength(1);
    expect(test.store.plannerOccurrences.byKey(teeth.id, 'single')).toMatchObject({
      status: 'done',
      completed_by: 'signal',
      completed_at: '2026-11-07T07:38:00.000Z',
      evidence: {
        source: 'event',
        deviceId: BRUSH,
        summary: 'Ann finished brushing with iO9',
        sessionId: 'e-1',
      },
    });
    expect(test.store.plannerItems.byId(teeth.id, ann.profileId).status).toBe('done');
  });

  it('publishes task_done for the completed occurrence', () => {
    const teeth = add(ann, {
      completion: signalRule(BRUSH, { brushing: 'finished', person: 'Ann' }, 'occurrence'),
    });
    watcher.handle(brushed('Ann', '2026-11-07T07:38:00.000Z'));
    expect(published).toHaveLength(1);
    expect(PLANNER_SIGNAL.parse(published[0])).toMatchObject({
      kind: 'task_done',
      subject: teeth.id,
      profileId: ann.profileId,
      data: { itemId: teeth.id, occurrenceKey: 'single', completedBy: 'signal' },
    });
  });

  it('completes use the treadmill from a Kingsmith finished session at any time that day', () => {
    const walk = add(ann, {
      title: 'Use the treadmill',
      start_local: null,
      due_date: '2026-11-07',
      completion: signalRule(TREADMILL, { phase: 'finished', kind: 'walk' }, 'day'),
    });
    watcher.handle(
      signal(TREADMILL, { phase: 'started', kind: 'walk' }, '2026-11-07T06:00:00.000Z'),
    );
    expect(test.store.plannerOccurrences.find(walk.id, 'single')).toBeUndefined();
    watcher.handle(
      signal(
        TREADMILL,
        { phase: 'finished', kind: 'walk', duration_s: 1500 },
        '2026-11-07T06:30:00.000Z',
      ),
    );
    expect(test.store.plannerOccurrences.byKey(walk.id, 'single')).toMatchObject({
      status: 'done',
      evidence: {
        source: 'event',
        deviceId: TREADMILL,
        summary: 'event activity',
        sessionId: null,
      },
    });
  });

  it('ignores a signal from another person', () => {
    const teeth = add(ann, {
      completion: signalRule(BRUSH, { brushing: 'finished', person: 'Ann' }, 'occurrence'),
    });
    expect(watcher.handle(brushed('Bob', '2026-11-07T07:38:00.000Z'))).toEqual([]);
    expect(test.store.plannerOccurrences.find(teeth.id, 'single')).toBeUndefined();
    expect(published).toEqual([]);
  });

  it('keeps a signal that carries another profile away from this person items', () => {
    const teeth = add(ann, {
      completion: signalRule(BRUSH, { brushing: 'finished' }, 'occurrence'),
    });
    const theirs = { ...brushed('Bob', '2026-11-07T07:38:00.000Z'), profileId: bob.profileId };
    expect(watcher.handle(theirs)).toEqual([]);
    expect(test.store.plannerItems.byId(teeth.id, ann.profileId).status).toBe('open');
  });

  it('leaves manual items and other devices alone', () => {
    add(ann, {});
    add(ann, { completion: signalRule(TREADMILL, { brushing: 'finished' }, 'occurrence') });
    expect(watcher.handle(brushed('Ann', '2026-11-07T07:38:00.000Z'))).toEqual([]);
  });
});

describe('the occurrence window', () => {
  const rule = signalRule(BRUSH, { brushing: 'finished', person: 'Ann' }, 'occurrence');

  it('does not count a signal before the occurrence starts', () => {
    const teeth = add(ann, { completion: rule });
    expect(watcher.handle(brushed('Ann', '2026-11-07T07:00:00.000Z'))).toEqual([]);
    expect(test.store.plannerOccurrences.find(teeth.id, 'single')).toBeUndefined();
  });

  it('does not count a signal after the occurrence ends', () => {
    add(ann, { end_local: '2026-11-07T08:00', completion: rule });
    expect(watcher.handle(brushed('Ann', '2026-11-07T09:00:00.000Z'))).toEqual([]);
  });

  it('completes only the repeat whose window holds the signal', () => {
    const daily = add(ann, { rrule: 'FREQ=DAILY', completion: rule });
    watcher.handle(brushed('Ann', '2026-11-09T07:38:00.000Z'));
    expect(
      test.store.plannerOccurrences.forItems([daily.id]).map((row) => row.occurrence_key),
    ).toEqual(['2026-11-09T07:30:00.000Z']);
    expect(test.store.plannerItems.byId(daily.id, ann.profileId).status).toBe('open');
  });

  it('does not complete the same occurrence twice', () => {
    add(ann, { completion: rule });
    watcher.handle(brushed('Ann', '2026-11-07T07:38:00.000Z'));
    watcher.handle(brushed('Ann', '2026-11-07T07:50:00.000Z'));
    expect(published).toHaveLength(1);
  });
});

describe('listening on the signal bus', () => {
  it('completes from a published signal and ignores its own task_done', () => {
    const teeth = add(ann, {
      completion: signalRule(BRUSH, { brushing: 'finished', person: 'Ann' }, 'occurrence'),
    });
    const bus = new SignalBus({ log: testLogger() });
    const detach = watcher.attach(bus);
    bus.emit(brushed('Ann', '2026-11-07T07:38:00.000Z'));
    expect(test.store.plannerOccurrences.byKey(teeth.id, 'single').status).toBe('done');
    detach();
    expect(published).toHaveLength(1);
  });
});
