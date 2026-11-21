import type { AutomationDecision } from '@smarteverything/domain';
import type { HostedRepository } from '../store/host/hosted';
import type { PendingDecision } from './driver/decisions';

export type DecisionReader = HostedRepository<'automationDecisions', 'forAutomation'>;

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
    forAutomation: async (automationId, since, limit) =>
      withPending(await stored.forAutomation(automationId, since, limit), pending(automationId)),
  };
}
