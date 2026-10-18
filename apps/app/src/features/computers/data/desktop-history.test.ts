import { describe, expect, it } from 'vitest';
import { desktopHistoryOf, type SessionRead } from './desktop-history';

const TARGET = { deviceId: 'd1', name: 'Office' };
const NOTHING: SessionRead = { sessions: undefined, failure: null };

describe('desktopHistoryOf', () => {
  it('waits while the computer status is unknown', () => {
    expect(desktopHistoryOf(TARGET, undefined, NOTHING).history).toBe('loading');
  });

  it('reports history off, even when the computer is offline, so the switch can be offered', () => {
    expect(desktopHistoryOf(TARGET, { online: false, historyOn: false }, NOTHING).history).toBe(
      'off',
    );
  });

  it('reports an offline computer with history on without listing anything', () => {
    expect(desktopHistoryOf(TARGET, { online: false, historyOn: true }, NOTHING).history).toBe(
      'offline',
    );
  });

  it('waits for the session list once history is on and the computer is online', () => {
    expect(desktopHistoryOf(TARGET, { online: true, historyOn: true }, NOTHING).history).toBe(
      'loading',
    );
  });

  it('reports a failed session read with its reason instead of waiting forever', () => {
    expect(
      desktopHistoryOf(
        TARGET,
        { online: true, historyOn: true },
        { sessions: undefined, failure: 'Claude session control is disabled on this computer.' },
      ),
    ).toEqual({
      ...TARGET,
      history: 'failed',
      reason: 'Claude session control is disabled on this computer.',
    });
  });

  it('keeps showing the sessions already read when a refresh fails', () => {
    expect(
      desktopHistoryOf(
        TARGET,
        { online: true, historyOn: true },
        { sessions: [], failure: 'timeout' },
      ).history,
    ).toBe('ready');
  });

  it('carries the sessions when they are read', () => {
    expect(
      desktopHistoryOf(TARGET, { online: true, historyOn: true }, { sessions: [], failure: null }),
    ).toEqual({
      ...TARGET,
      history: 'ready',
      sessions: [],
    });
  });
});
