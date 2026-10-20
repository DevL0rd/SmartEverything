import type {
  PauseChoiceMs,
  ListeningHubMessage,
  ListeningNodeMessage,
  ListeningRuntimeState,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListeningLevels } from '../../src/listening/listening-levels';
import { opusCodec } from '../../src/assistant-voice/audio';
import { base64OfPcm } from '../../src/computers/ear-pcm';
import { ComputerEars, type ComputerEarsOptions } from '../../src/computers/computer-ears';
import type { SpeechSegment } from '../../src/listening/speech-segment';
import { WakeClaims, type OnSuperseded } from '../../src/wake-name/wake-claims';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { idleWakeTest } from '../wake-test-idle';

const START = '2026-10-18T10:00:00.000Z';
const KITCHEN = '5b1e2f57-0d5e-4a43-9a3f-0b1d3c3c1f01';
const DEN = '5b1e2f57-0d5e-4a43-9a3f-0b1d3c3c1f02';

function tone(samples: number, amplitude: number): Int16Array {
  return Int16Array.from({ length: samples }, (_, index) =>
    index % 2 === 0 ? amplitude : -amplitude,
  );
}

interface Harness {
  readonly ears: ComputerEars;
  readonly claims: WakeClaims;
  readonly clock: FakeClock;
  readonly sent: ListeningHubMessage[];
  readonly states: (readonly [string, ListeningRuntimeState | null])[];
  readonly segments: SpeechSegment[];
  readonly woke: {
    id: string;
    phrase: string;
    heard: () => Int16Array;
    onSuperseded: OnSuperseded;
  }[];
  readonly voice: { in: boolean; notify: () => void };
  readonly switches: { wake: boolean; transcribe: boolean };
  readonly metered: { id: string; dbfs: number }[];
  readonly nears: { key: string; phrase: string }[];
  readonly levels: ListeningLevels;
  readonly switched: ((key: string) => void)[];
  readonly wakeResult: { current: Promise<void> };
  readonly pause: { ms: PauseChoiceMs; changed: (() => void)[] };
}

function harness(): Harness {
  const clock = new FakeClock(START);
  const claims = new WakeClaims({ clock, log: testLogger('claims') });
  const sent: ListeningHubMessage[] = [];
  const states: (readonly [string, ListeningRuntimeState | null])[] = [];
  const segments: SpeechSegment[] = [];
  const woke: Harness['woke'] = [];
  const metered: Harness['metered'] = [];
  const nears: Harness['nears'] = [];
  const levels = new ListeningLevels({
    connected: (): ReadonlySet<string> => new Set(['viewer']),
    send: (_client, key, dbfs): void => {
      metered.push({ id: key, dbfs });
    },
  });
  const switched: Harness['switched'] = [];
  const switches = { wake: true, transcribe: false };
  const notifiers: (() => void)[] = [];
  const voice = {
    in: false,
    notify: (): void => {
      notifiers.forEach((notify) => {
        notify();
      });
    },
  };
  const pause: Harness['pause'] = { ms: 200, changed: [] };
  const wakeResult = { current: new Promise<void>(() => undefined) };
  const options: ComputerEarsOptions = {
    test: {
      ...idleWakeTest,
      near: (source, phrase): void => {
        nears.push({ key: source.key, phrase });
      },
    },
    registry: {
      wanted: () => ({ ...switches }),
      sensitivityOf: () => 'standard',
      onSwitched: (listener) => {
        switched.push(listener);
        return (): void => undefined;
      },
      setState: (key, state): void => {
        states.push([key, state]);
      },
      levels,
    },
    claims,
    pause: {
      ms: () => pause.ms,
      onChange: (listener) => {
        pause.changed.push(() => {
          listener(pause.ms);
        });
        return (): void => undefined;
      },
    },
    speech: {
      segment: (_id, segment): void => {
        segments.push(segment);
      },
      finish: (): void => undefined,
    },
    discord: {
      inVoice: () => voice.in,
      changes: (listener) => {
        notifiers.push(listener);
        return (): void => undefined;
      },
    },
    keywords: () => ({ keywords: ['▁HE Y @hey_jarvis'], threshold: 0.15, nearMissThreshold: 0.06 }),
    wake: (id, phrase, heard, onSuperseded) => {
      woke.push({ id, phrase, heard, onSuperseded });
      return wakeResult.current;
    },
    log: testLogger('ears'),
  };
  const ears = new ComputerEars(options);
  ears.start();
  return {
    ears,
    claims,
    clock,
    sent,
    states,
    segments,
    woke,
    voice,
    switches,
    metered,
    nears,
    levels,
    switched,
    wakeResult,
    pause,
  };
}

function claim(dbfs: number, preroll: Int16Array): ListeningNodeMessage {
  return {
    kind: 'claim',
    claim: { phrase: 'hey jarvis', snippetDbfs: dbfs, preroll: base64OfPcm(preroll) },
  };
}

