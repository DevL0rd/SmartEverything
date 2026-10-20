import { readFileSync } from 'node:fs';
import type {
  ListeningConfig,
  ListeningHubMessage,
  ListeningNodeMessage,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SpeakerStream } from '../../../src/node/controls/linux/speaker-playback';
import type { MicHandlers } from '../../../src/node/controls/linux/mic-capture';
import { ComputerEar } from '../../../src/node/ear/computer-ear';
import { pcmOf } from '../../../src/node/ear/ear-audio';
import { NodeFailureError } from '../../../src/node/node-failure';
import { WakeKeywords } from '../../../src/wake-name/keyword-lines';
import { FakeClock } from '../../support/fake-clock';
import { captureLogs, type CapturedLogs } from '../../support/logs';
import { until } from '../../support/wait';

const START = '2026-10-18T10:00:00.000Z';
const CHUNK = 1600;

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(() => {
  Logger.reset();
});

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`../../assistant/fixtures/${name}.pcm`, import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function padded(pcm: Int16Array): Int16Array {
  const out = new Int16Array(pcm.length + 16_000 * 3);
  out.set(pcm, 16_000);
  return out;
}

function configOf(
  overrides: Partial<Pick<ListeningConfig, 'wake' | 'transcribe'>> & {
    readonly name?: string;
  } = {},
): ListeningConfig {
  const keywords = new WakeKeywords().earConfig([overrides.name ?? 'Coordinator'], 'standard');
  return {
    wake: overrides.wake ?? true,
    transcribe: overrides.transcribe ?? false,
    sensitivity: 'standard',
    keywords: [...keywords.keywords],
    threshold: keywords.threshold,
    nearMissThreshold: keywords.nearMissThreshold,
    pause_ms: 200,
  };
}

interface Opening {
  readonly handlers: MicHandlers;
  stopped: boolean;
}

class Bench {
  readonly sent: ListeningNodeMessage[] = [];
  readonly openings: Opening[] = [];
  readonly spoken: Int16Array[] = [];
  readonly speakerEnded: number[] = [];
  readonly clock = new FakeClock(START);
  failOpen: Error | null = null;
  private onDiscord: ((held: boolean) => void) | null = null;
  readonly ear = new ComputerEar({
    capture: {
      open: (handlers): Promise<() => void> => {
        if (this.failOpen !== null) {
          return Promise.reject(this.failOpen);
        }
        const opening: Opening = { handlers, stopped: false };
        this.openings.push(opening);
        return Promise.resolve((): void => {
          opening.stopped = true;
        });
      },
    },
    speaker: { open: (): Promise<SpeakerStream> => Promise.resolve(this.speaker) },
    discord: {
      watch: (onChange): (() => void) => {
        this.onDiscord = onChange;
        return (): void => {
          this.onDiscord = null;
        };
      },
    },
    send: (message): void => {
      this.sent.push(message);
    },
    clock: this.clock,
    log: new Logger('hub.node-ear'),
  });
  private readonly speaker: SpeakerStream = {
    write: (pcm): void => {
      this.spoken.push(pcm);
    },
    end: (): void => {
      this.speakerEnded.push(1);
    },
  };

  receive(message: ListeningHubMessage): void {
    this.ear.receive(message);
  }

  holdDiscord(held: boolean): void {
    this.onDiscord?.(held);
  }

  watchingDiscord(): boolean {
    return this.onDiscord !== null;
  }

  feed(pcm: Int16Array): void {
    const handlers = this.openings.at(-1)?.handlers;
    for (let offset = 0; offset + CHUNK <= pcm.length; offset += CHUNK) {
      handlers?.pcm(pcm.slice(offset, offset + CHUNK));
      this.clock.advanceTo(new Date(this.clock.now().getTime() + 100).toISOString());
    }
  }
}

function bench(): Bench {
  return new Bench();
}

const kinds = (sent: readonly ListeningNodeMessage[]): string[] => sent.map((one) => one.kind);

describe('computer ear wake', () => {
  it('claims the wake word with its loudness and the audio before it', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.feed(padded(fixture('hw_us1')));
    const claim = test.sent.find((one) => one.kind === 'claim');
    expect(claim?.kind).toBe('claim');
    if (claim?.kind !== 'claim') return;
    expect(claim.claim.phrase.toLowerCase()).toBe('hey coordinator');
    expect(claim.claim.snippetDbfs).toBeLessThan(-6);
    expect(claim.claim.snippetDbfs).toBeGreaterThan(-60);
    const preroll = pcmOf(claim.claim.preroll);
    expect(preroll.length).toBeGreaterThan(16_000);
    expect(preroll.length).toBeLessThanOrEqual(16_000 * 3);
    await test.ear.stop();
  }, 30_000);

  it('hears nothing in ordinary speech and makes no claim', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.feed(padded(fixture('person')));
    expect(kinds(test.sent)).toEqual([]);
    await test.ear.stop();
  }, 30_000);

  it('listens for the new keyword lines when the hub sends a new config', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.receive({ kind: 'config', config: configOf({ name: 'Jarvis' }) });
    await until(
      () => logs.events().filter((event) => event === 'computer_ear.listening').length === 2,
      'the new ear',
    );
    test.feed(padded(fixture('hw_jarvis')));
    const claim = test.sent.find((one) => one.kind === 'claim');
    expect(claim?.kind === 'claim' && claim.claim.phrase.toLowerCase()).toBe('hey jarvis');
    expect(test.openings).toHaveLength(1);
    await test.ear.stop();
  }, 30_000);

  it('opens no microphone while neither wake nor writing down is on', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf({ wake: false, transcribe: false }) });
    await test.ear.stop();
    expect(test.openings).toEqual([]);
    expect(test.watchingDiscord()).toBe(false);
  });
});

