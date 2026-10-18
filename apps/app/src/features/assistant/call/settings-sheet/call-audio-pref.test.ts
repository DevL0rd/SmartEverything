import { CLIENT_PREFS, SETTINGS_ROW } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { emptyState, type StoreState } from '../../../../store/state';
import { callAudioOf, pauseOf, storedCallAudioOf } from './call-audio-pref';

function stateOf(pause: number | null): StoreState {
  const settings =
    pause === null
      ? null
      : SETTINGS_ROW.parse({
          home_name: 'Home',
          time_zone: 'UTC',
          latitude: null,
          longitude: null,
          public_url: null,
          public_url_checked_at: null,
          public_url_verified_at: null,
          public_url_error: null,
          ice_servers: [],
          webrtc_candidates: [],
          push_project_id: null,
          end_of_speech_pause_ms: pause,
          updated_at: '2026-10-18T10:00:00.000Z',
        });
  return { ...emptyState(), settings };
}

describe('the call audio the engines read', () => {
  it('takes the pause from the home setting, shared with every listening ear', () => {
    expect(pauseOf(stateOf(1000))).toBe(1000);
    expect(callAudioOf(stateOf(640)).pause_ms).toBe(640);
  });

  it('uses the default pause until the home settings arrive', () => {
    expect(pauseOf(stateOf(null))).toBe(200);
  });

  it('keeps the pause out of what the device stores', () => {
    expect(storedCallAudioOf(stateOf(1000))).toEqual(CLIENT_PREFS.call_audio.defaultValue);
    expect('pause_ms' in storedCallAudioOf(stateOf(1000))).toBe(false);
  });
});
