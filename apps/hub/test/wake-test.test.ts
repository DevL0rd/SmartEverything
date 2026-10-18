import type { WakeSensitivity, WakeTestLine } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { WakeTest, type WakeTestSource } from '../src/wake-name/wake-test';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';

const CLIENT = 'client-a';
const OTHER = 'client-b';
const CAMERA: WakeTestSource = { kind: 'camera', key: 'cam-1' };
const START = '2026-10-18T10:00:00.000Z';

let clock: FakeClock;
let online: Set<string>;
let sent: { clientId: string; line: WakeTestLine }[];
let transcribed: number;
let nearChecked: number;
let text: string | null;
let near: boolean;
let wakeTest: WakeTest;

function segmentAt(offsetMs: number): { startedAt: number; endedAt: number; pcm: Int16Array } {
  const startedAt = clock.now().getTime() + offsetMs;
  return { startedAt, endedAt: startedAt + 1500, pcm: new Int16Array(16_000) };
}

async function settled(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

beforeEach(() => {
  clock = new FakeClock(START);
  online = new Set([CLIENT, OTHER]);
  sent = [];
  transcribed = 0;
  nearChecked = 0;
  text = 'hey jarvis what time is it';
  near = false;
  wakeTest = new WakeTest({
    connected: (): ReadonlySet<string> => online,
    send: (clientId, line): void => {
      sent.push({ clientId, line });
    },
    transcribe: (): Promise<string | null> => {
      transcribed += 1;
      return Promise.resolve(text);
    },
    nearHears: (_pcm: Int16Array, _sensitivity: WakeSensitivity): Promise<boolean> => {
      nearChecked += 1;
      return Promise.resolve(near);
    },
    sensitivity: (): WakeSensitivity => 'standard',
    label: (): string => 'Kitchen camera',
    id: (): string => `line-${String(sent.length)}`,
    clock,
    log: testLogger(),
  });
});

describe('wake word test', () => {
  it('transcribes and emits nothing while nobody is testing', async () => {
    wakeTest.matched(CAMERA, 'hey coordinator');
    wakeTest.segment(CAMERA, segmentAt(0));
    await settled();
    expect(transcribed).toBe(0);
    expect(nearChecked).toBe(0);
    expect(sent).toEqual([]);
  });

  it('tells listeners when the first test starts and the last one stops', () => {
    const changes: boolean[] = [];
    wakeTest.onActive((active) => changes.push(active));
    wakeTest.watch(CLIENT, true);
    wakeTest.watch(OTHER, true);
    wakeTest.watch(CLIENT, false);
    wakeTest.watch(OTHER, false);
    expect(changes).toEqual([true, false]);
  });

  it('tags speech with the fired phrase as matched', async () => {
    wakeTest.watch(CLIENT, true);
    wakeTest.matched(CAMERA, 'hey coordinator');
    wakeTest.segment(CAMERA, segmentAt(-500));
    await settled();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.line).toMatchObject({
      verdict: 'matched',
      phrase: 'hey coordinator',
      text: 'hey jarvis what time is it',
      source: 'Kitchen camera',
    });
    expect(nearChecked).toBe(0);
  });

  it('tags unmatched speech the spotter nearly caught as almost', async () => {
    near = true;
    wakeTest.watch(CLIENT, true);
    wakeTest.segment(CAMERA, segmentAt(0));
    await settled();
    expect(sent[0]?.line).toMatchObject({ verdict: 'almost', phrase: null });
  });

  it('tags speech the ear reported as a near miss as almost without scoring it again', async () => {
    wakeTest.watch(CLIENT, true);
    wakeTest.near(CAMERA, 'hey coordinator');
    wakeTest.segment(CAMERA, segmentAt(-500));
    await settled();
    expect(sent[0]?.line).toMatchObject({ verdict: 'almost', phrase: 'hey coordinator' });
    expect(nearChecked).toBe(0);
  });

  it('keeps near misses of one source from tagging another source', async () => {
    wakeTest.watch(CLIENT, true);
    wakeTest.near({ kind: 'camera', key: 'cam-2' }, 'hey coordinator');
    wakeTest.segment(CAMERA, segmentAt(0));
    await settled();
    expect(sent[0]?.line).toMatchObject({ verdict: 'heard', phrase: null });
  });

  it('tags plain speech as heard', async () => {
    wakeTest.watch(CLIENT, true);
    wakeTest.segment(CAMERA, segmentAt(0));
    await settled();
    expect(sent[0]?.line).toMatchObject({ verdict: 'heard', phrase: null });
  });

  it('ignores a match that happened before the speech started', async () => {
    wakeTest.watch(CLIENT, true);
    wakeTest.matched(CAMERA, 'hey coordinator');
    wakeTest.segment(CAMERA, segmentAt(60_000));
    await settled();
    expect(sent[0]?.line.verdict).toBe('heard');
  });

  it('drops silence hallucinations and keeps untranscribed speech', async () => {
    wakeTest.watch(CLIENT, true);
    text = 'Thank you.';
    wakeTest.segment(CAMERA, segmentAt(0));
    await settled();
    expect(sent).toEqual([]);
    text = null;
    wakeTest.segment(CAMERA, segmentAt(0));
    await settled();
    expect(sent[0]?.line.text).toBeNull();
  });

  it('sends only to testers that are online and forgets the others', async () => {
    wakeTest.watch(CLIENT, true);
    wakeTest.watch(OTHER, true);
    online.delete(OTHER);
    wakeTest.segment(CAMERA, segmentAt(0));
    await settled();
    expect(sent.map((one) => one.clientId)).toEqual([CLIENT]);
    wakeTest.watch(CLIENT, false);
    expect(wakeTest.active()).toBe(false);
  });
});
