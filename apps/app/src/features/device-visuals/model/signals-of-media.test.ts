import { describe, it } from 'vitest';
import type { VisualState } from '../types';
import { ON, expectSignals, sample } from './signals-of-fixtures';

type Phone = NonNullable<VisualState['phone']>;

const PHONE: Phone = {
  level: null,
  charging: false,
  ringer: null,
  ringing: false,
  torch: false,
  screenOn: false,
  playing: false,
  notifications: 0,
  inCall: false,
  hot: false,
  fold: null,
};

function phone(changes: Partial<Phone>): VisualState {
  return sample({ phone: { ...PHONE, ...changes } });
}

describe('television', () => {
  it('shows a picture with its source', () => {
    expectSignals('television', sample({ source: 'HDMI 2' }), {
      ...ON,
      screenOn: true,
      playing: true,
      mode: 'HDMI 2',
    });
  });

  it('is dark when off', () => {
    expectSignals('television', sample({ power: 'off', source: '' }), {
      power: false,
      online: true,
      screenOn: false,
      playing: false,
    });
  });

  it('is unknown', () => {
    expectSignals('television', sample({ power: 'unknown' }), { online: true });
  });
});

describe('speaker', () => {
  it('plays at its volume', () => {
    expectSignals('speaker', sample({ level: 0.35 }), { ...ON, volume: 0.35, playing: true });
  });

  it('is off', () => {
    expectSignals('speaker', sample({ power: 'off', level: 0.6 }), {
      power: false,
      online: true,
      volume: 0.6,
      playing: false,
    });
  });

  it('does not play while offline', () => {
    expectSignals('speaker', sample({ online: false }), {
      power: false,
      online: false,
      volume: 0.6,
      playing: false,
    });
  });
});

describe('scale', () => {
  it('shows a reading', () => {
    expectSignals(
      'scale',
      sample({ reading: { text: '71.2', unit: 'kg', at: '2026-10-25T06:00:00Z' }, battery: 90 }),
      { ...ON, phase: 'reading', battery: 0.9 },
    );
  });

  it('waits', () => {
    expectSignals('scale', sample({}), { ...ON, phase: 'idle' });
  });
});

describe('wearable', () => {
  it('shows the step ring', () => {
    expectSignals('wearable', sample({ progress: 0.42, battery: 55 }), {
      ...ON,
      progress: 0.42,
      phase: 'idle',
      battery: 0.55,
    });
  });

  it('syncs', () => {
    expectSignals('wearable', sample({ syncing: true, progress: 1.4 }), {
      ...ON,
      progress: 1,
      phase: 'syncing',
    });
  });
});

describe('phone', () => {
  it('rings with the screen on', () => {
    expectSignals('phone', phone({ ringing: true, screenOn: true, level: 64, ringer: 'normal' }), {
      ...ON,
      battery: 0.64,
      charging: false,
      ringing: true,
      screenOn: true,
      playing: false,
      lamp: false,
      mode: 'normal',
    });
  });

  it('charges folded with the torch on', () => {
    expectSignals('phone', phone({ charging: true, torch: true, fold: 'folded', level: 12 }), {
      ...ON,
      battery: 0.12,
      charging: true,
      ringing: false,
      screenOn: false,
      playing: false,
      lamp: true,
      fold: 0,
    });
  });

  it('plays with the fold open', () => {
    expectSignals('phone', phone({ playing: true, fold: 'open', ringer: 'dnd' }), {
      ...ON,
      charging: false,
      ringing: false,
      screenOn: false,
      playing: true,
      lamp: false,
      fold: 1,
      mode: 'dnd',
    });
  });

  it('works before its facts arrive', () => {
    expectSignals('phone', sample({}), ON);
  });
});
