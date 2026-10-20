import { describe, expect, it } from 'vitest';
import type { EventRow } from '@smarteverything/domain';
import { eventAtom } from './atoms';

function runEvent(details: EventRow['details']): EventRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    device_id: null,
    kind: 'automation_run',
    occurred_at: '2026-10-18T11:00:00.000Z',
    details,
    acknowledged_at: null,
    created_at: '2026-10-18T11:00:00.000Z',
  };
}

describe('automation run lines', () => {
  it('reads a finished run as ran and keeps it out of the failures', () => {
    const atom = eventAtom(runEvent({ name: 'Evening', outcome: 'succeeded' }), new Map());
    expect(atom).toMatchObject({
      name: 'Evening',
      what: 'Ran',
      failed: false,
      category: 'automations',
    });
  });

  it('marks failed and interrupted runs as not finished', () => {
    for (const outcome of ['failed', 'interrupted']) {
      const atom = eventAtom(runEvent({ name: 'Evening', outcome }), new Map());
      expect(atom).toMatchObject({ what: 'Didn’t finish', failed: true, tone: 'critical' });
    }
  });

  it('says stopped for a cancelled run and skipped for an ignored one', () => {
    expect(eventAtom(runEvent({ name: 'A', outcome: 'cancelled' }), new Map())?.what).toBe(
      'Stopped',
    );
    expect(eventAtom(runEvent({ name: 'A', outcome: 'ignored' }), new Map())?.what).toBe('Skipped');
  });

  it('shows the feed note a notify step wrote', () => {
    const atom = eventAtom(
      runEvent({ name: 'Doorbell', message: 'Someone is at the door' }),
      new Map(),
    );
    expect(atom?.what).toBe('Someone is at the door');
  });
});
