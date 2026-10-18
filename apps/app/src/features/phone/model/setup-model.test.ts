import { describe, expect, it } from 'vitest';
import { PHONE_FEATURES, type PhoneFeatureSupport } from '@smarteverything/domain';
import { pageAccessOf } from './page-access';
import { dismissAppAction, dismissKeyAction, launchAppAction } from './phone-page-actions';
import { allowedCount, FEATURE_COPY, featureRowsOf } from './setup-model';
import { PHONE_ACTION } from '@smarteverything/domain';

const FEATURES: readonly PhoneFeatureSupport[] = [
  { feature: 'torch', state: 'ready' },
  { feature: 'fold', state: 'unsupported', reason: 'No second screen' },
  { feature: 'dnd', state: 'needs_permission', permission: 'android_dnd', reason: 'Off' },
  { feature: 'usage', state: 'ready' },
];

describe('the setup feature list', () => {
  it('describes every feature the phone can report', () => {
    expect(Object.keys(FEATURE_COPY).sort()).toEqual([...PHONE_FEATURES].sort());
  });

  it('lists what needs attention first, then what is allowed, then what is missing', () => {
    expect(featureRowsOf(FEATURES).map((row) => row.state)).toEqual([
      'needs_permission',
      'ready',
      'ready',
      'unsupported',
    ]);
  });

  it('counts only features this phone can have', () => {
    expect(allowedCount(featureRowsOf(FEATURES))).toBe('2 of 3 allowed');
    expect(allowedCount([])).toBe('0 of 0 allowed');
  });
});

describe('what each person sees on the apps and notifications pages', () => {
  it('shows everything to the phone person, totals to the owner and nothing to a member', () => {
    expect(pageAccessOf('person')).toBe('full');
    expect(pageAccessOf('owner')).toBe('totals');
    expect(pageAccessOf('member')).toBe('locked');
  });
});

describe('the actions the apps and notifications pages send', () => {
  it('opens an app by package', () => {
    expect(PHONE_ACTION.parse(launchAppAction('com.spotify.music'))).toEqual({
      type: 'launch_app',
      app: 'com.spotify.music',
    });
  });

  it('dismisses one notification by key and all of an app by package', () => {
    expect(PHONE_ACTION.parse(dismissKeyAction('0|com.chat|1'))).toEqual({
      type: 'dismiss_notification',
      target: { by: 'key', key: '0|com.chat|1' },
    });
    expect(PHONE_ACTION.parse(dismissAppAction('com.chat'))).toEqual({
      type: 'dismiss_notification',
      target: { by: 'app', app: 'com.chat' },
    });
  });
});
