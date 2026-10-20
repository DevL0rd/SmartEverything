import { TREADMILL_POLICY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  lightStripSubtitle,
  lubricationLine,
  minimumSpeedLine,
  padLayoutOf,
  remoteInclineConfirm,
  remoteSpeedRange,
  remoteStartConfirm,
  supplementFacts,
} from './settings-model';

describe('turning remote start on', () => {
  it('says who can then start it, the speed cap and that stop always works', () => {
    const owner = remoteStartConfirm(TREADMILL_POLICY.parse({}));
    expect(owner.title).toBe('Allow remote start?');
    expect(owner.body).toContain('the owner can start the belt');
    expect(owner.body).toContain('capped at 6.0 km/h');
    expect(owner.body).toContain('Stop and pause always work for everyone');
    const both = remoteStartConfirm(
      TREADMILL_POLICY.parse({ remoteWho: 'owner_and_walker', remoteMaxKmh: 4.5 }),
    );
    expect(both.body).toContain('the owner and the person walking can start the belt');
    expect(both.body).toContain('capped at 4.5 km/h');
  });
});

describe('what the belt page can change', () => {
  it('has a full panel on the WiLink family, a short one with sounds on the supplement family', () => {
    expect(padLayoutOf('wilink')).toBe('full');
    expect(padLayoutOf('ftms_supplement')).toBe('supplement');
    expect(padLayoutOf('ftms')).toBe('none');
    expect(padLayoutOf('ftms_odm')).toBe('none');
  });

  it('lists the supplement facts the app can read but not change', () => {
    expect(
      supplementFacts({
        autoStopSeconds: 0,
        light: true,
        ledColor: 3,
        paceDisplay: false,
        units: 'mi',
      }),
    ).toEqual([
      { label: 'Auto-stop when you step off', value: 'Off' },
      { label: 'LED colour', value: 'Preset 3' },
      { label: 'Show pace', value: 'Off' },
      { label: 'Units on the belt', value: 'Miles' },
    ]);
    expect(supplementFacts({})).toEqual([]);
    expect(supplementFacts({ autoStopSeconds: 20 })[0]?.value).toBe('20 s');
  });

  it('tells when the belt needs oil next', () => {
    expect(lubricationLine({ dueInDays: null, beltKmSince: 0 })).toBe(
      'Not marked yet · 0.0 km since the last oiling',
    );
    expect(lubricationLine({ dueInDays: 0, beltKmSince: 120.46 })).toBe(
      'Due now · 120.5 km since the last oiling',
    );
    expect(lubricationLine({ dueInDays: 12, beltKmSince: 3 })).toBe(
      'Next in 12 days · 3.0 km since the last oiling',
    );
  });

  it('starts the speed sliders at the belt minimum, never a fixed 0.8', () => {
    expect(remoteSpeedRange({ minKmh: 1, maxKmh: 6, stepKmh: 0.1 })).toEqual({
      min: 1,
      max: 6,
      step: 0.1,
    });
    expect(minimumSpeedLine(1)).toBe('Lowest value is the belt’s minimum, 1.0 km/h.');
  });

  it('asks before remote incline is allowed and names the cap on the chosen scale', () => {
    const levels = remoteInclineConfirm(5, 'levels');
    expect(levels.title).toBe('Allow remote incline?');
    expect(levels.body).toContain('up to 5 levels');
    expect(levels.body).toContain('Stop always works');
    expect(remoteInclineConfirm(5, 'unconfirmed').body).toContain('5 on the belt’s scale');
  });

  it('shows the light strip as waiting until the belt reports it', () => {
    expect(lightStripSubtitle(undefined)).toContain('Waiting');
    expect(lightStripSubtitle(false)).toContain('refused');
  });
});
