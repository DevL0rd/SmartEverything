import { COMPUTER_UNIT, HUB_UNIT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { parseStartupJournal } from '../src/service/startup-journal';

describe('Linux service startup journal', () => {
  it('keeps prior error evidence from its own unit and advances to the last prior entry', () => {
    const unit = HUB_UNIT;
    const invocation = 'a'.repeat(32);
    const entry = {
      __CURSOR: 's=one',
      __REALTIME_TIMESTAMP: '1760000000000000',
      _SYSTEMD_USER_UNIT: unit,
      _SYSTEMD_INVOCATION_ID: 'b'.repeat(32),
      PRIORITY: '6',
      MESSAGE: '[08:01:02]-[EXCEPTION]-[hub.service]: service.start_failed',
    };
    const rows = [
      entry,
      { ...entry, __CURSOR: 's=two', MESSAGE: 'A normal message' },
      { ...entry, __CURSOR: 's=three', _SYSTEMD_INVOCATION_ID: invocation },
      { ...entry, __CURSOR: 's=four', _SYSTEMD_USER_UNIT: COMPUTER_UNIT },
    ];
    const batch = parseStartupJournal(
      rows.map((row) => JSON.stringify(row)).join('\n'),
      unit,
      invocation,
    );
    expect(batch?.cursor).toBe('s=two');
    expect(batch?.records).toHaveLength(1);
    expect(batch?.records[0]).toMatchObject({
      scope: 'hub.startup-journal',
      event: 'service.previous_error',
      failure: { message: entry.MESSAGE },
    });
  });
});
