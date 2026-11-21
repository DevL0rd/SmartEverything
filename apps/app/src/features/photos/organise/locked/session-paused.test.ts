import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTICES, pausedProbes } from '../../../../test-support/paused-probe';
import { forgetLockedSession, openLockedSession, useLockedSession } from './session';

afterEach(() => {
  forgetLockedSession();
});

const { mount, pausedScreen, resume } = pausedProbes();

describe('the locked session on a paused screen', () => {
  it('holds locked session notices while paused and shows the latest session on resume', () => {
    const pause = pausedScreen();
    const probe = mount(pause, useLockedSession);
    const mounted = probe.renders();
    for (let notice = 0; notice < NOTICES; notice += 1) {
      act(() => {
        if (notice % 2 === 0) {
          openLockedSession({ token: `t${String(notice)}`, expiresAt: '2099-01-01T00:00:00.000Z' });
        } else {
          forgetLockedSession();
        }
      });
    }
    expect(probe.renders()).toBe(mounted);
    act(() => {
      openLockedSession({ token: 'last', expiresAt: '2099-01-01T00:00:00.000Z' });
    });
    resume(pause);
    expect(probe.renders()).toBe(mounted + 1);
    expect(probe.value()?.token).toBe('last');
  });
});
