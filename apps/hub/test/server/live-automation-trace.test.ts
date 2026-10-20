import {
  SOCKET_BACK_PRESSURE_BYTES,
  type AutomationTraceNotice,
  type ClientRow,
  type ComputerLiveNotice,
  type ProcessWindow,
  type TraceNodeStateNotice,
  type TraceRun,
} from '@smarteverything/domain';
import { resolveBudgets, startBudgets } from '@smarteverything/flow/state/budgets';
import type { RunState } from '@smarteverything/flow/state/run-state';
import { describe, expect, it } from 'vitest';
import { liveSink, traceWaitOf, traceWatchSource } from '../../src/automations/driver/live-sink';
import type { RunSink } from '../../src/automations/driver/ports';
import { Viewers } from '../../src/metrics/viewers';
import { LiveWatch, type WatchNotice } from '../../src/server/live-watch';
import type { TraceOwners } from '../../src/server/live-visibility';
import { testLogger } from '../support/logs';

const AUTOMATION = '11111111-1111-4111-8111-111111111111';
const OTHER_AUTOMATION = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const OTHER_RUN = '44444444-4444-4444-8444-444444444444';
const PC = '55555555-5555-4555-8555-555555555555';
const MINE = '66666666-6666-4666-8666-666666666666';
const AT = '2026-10-19T10:00:00.000Z';
const NOW = Date.UTC(2026, 9, 19, 10, 0, 0);

function client(id: string, role: ClientRow['role']): ClientRow {
  return {
    id,
    name: id,
    platform: 'android',
    kind: 'phone',
    role,
    built_in: false,
    profile_id: null,
    created_at: AT,
    last_seen_at: null,
  };
}

interface Fake {
  readonly id: number;
  readonly client: ClientRow;
  readonly socket: { bufferedAmount: number };
}

function connection(id: number, who: ClientRow): Fake {
  return { id, client: who, socket: { bufferedAmount: 0 } };
}

const OWNER = client('owner', 'owner');
const MEMBER = client('member', 'member');

const OWNERS: TraceOwners = {
  authorOf: (automationId) =>
    automationId === AUTOMATION ? { via: 'person', profile_id: MINE } : null,
  automationOfRun: (runId) =>
    runId === RUN ? AUTOMATION : runId === OTHER_RUN ? OTHER_AUTOMATION : null,
};

const STORE = {
  profiles: {
    activeOf: (clientId: string): { id: string } => ({ id: clientId === 'member' ? MINE : 'x' }),
  },
};

function runOf(runId: string, automationId: string): TraceRun {
  return {
    runId,
    automationId,
    status: 'running',
    activePaths: ['a#1'],
    lastNodeStates: [],
    wait: null,
  };
}

function rig(runs: readonly TraceRun[] = []): {
  readonly watch: LiveWatch<Fake>;
  readonly viewers: Viewers<ProcessWindow>;
  readonly sent: [number, WatchNotice | AutomationTraceNotice][];
} {
  const viewers = new Viewers<ProcessWindow>();
  const sent: [number, WatchNotice | AutomationTraceNotice][] = [];
  const watch = new LiveWatch<Fake>({
    send: (to, message): void => {
      sent.push([to.id, message]);
    },
    sendTrace: (to, message): void => {
      sent.push([to.id, message]);
    },
    log: testLogger(),
  });
  watch.attach({ viewers, allowed: () => true, keyframe: () => null });
  watch.attachTrace(
    traceWatchSource({
      viewers,
      owners: OWNERS,
      store: STORE,
      runs: (subject) =>
        runs.filter(
          (run) => subject === `automation:${run.automationId}` || subject === `run:${run.runId}`,
        ),
      now: () => AT,
    }),
  );
  return { watch, viewers, sent };
}

function nodeState(path: string, runId = RUN, automationId = AUTOMATION): TraceNodeStateNotice {
  return {
    type: 'trace_node_state',
    automationId,
    runId,
    path,
    status: 'succeeded',
    iteration: 0,
    durationMs: 0,
  };
}

function finished(runId = RUN, automationId = AUTOMATION): AutomationTraceNotice {
  return { type: 'trace_run_finished', automationId, runId, outcome: 'succeeded' };
}

