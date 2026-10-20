import { describe, expect, it } from 'vitest';
import { person } from '../../../src/plugins/builtin/discord/person';
import {
  CallSession,
  type HeardLine,
} from '../../../src/plugins/builtin/discord/voice/call-session';
import { LiveVoices, type LiveDeps } from '../../../src/plugins/builtin/discord/voice/live';
import type { PluginVoice } from '../../../src/plugins/plugin-voice';
import {
  CONTEST_MS,
  WakeClaims,
  type WakeSource,
  type OnSuperseded,
} from '../../../src/wake-name/wake-claims';
import { FakeClock } from '../../support/fake-clock';
import { testLogger } from '../../support/logs';

type Hosted = Awaited<ReturnType<PluginVoice['host']>>;

const START = '2026-10-17T10:00:00.000Z';
const nothing = (): void => undefined;

class Hostings {
  readonly ended: string[] = [];
  private count = 0;

  host = (): Promise<Hosted> => {
    this.count += 1;
    const id = `call-${String(this.count)}`;
    const call: Hosted = {
      id,
      hear: nothing,
      see: nothing,
      note: nothing,
      say: nothing,
      mute: nothing,
      end: (): Promise<void> => {
        this.ended.push(id);
        return Promise.resolve();
      },
    };
    return Promise.resolve(call);
  };
}

class Deferred {
  readonly ended: string[] = [];
  private readonly releases: (() => void)[] = [];

  host = (): Promise<Hosted> =>
    new Promise((resolve) => {
      const id = `late-${String(this.releases.length + 1)}`;
      this.releases.push(() => {
        resolve({
          id,
          hear: nothing,
          see: nothing,
          note: nothing,
          say: nothing,
          mute: nothing,
          end: (): Promise<void> => {
            this.ended.push(id);
            return Promise.resolve();
          },
        });
      });
    });

  releaseAll(): void {
    this.releases.forEach((release) => {
      release();
    });
  }
}

async function* emptyStream(): AsyncGenerator<Uint8Array> {
  await Promise.resolve();
  yield* [];
}

function sessionOf(): CallSession {
  return new CallSession({
    identity: { guildId: 'guild', channelId: 'channel', channelName: 'Lounge', startedAt: START },
    link: {
      channelId: 'channel',
      muted: () => false,
      setMuted: () => false,
      onSpeaking: nothing,
      listen: () => emptyStream(),
      play: nothing,
      stop: nothing,
      onClosed: nothing,
      destroy: nothing,
    },
    transcript: { id: 'transcript', add: nothing, recent: () => [], close: nothing },
    voice: {
      ear: () => Promise.resolve({ packet: nothing, close: () => Promise.resolve() }),
      transcribe: () => Promise.resolve(null),
    },
    language: 'en',
    hooks: {
      approved: () => true,
      captures: () => true,
      mixes: nothing,
      wakeable: () => true,
      wakeSensitivity: () => 'standard',
      wakeNames: () => [],
      wake: nothing,
      heard: nothing,
      speaker: (userId) => Promise.resolve(person(userId, userId)),
      names: () => [],
      report: nothing,
      changed: nothing,
    },
    clock: new FakeClock(START),
  });
}

function setup(
  host: () => Promise<Hosted>,
  ready = true,
): {
  readonly live: LiveVoices;
  readonly typed: string[];
  readonly clock: FakeClock;
  readonly claims: WakeClaims;
  readonly session: CallSession;
} {
  const clock = new FakeClock(START);
  const typed: string[] = [];
  const deps: LiveDeps = {
    voice: { host, ready: () => ready },
    settings: { voice_idle_seconds: 60, voice_pause_ms: 700 },
    policy: { userAllowed: () => true },
    place: () => 'lounge',
    muted: () => false,
    typed: (_session, who, text) => {
      typed.push(`${who.id}: ${text}`);
    },
    typeInCall: () => Promise.resolve(),
    botLine: nothing,
    changed: nothing,
    now: () => clock.now().getTime(),
    report: (cause) => {
      throw cause instanceof Error ? cause : new Error('reported');
    },
  };
  return {
    live: new LiveVoices(deps),
    typed,
    clock,
    claims: new WakeClaims({ clock, log: testLogger('claims') }),
    session: sessionOf(),
  };
}

