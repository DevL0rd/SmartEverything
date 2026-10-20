import { describe, expect, it, vi } from 'vitest';
import type { AutomationTraceNotice, AutomationWatchMessage } from '@smarteverything/domain';
import { TraceRegistry, demandsOf } from './trace-channel';
import { EMPTY_TRACE, activeRunsOf, traceGateOpen, traceReduce } from './trace-state';

const AUTOMATION = '00000000-0000-4000-8000-00000000000a';
const OTHER = '00000000-0000-4000-8000-00000000000c';
const RUN = '00000000-0000-4000-8000-00000000000b';
const AT = '2026-10-18T10:00:00+07:00';

const keyframe: AutomationTraceNotice = {
  type: 'trace_keyframe',
  automationId: AUTOMATION,
  at: AT,
  runs: [
    {
      runId: RUN,
      automationId: AUTOMATION,
      status: 'running',
      activePaths: ['n1'],
      lastNodeStates: [{ path: 'n1', status: 'running', iteration: 0, durationMs: null }],
      wait: null,
    },
  ],
};

describe('traceReduce', () => {
  it('replaces the runs of the automation on a keyframe and keeps other automations', () => {
    const other = traceReduce(EMPTY_TRACE, {
      ...keyframe,
      automationId: OTHER,
      runs: [{ ...keyframe.runs[0]!, runId: OTHER, automationId: OTHER }],
    });
    const state = traceReduce(other, keyframe);
    expect(Object.keys(state.runs).sort()).toEqual([OTHER, RUN].sort());
    expect(state.runs[RUN]?.nodes['n1']?.status).toBe('running');
    const emptied = traceReduce(state, { ...keyframe, runs: [] });
    expect(Object.keys(emptied.runs)).toEqual([OTHER]);
  });

  it('upserts node states and tracks the running paths', () => {
    const start = traceReduce(EMPTY_TRACE, keyframe);
    const next = traceReduce(start, {
      type: 'trace_node_state',
      automationId: AUTOMATION,
      runId: RUN,
      path: 'n1',
      status: 'succeeded',
      iteration: 0,
      durationMs: 12,
    });
    const moved = traceReduce(next, {
      type: 'trace_node_state',
      automationId: AUTOMATION,
      runId: RUN,
      path: 'n2',
      status: 'running',
      iteration: 0,
      durationMs: null,
      outputPreview: { value: 1 },
    });
    expect(moved.runs[RUN]?.activePaths).toEqual(['n2']);
    expect(moved.runs[RUN]?.nodes['n1']?.durationMs).toBe(12);
    expect(moved.runs[RUN]?.nodes['n2']?.outputPreview).toEqual({ value: 1 });
  });

  it('creates a run it has not seen from a node state', () => {
    const state = traceReduce(EMPTY_TRACE, {
      type: 'trace_node_state',
      automationId: AUTOMATION,
      runId: RUN,
      path: 'n3',
      status: 'running',
      iteration: 2,
      durationMs: null,
    });
    expect(state.runs[RUN]).toMatchObject({ status: 'running', activePaths: ['n3'] });
  });

  it('parks a run with its wake time and resumes it when a node runs again', () => {
    const parked = traceReduce(traceReduce(EMPTY_TRACE, keyframe), {
      type: 'trace_run_parked',
      automationId: AUTOMATION,
      runId: RUN,
      kind: 'duration',
      wakeAt: AT,
    });
    expect(parked.runs[RUN]).toMatchObject({ status: 'waiting', wait: { kind: 'duration' } });
    expect(activeRunsOf(parked)).toHaveLength(1);
    const resumed = traceReduce(parked, {
      type: 'trace_node_state',
      automationId: AUTOMATION,
      runId: RUN,
      path: 'n4',
      status: 'running',
      iteration: 0,
      durationMs: null,
    });
    expect(resumed.runs[RUN]).toMatchObject({ status: 'running', wait: null });
  });

  it('finishes a run and clears what was active', () => {
    const done = traceReduce(traceReduce(EMPTY_TRACE, keyframe), {
      type: 'trace_run_finished',
      automationId: AUTOMATION,
      runId: RUN,
      outcome: 'failed',
    });
    expect(done.runs[RUN]).toMatchObject({ status: 'failed', activePaths: [], wait: null });
    expect(activeRunsOf(done)).toHaveLength(0);
  });
});

describe('traceGateOpen', () => {
  it('needs focus, foreground and being on screen', () => {
    expect(traceGateOpen(true, true, true)).toBe(true);
    expect(traceGateOpen(false, true, true)).toBe(false);
    expect(traceGateOpen(true, false, true)).toBe(false);
    expect(traceGateOpen(true, true, false)).toBe(false);
  });
});

describe('TraceRegistry', () => {
  it('sends the demand only while something holds it, once per change', () => {
    const registry = new TraceRegistry();
    const sent: AutomationWatchMessage[] = [];
    registry.attach((message) => sent.push(message));
    const release = registry.hold({ automationId: AUTOMATION }, vi.fn());
    const second = registry.hold({ automationId: AUTOMATION }, vi.fn());
    expect(sent).toEqual([{ type: 'watch_automations', demands: [{ automationId: AUTOMATION }] }]);
    release();
    expect(sent).toHaveLength(1);
    second();
    expect(sent.at(-1)).toEqual({ type: 'watch_automations', demands: [] });
  });

  it('holds demands taken before the socket attaches and sends them on attach', () => {
    const registry = new TraceRegistry();
    registry.hold({ runId: RUN }, vi.fn());
    const sent: AutomationWatchMessage[] = [];
    registry.attach((message) => sent.push(message));
    expect(sent).toEqual([{ type: 'watch_automations', demands: [{ runId: RUN }] }]);
  });

  it('delivers a notice to holders of its automation or run and no one else', () => {
    const registry = new TraceRegistry();
    const forAutomation = vi.fn();
    const forRun = vi.fn();
    const forOther = vi.fn();
    registry.hold({ automationId: AUTOMATION }, forAutomation);
    registry.hold({ runId: RUN }, forRun);
    registry.hold({ automationId: OTHER }, forOther);
    registry.deliver({
      type: 'trace_run_finished',
      automationId: AUTOMATION,
      runId: RUN,
      outcome: 'succeeded',
    });
    expect(forAutomation).toHaveBeenCalledOnce();
    expect(forRun).toHaveBeenCalledOnce();
    expect(forOther).not.toHaveBeenCalled();
  });

  it('refuses a notice that does not match the contract', () => {
    const registry = new TraceRegistry();
    const listener = vi.fn();
    registry.hold({ automationId: AUTOMATION }, listener);
    registry.deliver({ type: 'trace_run_finished', automationId: AUTOMATION });
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops delivering after release', () => {
    const registry = new TraceRegistry();
    const listener = vi.fn();
    const release = registry.hold({ automationId: AUTOMATION }, listener);
    release();
    registry.deliver(keyframe);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('demandsOf', () => {
  it('lists each subject once in a stable order', () => {
    const listener = vi.fn();
    const demands = demandsOf([
      { demand: { runId: RUN }, listener },
      { demand: { automationId: AUTOMATION }, listener },
      { demand: { automationId: AUTOMATION }, listener },
    ]);
    expect(demands).toEqual([{ automationId: AUTOMATION }, { runId: RUN }]);
  });
});
