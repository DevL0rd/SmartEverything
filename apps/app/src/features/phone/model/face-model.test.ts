import { describe, expect, it } from 'vitest';
import { observed } from '../card/phone-face-fixtures';
import {
  accessOf,
  doingSince,
  doingWordOf,
  faceReadingsOf,
  faceWordOf,
  featureState,
  featuresOf,
  spokenPhone,
  type FaceReadings,
  type PhoneViewer,
} from './face-model';

const PERSON = '00000000-0000-4000-8000-0000000000b1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const DEVICE = '00000000-0000-4000-8000-0000000000a1';

const VIEWER: PhoneViewer = { profileId: PERSON, role: 'member', localDeviceId: null };

function readings(
  values: Record<string, string | number | boolean | null>,
  online = true,
): FaceReadings {
  return faceReadingsOf(observed(values), online);
}

describe('who a phone face is for', () => {
  const phone = { id: DEVICE, details: { profileId: PERSON } };

  it('lets the phone person act, ring and open a link when the app is not on the phone', () => {
    expect(accessOf(phone, VIEWER).view).toMatchObject({
      tier: 'person',
      own: true,
      here: false,
      canAct: true,
      canRing: true,
    });
  });

  it('hides Ring on the phone the app runs on', () => {
    const here = accessOf(phone, { ...VIEWER, localDeviceId: DEVICE });
    expect(here.view).toMatchObject({ here: true, canRing: false, canAct: true });
  });

  it('lets an owner act on someone else’s phone and a member only look', () => {
    const other = { id: DEVICE, details: { profileId: OTHER } };
    expect(accessOf(other, { ...VIEWER, role: 'owner' }).view).toMatchObject({
      tier: 'owner',
      own: false,
      canAct: true,
    });
    expect(accessOf(other, VIEWER).view).toMatchObject({ tier: 'member', canAct: false });
  });

  it('reads what the phone supports and says unknown for what it never reported', () => {
    const features = featuresOf({
      phoneFeatures: [
        {
          feature: 'dnd',
          state: 'needs_permission',
          permission: 'android_dnd',
          reason: 'Allow it',
        },
        { feature: 'fold', state: 'ready' },
        { feature: 'torch', state: 'unsupported', reason: 'No flashlight' },
      ],
    });
    expect(featureState(features, 'dnd')).toBe('needs_permission');
    expect(featureState(features, 'usage')).toBe('unknown');
    const access = accessOf({ id: DEVICE, details: { phoneFeatures: features } }, VIEWER);
    expect(access).toMatchObject({ dnd: 'needs_permission', torch: 'unsupported', fold: true });
  });

  it('treats a malformed feature list as nothing reported', () => {
    expect(featuresOf({ phoneFeatures: 'broken' })).toEqual([]);
  });
});

describe('the words on a phone face', () => {
  it.each([
    [{ battery: 80, charging: true }, 'Charging', 'positive'],
    [{ battery: 12, charging: true }, 'Battery low', 'warning'],
    [{ battery: 80, thermal_state: 'severe' }, 'Hot', 'warning'],
    [{ battery: 80, in_call: true, thermal_state: 'severe' }, 'In a call', 'info'],
    [{ battery: 80, ringing: true, in_call: true }, 'Ringing…', 'info'],
    [{ battery: 80, screen_on: false }, 'Screen off', 'info'],
    [{ battery: 80 }, 'On battery', 'info'],
  ] as const)('names %j %s', (values, word, tone) => {
    expect(faceWordOf(readings(values), true)).toMatchObject({ word, tone });
  });

  it('says when the charge will be full and how hot it is', () => {
    const charging = faceWordOf(
      readings({ charging: true, charge_full_at: '2026-10-18T18:40:00.000Z' }),
      true,
    );
    expect(charging.detail).toMatch(/^Full at ~\d{1,2}:\d{2}(\s[AP]M)?$/);
    expect(
      faceWordOf(readings({ thermal_state: 'severe', battery_temperature: 44.4 }), true).detail,
    ).toBe('44 °C');
  });

  it('shows the last report and that commands wait while the phone is offline', () => {
    const offline = faceWordOf(readings({ battery: 80 }, false), false);
    expect(offline.word).toMatch(/^Last report \d{1,2}:\d{2}(\s[AP]M)?$/);
    expect(offline).toMatchObject({
      tone: 'neutral',
      detail: 'Phone is offline · commands wait until it is back',
    });
  });

  it('keeps the report time out of an online phone so a new report alone changes nothing', () => {
    expect(readings({ battery: 80 }).reportedAt).toBeNull();
    expect(readings({ battery: 80 }, false).reportedAt).not.toBeNull();
  });

  it('names what the person is doing, or Offline', () => {
    const walking = readings({ phone_context: 'walking' });
    expect(doingWordOf(walking.doing, true)).toBe('Walking');
    expect(doingWordOf(walking.doing, false)).toBe('Offline');
    expect(doingWordOf(null, true)).toBeNull();
    expect(doingSince(walking.doing)).toMatch(/^Walking since \d{1,2}:\d{2}(\s[AP]M)?$/);
  });

  it('speaks the battery, charging, ringing and ringer', () => {
    expect(
      spokenPhone(readings({ battery: 62, charging: true, ringer_mode: 'normal' }), true),
    ).toBe('Phone, 62 percent, charging, ringer normal');
    expect(spokenPhone(readings({ battery: 62 }), false)).toBe('Phone, 62 percent, offline');
  });
});