let test: Harness;

beforeEach(() => {
  test = harness();
});

describe('computer ear configuration', () => {
  it('sends the hub keyword lines when wake is on', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    expect(test.sent).toEqual([
      {
        kind: 'config',
        config: {
          wake: true,
          transcribe: false,
          keywords: ['▁HE Y @hey_jarvis'],
          threshold: 0.15,
          nearMissThreshold: 0.06,
          sensitivity: 'standard',
          pause_ms: 200,
        },
      },
    ]);
  });

  it('sends the changed end-of-speech pause to a connected computer', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.pause.ms = 1000;
    test.pause.changed.forEach((notify) => {
      notify();
    });
    expect(test.sent.at(-1)).toMatchObject({ kind: 'config', config: { pause_ms: 1000 } });
  });

  it('rests when both switches are off and does not repeat itself', () => {
    test.switches.wake = false;
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.switched.forEach((listener) => {
      listener(KITCHEN);
    });
    expect(test.sent).toEqual([{ kind: 'rest', reason: 'switched_off' }]);
  });

  it('rests while the Discord bot is in a voice channel and listens again when it leaves', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.voice.in = true;
    test.voice.notify();
    expect(test.sent.at(-1)).toEqual({ kind: 'rest', reason: 'discord_call' });
    expect(test.states.at(-1)).toEqual([KITCHEN, 'discord_call']);
    test.voice.in = false;
    test.voice.notify();
    expect(test.sent.at(-1)?.kind).toBe('config');
    expect(test.states.at(-1)).toEqual([KITCHEN, null]);
  });

  it('shows what the node reports, such as a missing microphone permission', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, { kind: 'state', state: 'needs_permission' });
    expect(test.states.at(-1)).toEqual([KITCHEN, 'needs_permission']);
  });

  it('meters only while someone watches and forwards the level', () => {
    test.levels.watch('viewer', KITCHEN);
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    expect(test.sent[0]).toEqual({ kind: 'level', watched: true });
    test.ears.heard(KITCHEN, { kind: 'level', dbfs: -33 });
    expect(test.metered).toEqual([{ id: KITCHEN, dbfs: -33 }]);
    test.levels.watch('viewer', null);
    expect(test.sent.at(-1)).toEqual({ kind: 'level', watched: false });
  });

  it('hands a near miss the node reports to the wake test under that computer', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, { kind: 'near', phrase: 'hey jarvis' });
    expect(test.nears).toEqual([{ key: KITCHEN, phrase: 'hey jarvis' }]);
    expect(test.woke).toHaveLength(0);
  });

  it('hands speech segments to the transcript writer with wall-clock times', () => {
    test.switches.transcribe = true;
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, {
      kind: 'segment',
      segment: {
        at: '2026-10-18T10:00:01.000Z',
        endedAt: '2026-10-18T10:00:03.000Z',
        levelDbfs: -30,
        pcm: base64OfPcm(tone(32_000, 3000)),
      },
    });
    expect(test.segments).toHaveLength(1);
    expect(test.segments[0]).toMatchObject({
      startedAt: Date.parse('2026-10-18T10:00:01.000Z'),
      endedAt: Date.parse('2026-10-18T10:00:03.000Z'),
    });
  });
});