describe('computer ear rest', () => {
  it('stops the microphone when the hub rests it and starts again on the next config', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.receive({ kind: 'rest', reason: 'discord_call' });
    await until(() => test.openings[0]?.stopped === true, 'the microphone to stop');
    expect(test.watchingDiscord()).toBe(false);
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 2, 'the microphone to open again');
    await test.ear.stop();
    expect(test.openings.every((opening) => opening.stopped)).toBe(true);
  });

  it('rests and says so while Discord holds the microphone, then resumes', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.holdDiscord(true);
    await until(() => test.openings[0]?.stopped === true, 'the microphone to stop');
    expect(test.sent).toContainEqual({ kind: 'state', state: 'discord_call' });
    test.holdDiscord(false);
    await until(() => test.openings.length === 2, 'the microphone to open again');
    expect(test.sent.at(-1)).toEqual({ kind: 'state', state: null });
    await test.ear.stop();
  });

  it('reports a missing microphone tool instead of retrying', async () => {
    const test = bench();
    test.failOpen = new NodeFailureError('not_supported', 'Listening needs pw-record or parec.');
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.sent.length === 1, 'the state report');
    expect(test.sent).toEqual([{ kind: 'state', state: 'needs_permission' }]);
    expect(test.clock.pending()).toEqual([]);
    await test.ear.stop();
  });

  it('reopens a recorder that died, backing off, and reports after repeated failures', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.openings[0]?.handlers.ended('pw-record exited (1)');
    expect(test.clock.pending()).toHaveLength(1);
    test.clock.advanceTo('2026-10-18T10:00:05.000Z');
    await until(() => test.openings.length === 2, 'the microphone to reopen');
    test.openings[1]?.handlers.ended('pw-record exited (1)');
    expect(test.sent).toContainEqual({ kind: 'state', state: 'needs_permission' });
    expect(test.clock.pending()).toEqual(['2026-10-18T10:00:15.000Z']);
    test.clock.advanceTo('2026-10-18T10:00:15.000Z');
    await until(() => test.openings.length === 3, 'the microphone to reopen again');
    test.openings[2]?.handlers.pcm(new Int16Array(CHUNK));
    expect(test.sent.at(-1)).toEqual({ kind: 'state', state: null });
    await test.ear.stop();
  });
});

describe('computer ear level, call and speech', () => {
  it('sends a level ten times a second only while the hub watches', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.feed(new Int16Array(CHUNK * 3));
    expect(kinds(test.sent)).toEqual([]);
    test.receive({ kind: 'level', watched: true });
    test.feed(Int16Array.from({ length: CHUNK * 3 }, () => 3277));
    expect(test.sent).toHaveLength(3);
    const first = test.sent[0];
    expect(first?.kind).toBe('level');
    if (first?.kind === 'level') {
      expect(first.dbfs).toBeCloseTo(-20, 0);
    }
    test.receive({ kind: 'level', watched: false });
    test.feed(new Int16Array(CHUNK));
    expect(test.sent).toHaveLength(3);
    await test.ear.stop();
  });

  it('forwards the microphone to the hub and plays what it says during a call', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf() });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.receive({ kind: 'call', active: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    test.feed(padded(fixture('hw_us1')).subarray(0, CHUNK * 2));
    expect(kinds(test.sent)).toEqual(['mic', 'mic']);
    const spoken = Int16Array.from([1, -2, 3]);
    test.receive({
      kind: 'speak',
      pcm: Buffer.from(spoken.buffer).toString('base64'),
    });
    await until(() => test.spoken.length === 1, 'the speaker write');
    expect([...(test.spoken[0] ?? [])]).toEqual([1, -2, 3]);
    test.receive({ kind: 'call', active: false });
    await until(() => test.speakerEnded.length === 1, 'the speaker to close');
    test.feed(new Int16Array(CHUNK));
    expect(kinds(test.sent)).toEqual(['mic', 'mic']);
    await test.ear.stop();
  }, 30_000);

  it('keeps the microphone open for a call even when listening is off', async () => {
    const test = bench();
    test.receive({ kind: 'call', active: true });
    await until(() => test.openings.length === 1, 'the microphone to open');
    test.receive({ kind: 'call', active: false });
    await until(() => test.openings[0]?.stopped === true, 'the microphone to stop');
    await test.ear.stop();
  });

  it('cuts speech segments and sends them with their loudness when writing down is on', async () => {
    const test = bench();
    test.receive({ kind: 'config', config: configOf({ wake: false, transcribe: true }) });
    await until(() => test.openings.length === 1, 'the microphone to open', 20_000);
    test.feed(padded(fixture('nm_talk')));
    await until(() => test.sent.some((one) => one.kind === 'segment'), 'a speech segment', 20_000);
    const segment = test.sent.find((one) => one.kind === 'segment');
    if (segment?.kind !== 'segment') throw new Error('no segment');
    expect(Date.parse(segment.segment.endedAt)).toBeGreaterThanOrEqual(
      Date.parse(segment.segment.at),
    );
    expect(segment.segment.levelDbfs).toBeLessThan(0);
    expect(pcmOf(segment.segment.pcm).length).toBeGreaterThan(6400);
    await test.ear.stop();
  }, 60_000);
});
