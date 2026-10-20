import type { AutomationDecision } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { decisionView } from '../../../src/automations/decision-view';
import { Decisions } from '../../../src/automations/driver/decisions';
import type { DroppedRun } from '../../../src/store/repositories/automation-decisions';
import { FakeClock } from '../../support/fake-clock';

const AUTOMATION = '00000000-0000-4000-8000-0000000000a1';

function storedOf(dropped: readonly DroppedRun[]): AutomationDecision[] {
  return dropped.map((row) => ({
    automation_id: row.automationId,
    window_start: new Date(Date.parse(row.at) - (Date.parse(row.at) % 60_000)).toISOString(),
    reason: row.reason,
    count: row.times ?? 1,
    first_at: row.at,
    last_at: row.at,
    detail: null,
  }));
}

describe('decision view', () => {
  it('counts the refusals of the open window before the window is written', () => {
    const clock = new FakeClock('2026-10-08T10:00:05.000Z');
    const written: DroppedRun[] = [];
    const decisions = new Decisions(
      {
        record: (row): void => {
          written.push(row);
        },
      },
      clock,
    );
    decisions.record(AUTOMATION, 'parallel_full');
    clock.advanceTo('2026-10-08T10:00:07.000Z');
    decisions.record(AUTOMATION, 'parallel_full');
    expect(written).toHaveLength(1);
    const view = decisionView({ forAutomation: () => storedOf(written) }, (automationId) =>
      decisions.pending(automationId),
    );
    expect(view.forAutomation(AUTOMATION, null, 50)).toMatchObject([
      { reason: 'parallel_full', count: 2, last_at: '2026-10-08T10:00:07.000Z' },
    ]);
    expect(decisions.pending('00000000-0000-4000-8000-0000000000b2')).toEqual([]);
    decisions.flush();
    expect(decisions.pending(AUTOMATION)).toEqual([]);
  });
});