describe('computer wake claims', () => {
  it('claims with the loudness the node measured and starts the call mode', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, claim(-24.5, tone(1600, 2000)));
    expect(test.woke).toHaveLength(1);
    expect(test.woke[0]?.phrase).toBe('hey jarvis');
    expect(test.sent.at(-1)).toEqual({ kind: 'call', active: true });
    expect(test.states.at(-1)).toEqual([KITCHEN, 'in_conversation']);
  });

  it('gives the words said with the wake word and then what the mic sends next', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, claim(-24, tone(1600, 2000)));
    test.ears.heard(KITCHEN, { kind: 'mic', pcm: base64OfPcm(tone(800, 1000)) });
    expect(test.woke[0]?.heard().length).toBe(2400);
    const microphone: Int16Array[] = [];
    test.ears.audio.microphone(KITCHEN, {
      pcm: (pcm) => microphone.push(pcm),
      ended: () => undefined,
    });
    test.ears.heard(KITCHEN, { kind: 'mic', pcm: base64OfPcm(tone(320, 1000)) });
    expect(microphone.map((pcm) => pcm.length)).toEqual([320]);
  });

  it('keeps a mic that arrived before the call opened', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, claim(-24, tone(1600, 2000)));
    test.woke[0]?.heard();
    test.ears.heard(KITCHEN, { kind: 'mic', pcm: base64OfPcm(tone(640, 1000)) });
    const microphone: Int16Array[] = [];
    test.ears.audio.microphone(KITCHEN, {
      pcm: (pcm) => microphone.push(pcm),
      ended: () => undefined,
    });
    expect(microphone.map((pcm) => pcm.length)).toEqual([640]);
  });

  it('ignores a claim while Discord holds the voice channel', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.voice.in = true;
    test.ears.heard(KITCHEN, claim(-24, tone(1600, 2000)));
    expect(test.woke).toHaveLength(0);
  });

  it('ignores a claim when wake is switched off', () => {
    test.switches.wake = false;
    test.switches.transcribe = true;
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, claim(-24, tone(1600, 2000)));
    expect(test.woke).toHaveLength(0);
  });

  it('stands down for a louder computer and tells the node', () => {
    const den: ListeningHubMessage[] = [];
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.online(DEN, (message) => den.push(message));
    test.ears.heard(KITCHEN, claim(-40, tone(1600, 2000)));
    const stopped: string[] = [];
    test.woke[0]?.onSuperseded((winner) => stopped.push(winner.key));
    test.clock.advanceTo('2026-10-18T10:00:00.400Z');
    test.ears.heard(DEN, claim(-20, tone(1600, 4000)));
    expect(stopped).toEqual([DEN]);
    expect(test.sent.at(-1)).toEqual({
      kind: 'superseded',
      superseded: { winner: { source: 'computer', key: DEN } },
    });
    expect(den.at(-1)).toEqual({ kind: 'call', active: true });
  });

  it('refuses a quieter second claim of the same utterance', () => {
    const den: ListeningHubMessage[] = [];
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.online(DEN, (message) => den.push(message));
    test.ears.heard(KITCHEN, claim(-20, tone(1600, 4000)));
    test.clock.advanceTo('2026-10-18T10:00:00.400Z');
    test.ears.heard(DEN, claim(-40, tone(1600, 2000)));
    expect(test.woke.map((one) => one.id)).toEqual([KITCHEN]);
    expect(den).not.toContainEqual({ kind: 'call', active: true });
  });

  it('leaves the call mode and listens again when the call cannot open', async () => {
    test.wakeResult.current = Promise.reject(new Error('refused'));
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.heard(KITCHEN, claim(-24, tone(1600, 2000)));
    await new Promise((resolve) => setImmediate(resolve));
    expect(test.sent.at(-1)?.kind).toBe('config');
    expect(test.sent).toContainEqual({ kind: 'call', active: false });
  });
});

describe('computer call audio', () => {
  it('forwards the mic to the call and ends the call mode when the mic is released', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    const pcm: Int16Array[] = [];
    const microphone = test.ears.audio.microphone(KITCHEN, {
      pcm: (chunk) => pcm.push(chunk),
      ended: () => undefined,
    });
    expect(test.sent.at(-1)).toEqual({ kind: 'call', active: true });
    test.ears.heard(KITCHEN, { kind: 'mic', pcm: base64OfPcm(tone(320, 900)) });
    expect(pcm).toHaveLength(1);
    microphone?.stop();
    expect(test.sent.at(-1)?.kind).toBe('config');
    expect(test.sent).toContainEqual({ kind: 'call', active: false });
    expect(test.states.at(-1)).toEqual([KITCHEN, null]);
  });

  it('decodes the AI voice and sends it to the speaker as 48 kHz audio', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    const codec = opusCodec();
    const packet = codec.encode(tone(960, 3000));
    const speaker = test.ears.audio.speaker(KITCHEN);
    speaker?.packet(packet);
    const last = test.sent.at(-1);
    expect(last?.kind).toBe('speak');
    if (last?.kind === 'speak') {
      expect(Buffer.from(last.pcm, 'base64').byteLength).toBe(960 * 2);
    }
    speaker?.end();
    codec.free();
  });

  it('has no speaker or microphone for a computer that is not connected', () => {
    expect(test.ears.audio.speaker(KITCHEN)).toBeNull();
    expect(
      test.ears.audio.microphone(KITCHEN, { pcm: () => undefined, ended: () => undefined }),
    ).toBeNull();
  });

  it('tells the call when the computer goes away mid-conversation', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    const failures: (string | null)[] = [];
    test.ears.audio.microphone(KITCHEN, {
      pcm: () => undefined,
      ended: (failure) => failures.push(failure),
    });
    test.ears.offline(KITCHEN);
    expect(failures).toEqual(['the computer went offline']);
    expect(test.states.at(-1)).toEqual([KITCHEN, null]);
  });

  it('refuses a second call on the same computer', () => {
    test.ears.online(KITCHEN, (message) => test.sent.push(message));
    test.ears.audio.microphone(KITCHEN, { pcm: () => undefined, ended: () => undefined });
    expect(
      test.ears.audio.microphone(KITCHEN, { pcm: () => undefined, ended: () => undefined }),
    ).toBeNull();
  });
});