describe('live automation trace', () => {
  it('lets the owner watch any automation and a member only the ones they authored', () => {
    const { watch, viewers } = rig();
    watch.receiveTrace(connection(1, OWNER), {
      type: 'watch_automations',
      demands: [{ automationId: OTHER_AUTOMATION }],
    });
    watch.receiveTrace(connection(2, MEMBER), {
      type: 'watch_automations',
      demands: [{ automationId: OTHER_AUTOMATION }, { runId: OTHER_RUN }, { runId: RUN }],
    });
    expect(viewers.watched(`automation:${OTHER_AUTOMATION}`)).toBe(true);
    expect(viewers.watched(`run:${OTHER_RUN}`)).toBe(false);
    expect(viewers.watched(`run:${RUN}`)).toBe(true);
  });

  it('holds trace demands next to device demands and releases both when the socket closes', () => {
    const { watch, viewers } = rig();
    const phone = connection(1, OWNER);
    watch.receive(phone, { type: 'watch', demands: [{ deviceId: PC, topics: ['cpu'] }] });
    watch.receiveTrace(phone, {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    expect(viewers.watched(`device:${PC}`)).toBe(true);
    expect(viewers.watched(`automation:${AUTOMATION}`)).toBe(true);
    watch.receiveTrace(phone, { type: 'watch_automations', demands: [] });
    expect(viewers.watched(`device:${PC}`)).toBe(true);
    expect(viewers.watched(`automation:${AUTOMATION}`)).toBe(false);
    watch.close(phone);
    expect(viewers.watched(`device:${PC}`)).toBe(false);
  });

  it('sends a keyframe of the runs when a watch starts and not again for a held subject', () => {
    const { watch, sent } = rig([runOf(RUN, AUTOMATION)]);
    const phone = connection(1, OWNER);
    watch.receiveTrace(phone, {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    watch.receiveTrace(phone, {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    expect(sent).toEqual([
      [
        1,
        {
          type: 'trace_keyframe',
          automationId: AUTOMATION,
          at: AT,
          runs: [runOf(RUN, AUTOMATION)],
        },
      ],
    ]);
  });

  it('sends a run watcher only its own run and an automation watcher every run', () => {
    const { watch, sent } = rig();
    watch.receiveTrace(connection(1, OWNER), {
      type: 'watch_automations',
      demands: [{ runId: RUN }],
    });
    watch.receiveTrace(connection(2, OWNER), {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    sent.length = 0;
    watch.publish(nodeState('a#1'));
    watch.publish(nodeState('a#1', OTHER_RUN));
    expect(
      sent.map(([to, notice]) => [to, notice.type === 'trace_node_state' ? notice.runId : '']),
    ).toEqual([
      [1, RUN],
      [2, RUN],
      [2, OTHER_RUN],
    ]);
  });

  it('keeps device notices out of trace watchers and trace notices out of device watchers', () => {
    const { watch, sent } = rig();
    watch.receive(connection(1, OWNER), {
      type: 'watch',
      demands: [{ deviceId: PC, topics: ['cpu'] }],
    });
    watch.receiveTrace(connection(2, OWNER), {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    const computer: ComputerLiveNotice = { type: 'computer_live', deviceId: PC, at: AT, parts: {} };
    sent.length = 0;
    watch.publish(computer);
    watch.publish(nodeState('a#1'));
    expect(sent.map(([to, notice]) => [to, notice.type])).toEqual([[2, 'trace_node_state']]);
  });

  it('keeps the last write per run and path while the socket is backed up (B9)', () => {
    const { watch, sent } = rig();
    const phone = connection(1, OWNER);
    watch.receiveTrace(phone, {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    sent.length = 0;
    phone.socket.bufferedAmount = SOCKET_BACK_PRESSURE_BYTES + 1;
    for (let index = 0; index < 1000; index += 1) {
      watch.publish({ ...nodeState('loop#1'), iteration: index });
      watch.publish({ ...nodeState('loop#2'), iteration: index });
    }
    expect(sent).toEqual([]);
    phone.socket.bufferedAmount = 0;
    watch.publish(nodeState('other#1'));
    expect(sent.map(([, notice]) => notice)).toEqual([
      { ...nodeState('loop#1'), iteration: 999 },
      { ...nodeState('loop#2'), iteration: 999 },
      nodeState('other#1'),
    ]);
  });

  it('flushes the held node states before a parked or finished notice, in order', () => {
    const { watch, sent } = rig();
    const phone = connection(1, OWNER);
    watch.receiveTrace(phone, {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    sent.length = 0;
    phone.socket.bufferedAmount = SOCKET_BACK_PRESSURE_BYTES + 1;
    watch.publish(nodeState('a#1'));
    watch.publish(finished());
    expect(sent.map(([, notice]) => notice.type)).toEqual([
      'trace_node_state',
      'trace_run_finished',
    ]);
  });

  it('describes the wake instant of every wait kind', () => {
    const base = { nodePath: 'n#1', durable: true } as const;
    expect(traceWaitOf({ kind: 'duration', ...base, dueAt: NOW + 1000 })).toEqual({
      kind: 'duration',
      wakeAt: new Date(NOW + 1000).toISOString(),
    });
    expect(traceWaitOf({ kind: 'breakpoint', ...base })).toEqual({
      kind: 'breakpoint',
      wakeAt: null,
    });
    expect(
      traceWaitOf({
        kind: 'any',
        ...base,
        waits: [
          { kind: 'duration', ...base, dueAt: NOW + 5000 },
          { kind: 'answer', ...base, notificationId: 'n', options: [], deadlineAt: NOW + 2000 },
        ],
      }),
    ).toEqual({ kind: 'any', wakeAt: new Date(NOW + 2000).toISOString() });
  });
});

function stateOf(runId: string, automationId: string): RunState {
  return {
    runId,
    automationId,
    revision: 1,
    planRefs: [{ id: automationId, revision: 1, hash: 'a'.repeat(64) }],
    trigger: null,
    payload: {},
    inputs: {},
    ownerProfileId: null,
    origin: null,
    causeChain: [],
    frames: [{ id: 'root', kind: 'root', path: '', pc: 0, locals: {}, outputs: {} }],
    captures: {},
    budgets: startBudgets(resolveBudgets(), NOW),
    seed: 1,
  };
}

function sinkRig(watched: (subject: string) => boolean): {
  readonly sink: RunSink;
  readonly published: AutomationTraceNotice[];
  readonly inner: string[];
} {
  const published: AutomationTraceNotice[] = [];
  const inner: string[] = [];
  const base: RunSink = {
    queued: () => inner.push('queued'),
    dropped: () => inner.push('dropped'),
    started: () => inner.push('started'),
    slice: () => inner.push('slice'),
    parked: () => inner.push('parked'),
    resumed: () => inner.push('resumed'),
    finished: () => inner.push('finished'),
  };
  const sink = liveSink({
    inner: base,
    watched,
    publish: (notice) => published.push(notice),
  });
  return { sink, published, inner };
}

describe('live trace sink', () => {
  it('publishes nothing and builds no previews when nobody watches (B8)', () => {
    const { sink, published, inner } = sinkRig(() => false);
    const state = stateOf(RUN, AUTOMATION);
    const value = {
      get explode(): never {
        throw new Error('previewed');
      },
    };
    sink.started(state, 'live');
    sink.slice(RUN, [{ kind: 'capture', activation: 'a#1', node: 'a', value }]);
    sink.parked({ ...state, wait: { kind: 'breakpoint', nodePath: 'a#1', durable: false } });
    sink.finished(state, { status: 'succeeded' }, 'live');
    expect(published).toEqual([]);
    expect(inner).toEqual(['started', 'slice', 'parked', 'finished']);
  });

  it('publishes one node state per distinct path of a slice, the last write winning (B9)', () => {
    const { sink, published } = sinkRig((subject) => subject === `automation:${AUTOMATION}`);
    sink.started(stateOf(RUN, AUTOMATION), 'live');
    sink.slice(RUN, [
      { kind: 'capture', activation: 'a#1', node: 'a', value: 1 },
      { kind: 'capture', activation: 'a#1', node: 'a', value: 2 },
      { kind: 'capture', activation: 'b#1', node: 'b', value: 3 },
      { kind: 'note', node: 'a', message: 'x' },
    ]);
    expect(
      published.map((notice) => (notice.type === 'trace_node_state' ? notice.outputPreview : null)),
    ).toEqual([{ value: 2 }, { value: 3 }]);
  });

  it('publishes parked and finished notices for a watched run and then forgets it', () => {
    const { sink, published } = sinkRig((subject) => subject === `run:${RUN}`);
    const state = stateOf(RUN, AUTOMATION);
    sink.started(state, 'live');
    sink.parked({
      ...state,
      wait: { kind: 'duration', nodePath: 'w#1', durable: true, dueAt: NOW },
    });
    sink.finished(state, { status: 'failed' }, 'live');
    sink.slice(RUN, [{ kind: 'capture', activation: 'a#1', node: 'a', value: 1 }]);
    expect(published).toEqual([
      {
        type: 'trace_run_parked',
        automationId: AUTOMATION,
        runId: RUN,
        kind: 'duration',
        wakeAt: new Date(NOW).toISOString(),
      },
      { type: 'trace_run_finished', automationId: AUTOMATION, runId: RUN, outcome: 'failed' },
    ]);
  });

  it('reports a dropped run as cancelled', () => {
    const { sink, published } = sinkRig(() => true);
    const state = stateOf(RUN, AUTOMATION);
    sink.queued(state, 'live');
    sink.dropped(state, 'queue_full');
    expect(published).toEqual([
      { type: 'trace_run_finished', automationId: AUTOMATION, runId: RUN, outcome: 'cancelled' },
    ]);
  });
});
