import type { SignalInput, WakeArbitrated } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { emitReachSignals } from '../../src/server/reach-signals';
import { SignalBus } from '../../src/signals/bus';
import { CONTEST_MS, HOLD_MS, WakeClaims, type WakeSource } from '../../src/wake-name/wake-claims';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const START = '2026-10-18T10:00:00.000Z';

let clock: FakeClock;
let claims: WakeClaims;
let heard: SignalInput[];
let logs: CapturedLogs;
let stop: () => void;

beforeEach(() => {
  logs = captureLogs();
  clock = new FakeClock(START);
  claims = new WakeClaims({ clock, log: testLogger('claims') });
  const bus = new SignalBus({ log: testLogger('signals'), now: clock.now });
  heard = [];
  bus.subscribe((signal) => {
    if (signal.source === 'listening') heard.push(signal);
  });
  stop = emitReachSignals(
    bus,
    {
      claims,
      listening: { onStateChanged: (): (() => void) => (): void => undefined },
      voice: { onCall: (): (() => void) => (): void => undefined },
    },
    clock.now,
  );
});

function wake(source: WakeSource, key: string, snippetDbfs: number): void {
  claims.request({ source, key, snippetDbfs });
}

function settle(): void {
  clock.advanceTo(new Date(clock.now().getTime() + HOLD_MS).toISOString());
}

describe('wake heard signal', () => {
  it('fires once per settled contest with the winner, who decided and the loudness', () => {
    wake('camera', 'porch', -31.04);
    clock.advanceTo(new Date(clock.now().getTime() + CONTEST_MS - 100).toISOString());
    wake('camera', 'garage', -20.26);
    wake('phone', 'pixel', -45);
    expect(heard).toHaveLength(0);
    settle();
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      source: 'listening',
      kind: 'wake_heard',
      subject: 'garage',
      field: null,
      value: -20.3,
      profileId: null,
      data: {
        source: 'camera',
        winner: 'garage',
        decidedBy: 'loudest',
        loudness: -20.3,
        contenders: 3,
      },
    });
  });

  it('lets a computer that heard it win over a louder camera and says so', () => {
    wake('camera', 'porch', -20);
    wake('computer', 'desk', -45);
    settle();
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      subject: 'desk',
      data: { source: 'computer', decidedBy: 'computer', loudness: -45 },
    });
  });

  it('names the winner by its listening key so a Discord win reads as discord', () => {
    wake('voice_call', 'call-1', -50);
    settle();
    expect(heard[0]).toMatchObject({
      subject: 'discord',
      data: { source: 'voice_call', winner: 'discord', decidedBy: 'only' },
    });
  });

  it('fires again for the next contest and carries no spoken text', () => {
    wake('camera', 'porch', -30);
    settle();
    wake('camera', 'porch', -28);
    settle();
    expect(heard.map((signal) => signal.value)).toStrictEqual([-30, -28]);
    expect(Object.keys(heard[0]?.data ?? {}).sort()).toStrictEqual([
      'contenders',
      'decidedBy',
      'loudness',
      'source',
      'winner',
    ]);
  });

  it('keeps a camera within 3 in a burst and logs the drop once', () => {
    for (let index = 0; index < 4; index += 1) {
      wake('camera', 'porch', -30);
      settle();
    }
    expect(heard).toHaveLength(3);
    expect(logs.events().filter((event) => event === 'signals.storm')).toHaveLength(1);
  });

  it('leaves another source its own burst', () => {
    for (let index = 0; index < 4; index += 1) {
      wake('camera', 'porch', -30);
      settle();
    }
    wake('camera', 'garage', -30);
    settle();
    expect(heard.filter((signal) => signal.subject === 'garage')).toHaveLength(1);
  });

  it('stops signalling once unsubscribed', () => {
    stop();
    wake('camera', 'porch', -30);
    settle();
    expect(heard).toHaveLength(0);
  });

  it('is the signal the arbiter reports, not a second contest', () => {
    const arbitrated: WakeArbitrated[] = [];
    claims.onArbitrated((one) => {
      arbitrated.push(one);
    });
    wake('talk', 'channel-1', -40);
    settle();
    expect(arbitrated).toHaveLength(1);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.at).toBe(arbitrated[0]?.at);
  });
});
