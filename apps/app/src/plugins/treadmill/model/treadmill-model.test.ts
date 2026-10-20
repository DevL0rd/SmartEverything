import { describe, expect, it } from 'vitest';
import { stateViewFixture } from './fixtures';
import {
  chartTopKmh,
  clockText,
  controlsOf,
  distanceFigure,
  linkLine,
  movingZone,
  stateTone,
  motionOf,
  paceText,
  signalWord,
  speedCeiling,
  steppedSpeed,
  usableChips,
  zoneBands,
} from './treadmill-model';

const view = stateViewFixture;

describe('treadmill figures', () => {
  it('writes the session clock as minutes and seconds, and hours when needed', () => {
    expect(clockText(0)).toBe('00:00');
    expect(clockText(65)).toBe('01:05');
    expect(clockText(3725)).toBe('1:02:05');
    expect(clockText(-4)).toBe('00:00');
  });

  it('writes distance in kilometres and pace per kilometre', () => {
    expect(distanceFigure(1234)).toEqual({ value: '1.23', unit: 'km' });
    expect(paceText(6)).toBe('10:00 /km');
    expect(paceText(0)).toBe('–');
  });

  it('puts the signal into words', () => {
    expect(signalWord(-50)).toBe('Strong');
    expect(signalWord(-70)).toBe('Good');
    expect(signalWord(-90)).toBe('Weak');
    expect(signalWord(null)).toBe('Unknown');
  });

  it('colours the gauge by walking, jogging and running up to the belt maximum', () => {
    expect(zoneBands(15).map((band) => band.upTo)).toEqual([6, 8, 15]);
  });
});

describe('speed limits', () => {
  it('stops at the pad limit, and at the remote cap for a remote caller', () => {
    expect(speedCeiling(view({ cap: 12 }), false)).toBe(12);
    expect(speedCeiling(view({ cap: 12, remoteCap: 6 }), true)).toBe(6);
    expect(speedCeiling(view({}), true)).toBe(15);
    expect(speedCeiling(view({ remoteCap: 20 }), true)).toBe(15);
  });

  it('steps by a tenth and stays inside the limits', () => {
    const limits = { min: 0.8, ceiling: 6 };
    expect(steppedSpeed(3, 1, limits)).toBe(3.1);
    expect(steppedSpeed(3, -1, limits)).toBe(2.9);
    expect(steppedSpeed(6, 1, limits)).toBe(6);
    expect(steppedSpeed(0.8, -1, limits)).toBe(0.8);
  });

  it('offers the quick speeds that fit', () => {
    expect(usableChips({ min: 0.8, ceiling: 15 })).toEqual([3, 4.5, 6, 8]);
    expect(usableChips({ min: 0.8, ceiling: 4 })).toEqual([3]);
  });
});

describe('what the person may press', () => {
  it('lets the holder phone start an idle belt and stop a running one', () => {
    const idle = controlsOf(view({}), 'idle');
    expect(idle.start).toEqual({ enabled: true, reason: null });
    expect(idle.stop).toBe(false);
    expect(controlsOf(view({}), 'running')).toMatchObject({
      pause: true,
      stop: true,
      speed: true,
      mode: { enabled: false, reason: 'Change mode after stopping.' },
    });
    expect(controlsOf(view({}), 'paused')).toMatchObject({
      resume: true,
      stop: true,
      speed: false,
    });
  });

  it('keeps the start off, with the hub’s reason, on a phone that does not hold the link', () => {
    const blocked = controlsOf(
      view({ allowed: false, reason: 'Start from the phone that holds the link.' }),
      'idle',
    );
    expect(blocked.start).toEqual({
      enabled: false,
      reason: 'Start from the phone that holds the link.',
    });
    expect(controlsOf(view({ allowed: false, reason: 'x' }), 'running')).toMatchObject({
      stop: true,
      pause: false,
      resume: false,
    });
  });

  it('keeps everything but nothing running off when the link is down, and when child lock is on', () => {
    const lost = controlsOf(view({ phase: 'lost' }), 'running');
    expect(lost).toMatchObject({ pause: false, stop: false, speed: false });
    expect(controlsOf(view({ phase: 'lost' }), 'idle').start.reason).toContain('not linked');
    const locked = controlsOf(view({ childLock: true }), 'idle').start;
    expect(locked.enabled).toBe(false);
    expect(locked.reason).toContain('Child lock');
  });

  it('knows which belt states move', () => {
    expect(motionOf('running')).toBe('moving');
    expect(motionOf('paused')).toBe('moving');
    expect(motionOf('safety_stop')).toBe('still');
  });
});

describe('the lines under the belt', () => {
  it('names who holds the link and how well it is heard', () => {
    expect(linkLine(view({}).link)).toBe('Linked through this phone · Strong signal');
    const theirs = view({});
    expect(linkLine({ ...theirs.link, holderIsYou: false, holderName: 'Alex’s Pixel' })).toBe(
      'Linked through Alex’s Pixel · Strong signal',
    );
    expect(linkLine(view({ phase: 'busy' }).link)).toBe('Held by another app');
    expect(linkLine({ ...theirs.link, phase: 'searching', holderName: null })).toBe(
      'Looking for the treadmill',
    );
    expect(linkLine(view({ phase: 'lost', holderIsYou: false }).link)).toBe(
      'Link lost · held by Pixel',
    );
  });

  it('gives danger states a critical tone and a running belt a positive one', () => {
    expect(stateTone('running')).toBe('positive');
    expect(stateTone('paused')).toBe('warning');
    expect(stateTone('fault')).toBe('critical');
    expect(stateTone('safety_stop')).toBe('critical');
    expect(stateTone('idle')).toBe('neutral');
  });
});

describe('speed zone and chart scale', () => {
  it('names no zone while the belt stands still', () => {
    expect(movingZone(0)).toBeNull();
    expect(movingZone(5.4)).toBe('walk');
    expect(movingZone(7)).toBe('jog');
  });

  it('scales the speed chart to the walk, not to the top speed of the belt', () => {
    expect(chartTopKmh(5.4, 15)).toBe(9);
    expect(chartTopKmh(2, 15)).toBe(6);
    expect(chartTopKmh(14.5, 15)).toBe(15);
  });
});
