import { useEffect, useReducer } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { AutomationTraceNotice, AutomationWatchDemand } from '@smarteverything/domain';
import { useScreenLive } from '../../../design/animation-gate';
import { automationKeys } from './keys';
import { useAutomationsSource } from './source';
import { EMPTY_TRACE, traceGateOpen, traceReduce, type TraceState } from './trace-state';

export interface RunTrace {
  readonly state: TraceState;
  readonly live: boolean;
}

type Action = AutomationTraceNotice | { readonly type: 'reset' };

function reduce(state: TraceState, action: Action): TraceState {
  return action.type === 'reset' ? EMPTY_TRACE : traceReduce(state, action);
}

function demandOf(automationId: string | null, runId: string | null): AutomationWatchDemand | null {
  if (automationId !== null) return { automationId };
  return runId === null ? null : { runId };
}

export function useRunTrace(demand: AutomationWatchDemand, onScreen = true): RunTrace {
  const { trace } = useAutomationsSource();
  const client = useQueryClient();
  const { focused, foreground } = useScreenLive();
  const live = traceGateOpen(focused, foreground, onScreen);
  const [state, receive] = useReducer(reduce, EMPTY_TRACE);
  const automationId = 'automationId' in demand ? demand.automationId : null;
  const runId = 'runId' in demand ? demand.runId : null;
  useEffect(() => {
    receive({ type: 'reset' });
  }, [automationId, runId]);
  useEffect(() => {
    const held = demandOf(automationId, runId);
    if (!live || held === null) return undefined;
    return trace.hold(held, (notice) => {
      receive(notice);
      if (notice.type !== 'trace_run_finished') return;
      background(
        Promise.all([
          client.invalidateQueries({ queryKey: automationKeys.runs(notice.automationId) }),
          client.invalidateQueries({ queryKey: automationKeys.runs(null) }),
          client.invalidateQueries({ queryKey: automationKeys.run(notice.runId) }),
        ]),
        'automations.runs_refresh',
        { runId: notice.runId },
      );
    });
  }, [trace, client, live, automationId, runId]);
  return { state, live };
}
