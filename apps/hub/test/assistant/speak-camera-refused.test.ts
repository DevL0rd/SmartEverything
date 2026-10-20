import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Go2rtcError } from '../../src/cameras/go2rtc-client';
import { systemClock } from '../../src/clock';
import { speakOnce, type AnnouncingDeps, type SpeakJob } from '../../src/reach/announcing';
import type { Saying, SpeechSink } from '../../src/speech/one-shot-speech';
import { CameraSpeakers } from '../../src/talk/camera-speaker';
import { TalkFeeds } from '../../src/talk/feeds';
import { testStore, type TestStore } from '../support/store';
import { furnishHome } from '../support/tool-home';
import { pause, until } from '../support/wait';

const REFUSED = new Go2rtcError('streams.play', 500, "can't find consumer");

const feeds = new TalkFeeds(new Logger('hub.test'));

let opened: TestStore;
let camera: DeviceRow;
let sinks: SpeechSink[];
let outcomes: (string | null)[];
let plays: number;

beforeEach(async () => {
  opened = await testStore();
  camera = furnishHome(opened.store).camera;
  sinks = [];
  outcomes = [];
  plays = 0;
  await feeds.start();
});

afterEach(async () => {
  feeds.stop();
  await opened.close();
});

function depsOver(play: () => Promise<void>, ready: () => Promise<void>): AnnouncingDeps {
  const log = new Logger('hub.test');
  return {
    say: (request): Promise<Saying> => {
      sinks.push(request.sink);
      return Promise.resolve({ end: () => Promise.resolve() });
    },
    camera: {
      speakers: new CameraSpeakers({
        go2rtc: {
          play: (): Promise<void> => {
            plays += 1;
            return play();
          },
          backchannel: (): Promise<boolean> => Promise.resolve(true),
        },
        feeds,
        ready,
        clock: systemClock,
        log,
      }),
    },
    openLive: () => ({ ok: false, reason: 'channel_missing' }),
    app: { play: () => Promise.resolve(null) },
    aiName: () => 'MoMo',
    clock: systemClock,
    log,
  };
}

function jobOn(id: string): SpeakJob {
  return {
    id,
    profileId: 'person-1',
    clientId: null,
    text: 'hello',
    target: { kind: 'camera', device: camera, label: 'Living room camera' },
    done: (failure) => outcomes.push(failure),
  };
}

const ready = (): Promise<void> => Promise.resolve();

describe('speaking through a camera whose speaker cannot play', () => {
  it('fails with a plain reason when go2rtc refuses to play the channel', async () => {
    const deps = depsOver(() => Promise.reject(REFUSED), ready);
    await speakOnce(deps, jobOn('speech-1'));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toContain('Could not play on Living room camera');
    expect(outcomes[0]).toContain('firewall');
    expect(outcomes[0]).toContain('Try another speaker');
    expect(outcomes[0]).toContain("can't find consumer");
    expect(plays).toBe(2);
  });

  it('fails when the camera stream is down before go2rtc is asked', async () => {
    const deps = depsOver(
      () => Promise.resolve(),
      () => Promise.reject(new Error('the camera is offline')),
    );
    await speakOnce(deps, jobOn('speech-1'));
    expect(outcomes[0]).toContain('Could not play on Living room camera');
    expect(outcomes[0]).toContain('the camera is offline');
    expect(plays).toBe(0);
  });

  it('fails at once, without asking go2rtc again, while a standby output is backing off', async () => {
    const deps = depsOver(() => Promise.reject(REFUSED), ready);
    const release = deps.camera.speakers.standby(camera.id);
    await until(() => plays === 2, 'the standby output to be refused');
    await pause(20);
    const asked = Date.now();
    await speakOnce(deps, jobOn('speech-2'));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toContain('Could not play on Living room camera');
    expect(outcomes[0]).toContain("can't find consumer");
    expect(Date.now() - asked).toBeLessThan(500);
    expect(plays).toBe(2);
    release();
  });

  it('does not report the speech as started until go2rtc has accepted the channel', async () => {
    let accept: () => void = () => undefined;
    const accepted = new Promise<void>((resolve) => {
      accept = resolve;
    });
    const deps = depsOver(() => accepted, ready);
    let started = false;
    const speaking = speakOnce(deps, jobOn('speech-1')).then(() => {
      started = true;
    });
    await until(() => sinks.length === 1, 'the speech to begin');
    await pause(50);
    expect(started).toBe(false);
    accept();
    await speaking;
    expect(started).toBe(true);
    expect(outcomes).toEqual([]);
    sinks[0]?.ended('finished', null);
    expect(outcomes).toEqual([null]);
  });
});