function wakeAs(
  harness: ReturnType<typeof setup>,
  user: string,
  dbfs: number,
  source: WakeSource = 'voice_call',
): boolean {
  const grant = harness.claims.request({ source, key: `discord:${user}`, snippetDbfs: dbfs });
  if (grant.granted) {
    const onSuperseded: OnSuperseded = grant.onSuperseded;
    harness.live.wake(harness.session, person(user, user), {
      phrase: 'hey jarvis',
      words: () => new Int16Array(0),
      onSuperseded,
    });
  }
  return grant.granted;
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('Discord wake and superseding', () => {
  it('ends the Discord conversation when a louder Discord user takes over', async () => {
    const hostings = new Hostings();
    const harness = setup(hostings.host);
    expect(wakeAs(harness, 'ann', -40)).toBe(true);
    await settle();
    expect(harness.live.active('guild')).toBe(true);
    harness.clock.advanceTo(new Date(Date.parse(START) + 300).toISOString());
    expect(wakeAs(harness, 'bob', -20)).toBe(true);
    await settle();
    expect(hostings.ended).toEqual(['call-1']);
    expect(harness.live.active('guild')).toBe(true);
  });

  it('keeps the Discord conversation when a quieter Discord user is refused', async () => {
    const hostings = new Hostings();
    const harness = setup(hostings.host);
    wakeAs(harness, 'ann', -20);
    await settle();
    expect(wakeAs(harness, 'bob', -40)).toBe(false);
    await settle();
    expect(hostings.ended).toEqual([]);
  });

  it('ends a conversation still opening when a louder claim takes over', async () => {
    const deferred = new Deferred();
    const harness = setup(deferred.host);
    wakeAs(harness, 'ann', -40);
    expect(harness.live.active('guild')).toBe(true);
    expect(wakeAs(harness, 'bob', -20)).toBe(true);
    deferred.releaseAll();
    await settle();
    expect(deferred.ended).toEqual(['late-1']);
  });

  it('cancels the typed wake of a user whose wake was taken over', () => {
    const harness = setup(new Hostings().host, false);
    wakeAs(harness, 'ann', -40);
    harness.clock.advanceTo(new Date(Date.parse(START) + 300).toISOString());
    expect(wakeAs(harness, 'bob', -20)).toBe(true);
    const line = (user: string): HeardLine => ({
      userId: user,
      person: person(user, user),
      text: `${user} asks`,
      at: new Date(Date.parse(START)).toISOString(),
    });
    harness.live.heard(harness.session, line('ann'));
    harness.live.heard(harness.session, line('bob'));
    expect(harness.typed).toEqual(['bob: bob asks']);
  });

  it('keeps the typed wake of a user whose wake stood', () => {
    const harness = setup(new Hostings().host, false);
    wakeAs(harness, 'ann', -20);
    harness.clock.advanceTo(new Date(Date.parse(START) + 300).toISOString());
    expect(wakeAs(harness, 'bob', -40)).toBe(false);
    harness.live.heard(harness.session, {
      userId: 'ann',
      person: person('ann', 'ann'),
      text: 'ann asks',
      at: START,
    });
    expect(harness.typed).toEqual(['ann: ann asks']);
  });

  it('listens for another wake only inside the contest window of a live conversation', async () => {
    const harness = setup(new Hostings().host);
    wakeAs(harness, 'ann', -40);
    await settle();
    expect(harness.live.wakeable(harness.session, 'bob')).toBe(true);
    harness.clock.advanceTo(new Date(Date.parse(START) + CONTEST_MS).toISOString());
    expect(harness.live.wakeable(harness.session, 'bob')).toBe(false);
  });
});
