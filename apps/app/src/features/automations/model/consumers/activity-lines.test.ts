import type { EventRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automationRunAtom } from './activity-lines';

function event(details: EventRow['details']): EventRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    device_id: null,
    kind: 'automation_run',
    occurred_at: '2026-10-18T10:00:00.000Z',
    details,
    acknowledged_at: null,
    created_at: '2026-10-18T10:00:00.000Z',
  };
}

describe('automationRunAtom', () => {
  it('shows a finished run', () => {
    expect(automationRunAtom(event({ name: 'Evening', outcome: 'succeeded' }))).toMatchObject({
      name: 'Evening',
      what: 'Ran',
      failed: false,
      tone: 'variant',
      category: 'automations',
      group: 'automation:Evening',
    });
  });

  it('shows failed and interrupted runs as not finished', () => {
    for (const outcome of ['failed', 'interrupted']) {
      expect(automationRunAtom(event({ name: 'Evening', outcome }))).toMatchObject({
        what: 'Didn’t finish',
        failed: true,
        tone: 'critical',
        icon: 'alert',
      });
    }
  });

  it('words stopped and skipped runs without calling them failures', () => {
    expect(automationRunAtom(event({ name: 'A', outcome: 'cancelled' }))).toMatchObject({
      what: 'Stopped',
      failed: false,
    });
    expect(automationRunAtom(event({ name: 'A', outcome: 'ignored' }))).toMatchObject({
      what: 'Skipped',
      failed: false,
    });
  });

  it('shows the message of a feed note', () => {
    expect(automationRunAtom(event({ name: 'Washer', message: 'Wash is done' })).what).toBe(
      'Wash is done',
    );
  });

  it('falls back when the details cannot be read', () => {
    expect(automationRunAtom(event({ nothing: 1 }))).toMatchObject({
      name: 'An automation',
      what: 'Ran',
      group: 'automation:00000000-0000-4000-8000-000000000001',
    });
  });
});
