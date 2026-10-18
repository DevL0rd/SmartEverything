import { describe, expect, it } from 'vitest';
import type { AccessAuditRow } from '@smarteverything/domain';
import { auditSubtitle, auditViews } from './audit';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');

const ROW: AccessAuditRow = {
  id: '00000000-0000-4000-8000-0000000000a1',
  profile_id: '00000000-0000-4000-8000-000000000001',
  client_id: '00000000-0000-4000-8000-0000000000c1',
  kind: 'refused_condition',
  detail: 'the person is outside the hours they may use the home',
  at: '2026-10-18T11:30:00.000Z',
};

describe('auditViews', () => {
  it('names the person and the device and says how long ago it happened', () => {
    const [view] = auditViews(
      [ROW],
      new Map([[ROW.profile_id ?? '', 'Mia']]),
      new Map([[ROW.client_id ?? '', 'Mia phone']]),
      NOW,
    );
    expect(view?.look.title).toBe('Refused: outside the conditions');
    expect(view === undefined ? '' : auditSubtitle(view)).toBe('Mia · Mia phone · 30 min ago');
  });

  it('leaves out a person or device that is gone', () => {
    const [view] = auditViews([ROW], new Map(), new Map(), NOW);
    expect(view === undefined ? '' : auditSubtitle(view)).toBe('30 min ago');
  });
});
