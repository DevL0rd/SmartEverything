import type { TelevisionSettingsRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { televisionFixture } from '../../../store/television-fixture';
import { televisionLine, stageText, volumeText } from './state-line';
import { canUseNumberPad, channelSend } from './numpad';
import { televisionView } from './view';

const NOT_TURNING = { turningOn: false, settings: null };

const DIRECT: TelevisionSettingsRow = {
  device_id: 'livingRoom-id',
  direct_link: true,
  input_names: { HDMI1: 'Console' },
};

function view(
  name: 'livingRoom' | 'bedroom' | 'monitor',
  online: boolean,
  changes: Parameters<typeof televisionFixture>[2] = {},
  options: { readonly turningOn?: boolean; readonly settings?: TelevisionSettingsRow } = {},
): ReturnType<typeof televisionView> {
  const { device, values } = televisionFixture(name, online, changes);
  return televisionView(device, values, {
    turningOn: options.turningOn ?? false,
    settings: options.settings ?? null,
  });
}

describe('television view', () => {
  it('shows a sleeping TV that can be woken as standby, not offline', () => {
    const asleep = view('bedroom', false);
    expect(asleep.mode).toBe('standby');
    expect(televisionLine(asleep)).toBe('Off');
    expect(asleep.locks.power).toBeUndefined();
  });

  it('shows a TV that cannot be woken as off with Power disabled and the reason', () => {
    const stuck = view('livingRoom', false);
    expect(stuck.mode).toBe('off_unreachable');
    expect(stuck.locks.power).toBe('cannot_wake');
  });

  it('shows Turning on while a power-on command is pending', () => {
    const waking = view('bedroom', false, {}, { turningOn: true });
    expect(waking.mode).toBe('turning_on');
    expect(televisionLine(waking)).toBe('Turning on…');
  });

  it('shows an updating TV with every key locked for the update', () => {
    const updating = view('livingRoom', true, {
      power: true,
      'raw:samsungvd.thing_status.status': 'AgentUpdate Started',
    });
    expect(updating.mode).toBe('updating');
    expect(updating.locks.vol_up).toBe('updating');
    expect(updating.locks.power).toBe('updating');
    expect(televisionLine(updating)).toBe('Updating');
  });

  it('names what is playing and the volume while the TV is on', () => {
    const playing = view('livingRoom', true, { power: true, volume: 17, mute: false });
    expect(playing.mode).toBe('on');
    expect(televisionLine(playing)).toBe(`${playing.watching.label} · Vol 17`);
    expect(volumeText(playing.volume)).toBe('17');
  });

  it('says Muted instead of the level when muted', () => {
    const muted = view('livingRoom', true, { power: true, volume: 17, mute: true });
    expect(televisionLine(muted)).toMatch(/· Muted$/);
    expect(stageText(muted).meta).toBe('Muted');
  });

  it('lets the cloud send the pad, volume, mute and playback and locks the rest with a reason', () => {
    const on = view('livingRoom', true, { power: true, volume: 17 });
    for (const key of [
      'up',
      'ok',
      'back',
      'home',
      'vol_up',
      'vol_down',
      'mute',
      'ch_up',
    ] as const) {
      expect(on.locks[key]).toBeUndefined();
    }
    expect(on.locks.red).toBe('needs_direct');
    expect(on.locks.n5).toBe('needs_direct');
  });

  it('repeats volume, channel and arrow keys at the cloud rate and nothing else', () => {
    const on = view('livingRoom', true, { power: true });
    expect(on.rates.vol_up).toBe(600);
    expect(on.rates.left).toBe(600);
    expect(on.rates.mute).toBeUndefined();
    expect(on.rates.ok).toBeUndefined();
  });

  it('locks every key but power when the TV is off, and gives no repeat rate', () => {
    const asleep = view('bedroom', false);
    expect(asleep.locks.vol_up).toBe('tv_off');
    expect(asleep.rates.vol_up).toBeUndefined();
  });

  it('hides the channel keys on a monitor', () => {
    const monitor = view('monitor', true, { power: true });
    expect(monitor.category).toBe('monitor');
    expect(monitor.locks.ch_up).toBe('not_on_this_tv');
  });

  it('marks a volume older than the last power-on as a last known level', () => {
    const { device, values } = televisionFixture('livingRoom', true, { power: true, volume: 9 });
    const stale = televisionView(
      device,
      {
        ...values,
        volume: { value: 9, observedAt: '2026-10-18T08:00:00.000Z' },
        power: { value: true, observedAt: '2026-10-18T09:00:00.000Z' },
      },
      NOT_TURNING,
    );
    expect(stale.volume.stale).toBe(true);
    expect(volumeText(stale.volume)).toBe('≈9');
  });

  it('describes the stage for each mode', () => {
    expect(stageText(view('bedroom', false)).title).toBe('Off');
    expect(stageText(view('livingRoom', false)).meta).toBe("Can't be turned on from here");
    expect(stageText(view('bedroom', false, {}, { turningOn: true })).title).toBe('Turning on…');
  });
});

describe('television number pad', () => {
  it('is unavailable while the TV is off', () => {
    expect(canUseNumberPad(view('bedroom', false))).toBe(false);
  });

  it('goes to a channel through the channel setting when digit keys are not available', () => {
    const on = view('livingRoom', true, { power: true });
    expect(canUseNumberPad(on)).toBe(true);
    expect(channelSend(on, '27')).toEqual({ kind: 'channel', channel: 27 });
  });

  it('refuses a channel outside the range the TV reports', () => {
    const on = view('livingRoom', true, { power: true });
    expect(on.channelRange).toEqual({ min: 1, max: 9999 });
    expect(channelSend(on, '0')).toBeNull();
    expect(channelSend(on, '1')).toEqual({ kind: 'channel', channel: 1 });
  });

  it('sends nothing for an empty entry', () => {
    expect(channelSend(view('livingRoom', true, { power: true }), '')).toBeNull();
  });
});

describe('television number pad over a direct link', () => {
  it('presses each digit then OK when digit keys are available', () => {
    const on = view('livingRoom', true, { power: true });
    const direct = { ...on, locks: {} };
    expect(channelSend(direct, '27')).toEqual({ kind: 'keys', keys: ['n2', 'n7', 'ok'] });
  });

  it('cannot go to a channel with no digit keys and no channel setting', () => {
    const on = view('livingRoom', true, { power: true });
    expect(channelSend({ ...on, canSetChannel: false }, '27')).toBeNull();
  });

  it('unlocks the number and colour keys on a television with a direct link', () => {
    const linked = view('livingRoom', true, { power: true }, { settings: DIRECT });
    for (const key of ['n0', 'n5', 'n9', 'red', 'green', 'yellow', 'blue'] as const) {
      expect(linked.locks[key]).toBeUndefined();
    }
    expect(view('livingRoom', true, { power: true }).locks.n5).toBe('needs_direct');
  });

  it('shows a sleeping television with a direct link as standby and lets it be turned on', () => {
    const asleep = view('livingRoom', false, {}, { settings: DIRECT });
    expect(asleep.mode).toBe('standby');
    expect(asleep.locks.power).toBeUndefined();
  });

  it('shows the names given to inputs and keeps the default for the others', () => {
    const named = view(
      'livingRoom',
      true,
      { power: true, input_source: 'HDMI1', 'raw:tv_channel.tv_channel_name': '' },
      { settings: DIRECT },
    );
    expect(named.inputs.find((input) => input.id === 'HDMI1')).toMatchObject({
      label: 'Console',
      name: 'Console',
    });
    expect(named.watching).toEqual({ kind: 'input', label: 'Console' });
    const other = named.inputs.find((input) => input.id !== 'HDMI1');
    expect(other?.name).toBeNull();
  });
});
