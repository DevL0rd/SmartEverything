import {
  traceSubjectOf,
  type AutomationRunRecord,
  type ProcessWindow,
  type RunNodeRecord,
  type TraceNodeState,
  type TraceRun,
  type TraceWait,
} from '@smarteverything/domain';
import type { LiveSinkParts } from '../automations/driver/live-sink';
import { traceWatchSource } from '../automations/driver/live-sink';
import type { Viewers } from '../metrics/viewers';
import type { AutomationRunNodesRepository } from '../store/repositories/automation-run-nodes';
import type { AutomationRunRecordsRepository } from '../store/repositories/automation-run-records';
import { StoreNotFoundError } from '../store/context';
import type { LiveWatch, WatchConnection } from './live-watch';
import type { TraceOwners, TraceProfiles } from './live-visibility';

export interface AutomationTraceWiringParts {
  readonly live: {
    readonly watches: Pick<LiveWatch<WatchConnection>, 'attachTrace' | 'publish'>;
  };
  readonly viewers: Viewers<ProcessWindow>;
  readonly owners: TraceOwners;
  readonly store: TraceProfiles;
  readonly records: Pick<AutomationRunRecordsRepository, 'active' | 'byId'>;
  readonly nodes: Pick<AutomationRunNodesRepository, 'forRun'>;
  readonly now: () => string;
}

export interface AutomationTraceWiring {
  readonly trace: Pick<LiveSinkParts, 'watched' | 'publish'>;
  readonly detach: () => void;
}

function nodeStates(records: readonly RunNodeRecord[]): TraceNodeState[] {
  const latest = new Map<string, RunNodeRecord>();
  records.forEach((node) => latest.set(node.path, node));
  return [...latest.values()].map((node) => ({
    path: node.path,
    status: node.status,
    iteration: node.iteration,
    durationMs: node.duration_ms,
    ...(node.output_preview === null ? {} : { outputPreview: node.output_preview }),
  }));
}

function waitOf(record: AutomationRunRecord): TraceWait | null {
  if (record.status !== 'waiting') return null;
  const kind = record.waiting_on?.['kind'];
  return { kind: typeof kind === 'string' ? kind : 'wait', wakeAt: record.wake_at };
}

export function wireAutomationTrace(parts: AutomationTraceWiringParts): AutomationTraceWiring {
  const { records, nodes, viewers } = parts;
  const traceRun = (record: AutomationRunRecord): TraceRun => ({
    runId: record.id,
    automationId: record.automation_id,
    status: record.status,
    activePaths: [...record.active_paths],
    lastNodeStates: nodeStates(nodes.forRun(record.id)),
    wait: waitOf(record),
  });
  const runsOf = (subject: string): readonly TraceRun[] => {
    const parsed = traceSubjectOf(subject);
    if (parsed === null) return [];
    if (parsed.kind === 'automation') return records.active(parsed.id).map(traceRun);
    try {
      return [traceRun(records.byId(parsed.id))];
    } catch (error) {
      if (error instanceof StoreNotFoundError) return [];
      throw error;
    }
  };
  const detach = parts.live.watches.attachTrace(
    traceWatchSource({
      viewers,
      owners: parts.owners,
      store: parts.store,
      runs: runsOf,
      now: parts.now,
    }),
  );
  return {
    trace: {
      watched: (subject): boolean => viewers.watched(subject),
      publish: (notice): void => {
        parts.live.watches.publish(notice);
      },
    },
    detach,
  };
}
