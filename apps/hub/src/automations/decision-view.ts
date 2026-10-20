import type { AutomationDecision } from '@smarteverything/domain';
import type { AutomationDecisionsRepository } from '../store/repositories/automation-decisions';
import type { PendingDecision } from './driver/decisions';

type DecisionReader = Pick<AutomationDecisionsRepository, 'forAutomation'>;

function later(left: string, right: string): string {
  return Date.parse(right) > Date.parse(left) ? right : left;
}

export function withPending(
  stored: readonly AutomationDecision[],
  pending: readonly PendingDecision[],
): AutomationDecision[] {
  return stored.map((row) => {
    const open = pending.find(
      (held) =>
        held.reason === row.reason && Date.parse(held.windowStart) === Date.parse(row.window_start),
    );
    if (open === undefined) return row;
    return { ...row, count: row.count + open.count, last_at: later(row.last_at, open.lastAt) };
  });
}

export function decisionView(
  stored: DecisionReader,
  pending: (automationId: string) => readonly PendingDecision[],
): DecisionReader {
  return {
    forAutomation: (automationId, since, limit) =>
      withPending(stored.forAutomation(automationId, since, limit), pending(automationId)),
  };
}
