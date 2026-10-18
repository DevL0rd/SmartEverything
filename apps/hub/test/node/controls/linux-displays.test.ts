import type { DisplayState } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { BOTH, ONLY_DP, displayRig as rig } from './display-rig';
import { settle } from './support';

describe('the keep-or-revert protocol (fake kscreen-doctor, no real display is touched)', () => {
  it('applies a risky change, starts a 15 s timer and shows the pending revert', async () => {
    const test = rig(BOTH);
    const state = await test.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    expect(test.layout()[1]?.enabled).toBe(false);
    expect(state.pendingRevert).toEqual({
      token: 'token-1',
      startedAt: '2026-10-17T10:00:00.000Z',
      revertsAt: '2026-10-17T10:00:15.000Z',
      summary: 'Turned off eDP-2',
    });
    expect(test.clock.delays).toEqual([15000]);
    expect(test.notices).toMatchObject([
      { summary: 'Turned off eDP-2', seconds: 15, closed: false },
    ]);
  });

  it('puts the old layout back when the timer runs out, tells watchers and closes the notice', async () => {
    const test = rig(BOTH);
    const seen: DisplayState[] = [];
    test.displays.watch((state) => seen.push(state));
    await settle();
    test.clock.advance();
    await settle();
    seen.length = 0;
    await test.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    test.clock.advance();
    await settle();
    expect(test.layout()[1]?.enabled).toBe(true);
    expect(test.notices[0]?.closed).toBe(true);
    const last = seen.at(-1);
    expect(last?.pendingRevert).toBeNull();
    expect(last?.outputs[1]?.enabled).toBe(true);
    expect(
      test.calls.some((call) =>
        call.startsWith('kscreen-doctor output.DP-3.enable output.DP-3.mode'),
      ),
    ).toBe(true);
  });

  it('keeps the change when the person keeps it and cancels the timer', async () => {
    const test = rig(BOTH);
    await test.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    const state = await test.displays.confirm('token-1', true);
    expect(state.pendingRevert).toBeNull();
    expect(test.layout()[1]?.enabled).toBe(false);
    expect(test.clock.pending()).toBe(0);
    expect(test.notices[0]?.closed).toBe(true);
  });

  it('reverts at once when the person declines, and the desktop notice can answer too', async () => {
    const declined = rig(BOTH);
    await declined.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    await declined.displays.confirm('token-1', false);
    expect(declined.layout()[1]?.enabled).toBe(true);

    const noticed = rig(BOTH);
    await noticed.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    noticed.notices[0]?.answer('revert');
    await settle();
    expect(noticed.layout()[1]?.enabled).toBe(true);
    expect(noticed.failures).toEqual([]);
  });

  it('refuses a wrong token and a second risky change, but lets brightness through', async () => {
    const test = rig(BOTH);
    await test.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    await expect(test.displays.confirm('other', true)).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      test.displays.change({ action: 'scale', output: 'DP-3', percent: 150 }, true),
    ).rejects.toMatchObject({
      code: 'blocked',
      message: 'Keep or revert the last display change first.',
    });
    await expect(test.displays.confirm('token-1', true)).resolves.toBeDefined();
    await expect(test.displays.confirm('token-1', true)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses to turn off the only active display without the protocol, and allows it with it', async () => {
    const test = rig(ONLY_DP);
    await expect(
      test.displays.change({ action: 'disable', output: 'DP-3' }, false),
    ).rejects.toMatchObject({
      code: 'blocked',
    });
    expect(test.layout()[0]?.enabled).toBe(true);
    const state = await test.displays.change({ action: 'disable', output: 'DP-3' }, true);
    expect(state.pendingRevert).not.toBeNull();
    test.clock.advance();
    await settle();
    expect(test.layout()[0]?.enabled).toBe(true);
  });

  it('does not use the protocol for changes that are safe', async () => {
    const test = rig(BOTH);
    const state = await test.displays.change(
      { action: 'brightness', level: 40, output: 'DP-3' },
      true,
    );
    expect(state.pendingRevert).toBeNull();
    expect(test.clock.pending()).toBe(0);
    expect(test.notices).toEqual([]);
    expect(test.calls).toContain('kscreen-doctor output.DP-3.brightness.40');
  });

  it('keeps the revert timer even when the desktop notification cannot be shown', async () => {
    const test = rig(BOTH, { noticeFails: true });
    const state = await test.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    expect(state.pendingRevert).not.toBeNull();
    expect(test.failures).toHaveLength(1);
    test.clock.advance();
    await settle();
    expect(test.layout()[1]?.enabled).toBe(true);
  });

  it('reverts a pending change when the agent stops', async () => {
    const test = rig(BOTH);
    await test.displays.change({ action: 'disable', output: 'eDP-2' }, true);
    await test.displays.stop();
    expect(test.layout()[1]?.enabled).toBe(true);
    expect(test.clock.pending()).toBe(0);
    expect(test.notices[0]?.closed).toBe(true);
  });
});

describe('capabilities and fallbacks', () => {
  it('derives features from what the outputs report', async () => {
    await expect(rig(BOTH).displays.features()).resolves.toEqual([
      'displays',
      'display_modes',
      'display_enable',
      'brightness',
      'hdr',
      'vrr',
    ]);
    await expect(rig([{ name: 'DP-1', enabled: true }]).displays.features()).resolves.toEqual([
      'displays',
      'display_modes',
      'display_enable',
    ]);
  });

  it('is unsupported with a plain answer when no screen tool exists', async () => {
    const test = rig(BOTH, { programs: [] });
    await expect(test.displays.features()).resolves.toEqual([]);
    await expect(test.displays.read()).rejects.toMatchObject({
      code: 'not_supported',
      message: "Screen control isn't available on this computer yet.",
    });
    await expect(
      test.displays.change({ action: 'enable', output: 'x' }, false),
    ).rejects.toMatchObject({
      code: 'not_supported',
    });
  });

  it('does not pick kscreen-doctor outside KDE and has no tool for a plain X11 session', async () => {
    const test = rig(BOTH, { environment: { kde: false, wayland: false, x11: true } });
    await expect(test.displays.features()).resolves.toEqual([]);
  });

  it('says so for identify, mirroring and night light without KWin', async () => {
    const test = rig(BOTH);
    await expect(test.displays.change({ action: 'identify' }, false)).rejects.toMatchObject({
      code: 'not_supported',
    });
    await expect(
      test.displays.change({ action: 'mirror', output: 'DP-3', of: 'eDP-2' }, false),
    ).rejects.toMatchObject({
      code: 'not_supported',
    });
    await expect(
      test.displays.change({ action: 'night_light', mode: 'on' }, false),
    ).rejects.toMatchObject({
      code: 'not_supported',
    });
    const state = await test.displays.read();
    expect(state.nightLight.supported).toBe(false);
  });
});

describe('watching displays', () => {
  it('listens to drm events only while watched and emits only real changes', async () => {
    const test = rig(BOTH);
    const seen: DisplayState[] = [];
    const stop = test.displays.watch((state) => seen.push(state));
    expect(test.lines.started[0]).toMatchObject({ program: 'udevadm' });
    test.clock.advance();
    await settle();
    expect(seen).toHaveLength(1);
    test.lines.emit('UDEV  [12.5] change   /devices/pci0000:00/0000:00:01.0/drm/card1 (drm)');
    test.clock.advance();
    await settle();
    expect(seen).toHaveLength(1);
    test.lines.emit('UDEV  [13.5] change   /devices/pci0000:00/sound/card0 (sound)');
    expect(test.clock.pending()).toBe(0);
    stop();
    expect(test.lines.stopped).toHaveLength(1);
  });
});
