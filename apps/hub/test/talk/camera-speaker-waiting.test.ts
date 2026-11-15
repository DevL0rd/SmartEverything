import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { CameraOfflineError, UnknownStreamError } from '../../src/cameras/camera-service';
import { CameraSpeakers } from '../../src/talk/camera-speaker';
import { TalkFeeds } from '../../src/talk/feeds';
import { FakeClock } from '../support/fake-clock';
import { until } from '../support/wait';

const START = '2026-11-15T10:00:00.000Z';
const HOUR_LATER = '2026-11-15T11:00:00.000Z';

const feeds = new TalkFeeds(new Logger('hub.test'));

beforeEach(async () => {
  await feeds.start();
});

afterEach(() => {
  feeds.stop();
});

describe('camera speaker standby while the camera is unavailable', () => {
  it.each([
    ['is offline', (id: string): Error => new CameraOfflineError(id)],
    ['has no stream', (id: string): Error => new UnknownStreamError(id)],
  ])(
    'asks once while the camera %s, sets no retry timer and plays the moment it is reprimed',
    async (_case, refusal) => {
      const clock = new FakeClock(START);
      let available = false;
      let asked = 0;
      let played = 0;
      const speakers = new CameraSpeakers({
        go2rtc: {
          play: (): Promise<void> => {
            played += 1;
            return Promise.resolve();
          },
          backchannel: (): Promise<boolean> => Promise.resolve(true),
        },
        feeds,
        ready: (id): Promise<void> => {
          asked += 1;
          return available ? Promise.resolve() : Promise.reject(refusal(id));
        },
        clock,
        log: new Logger('hub.test'),
      });
      const release = speakers.standby('camera-1');
      await until(() => asked === 1, 'the first readiness check');
      await until(() => clock.pending().length === 0, 'the speaker to stop its timers');
      clock.advanceTo(HOUR_LATER);
      expect(asked).toBe(1);
      expect(played).toBe(0);
      available = true;
      speakers.reprime('camera-1');
      await until(() => played === 1, 'the speaker to play once the camera is available');
      expect(asked).toBe(2);
      release();
    },
  );
});
