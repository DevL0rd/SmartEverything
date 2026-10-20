import type {
  EarCodec,
  EarSource,
  ListeningConfig,
  RemoteEarNodeMessage,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EarEngine } from '../../../src/node/ear/ear-engine';
import { EarHost } from '../../../src/node/ear/ear-host';
import { pcmOf } from '../../../src/node/ear/ear-audio';
import { FakeClock } from '../../support/fake-clock';
import { captureLogs, type CapturedLogs } from '../../support/logs';
import { until } from '../../support/wait';
import { configOf, earRig, packetsOf, tone, type EarRig } from './ear-fakes';

const START = '2026-10-18T10:00:00.000Z';
const PACKET_MS = 20;

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(() => {
  Logger.reset();
});

interface Sent {
  readonly key: string;
  readonly message: RemoteEarNodeMessage;
}

class Bench {
  readonly rig: EarRig = earRig();
  readonly clock = new FakeClock(START);
  readonly sent: Sent[] = [];
  readonly scored: { readonly id: string; readonly heard: boolean }[] = [];
  readonly scoreFailures: { readonly id: string; readonly reason: string }[] = [];
  readonly host = new EarHost(
    { engine: this.rig.engine, clock: this.clock, log: new Logger('hub.node-ear') },
    (key, message) => {
      this.sent.push({ key, message });
    },
    (id, heard) => {
      this.scored.push({ id, heard });
    },
    (id, reason) => {
      this.scoreFailures.push({ id, reason });
    },
  );

  open(
    kind: EarSource['kind'],
    key: string,
    config: ListeningConfig = configOf(),
    codec: EarCodec = 'opus_48k_mono',
  ): void {
    this.host.receive({ type: 'ears_open', source: { kind, key }, codec, config });
  }

  async listening(count: number): Promise<void> {
    await until(
      () => logs.events().filter((event) => event === 'ear_host.listening').length === count,
      `${String(count)} ears to listen`,
    );
  }

  feed(key: string, packets: readonly string[]): void {
    for (const packet of packets) {
      this.host.receive({ type: 'ears_audio', key, packets: [packet] });
      this.clock.advanceTo(new Date(this.clock.now().getTime() + PACKET_MS).toISOString());
    }
  }

  messagesOf(key: string, kind: RemoteEarNodeMessage['kind']): RemoteEarNodeMessage[] {
    return this.sent
      .filter((one) => one.key === key && one.message.kind === kind)
      .map((one) => one.message);
  }
}

const speech = (ms: number, channels = 1): string[] =>
  packetsOf(tone(ms, 6000, channels), channels);

describe('ear host claims', () => {
  it('claims for the opened source with its loudness and the audio before the word', async () => {
    const bench = new Bench();
    bench.rig.keywords.wakeAfterSamples = 8000;
    bench.open('camera', 'living');
    await bench.listening(1);
    bench.feed('living', speech(700));
    const [claim] = bench.messagesOf('living', 'claim');
    expect(claim?.kind).toBe('claim');
    if (claim?.kind !== 'claim') return;
    expect(claim.claim.phrase).toBe('hey jarvis');
    expect(claim.claim.snippetDbfs).toBeGreaterThan(-20);
    expect(claim.claim.snippetDbfs).toBeLessThan(-15);
    expect(pcmOf(claim.claim.preroll)).toHaveLength(8000);
    expect(bench.sent.every((one) => one.key === 'living')).toBe(true);
    await bench.host.stop();
  });

  it('listens with the keyword lines and thresholds the hub sent', async () => {
    const bench = new Bench();
    bench.open(
      'talk',
      'message-1',
      configOf({ keywords: ['a b @one', 'c d @two'], threshold: 0.1, nearMissThreshold: 0.04 }),
    );
    await bench.listening(1);
    bench.feed('message-1', speech(40));
    expect(bench.rig.keywords.listens).toEqual([
      { keywords: 'a b @one\nc d @two', threshold: 0.1, label: 'standard' },
    ]);
    expect(bench.rig.keywords.nears).toEqual([
      { keywords: 'a b @one\nc d @two', threshold: 0.04, label: 'standard' },
    ]);
    await bench.host.stop();
  });

  it('hears stereo Opus as the same loudness as mono', async () => {
    const bench = new Bench();
    bench.rig.keywords.wakeAfterSamples = 8000;
    bench.open('voice_call', 'ann', configOf(), 'opus_48k_stereo');
    await bench.listening(1);
    bench.feed('ann', speech(700, 2));
    const [claim] = bench.messagesOf('ann', 'claim');
    expect(claim?.kind === 'claim' && claim.claim.snippetDbfs).toBeGreaterThan(-20);
    expect(claim?.kind === 'claim' && claim.claim.snippetDbfs).toBeLessThan(-15);
    await bench.host.stop();
  });

  it('keeps every open source apart by its key', async () => {
    const bench = new Bench();
    bench.rig.keywords.wakeAfterSamples = 8000;
    bench.open('camera', 'living');
    bench.open('talk', 'message-1');
    await bench.listening(2);
    bench.feed('living', speech(700));
    expect(bench.messagesOf('living', 'claim')).toHaveLength(1);
    expect(bench.messagesOf('message-1', 'claim')).toEqual([]);
    bench.feed('message-1', speech(700));
    expect(bench.messagesOf('message-1', 'claim')).toHaveLength(1);
    await bench.host.stop();
  });
});

describe('ear host near misses', () => {
  it('tells the hub about a phrase that scored just under the threshold', async () => {
    const bench = new Bench();
    bench.rig.keywords.nearAfterSamples = 8000;
    bench.open('camera', 'living');
    await bench.listening(1);
    bench.feed('living', speech(700));
    expect(bench.messagesOf('living', 'near')).toEqual([{ kind: 'near', phrase: 'hey jarvis' }]);
    expect(bench.messagesOf('living', 'claim')).toEqual([]);
    await bench.host.stop();
  });

  it('does not call a near hit that follows a real wake a near miss', async () => {
    const bench = new Bench();
    bench.rig.keywords.wakeAfterSamples = 8000;
    bench.rig.keywords.nearAfterSamples = 12_000;
    bench.open('camera', 'living');
    await bench.listening(1);
    bench.feed('living', speech(900));
    expect(bench.messagesOf('living', 'claim')).toHaveLength(1);
    expect(bench.messagesOf('living', 'near')).toEqual([]);
    await bench.host.stop();
  });
});

describe('ear host config and rest', () => {
  it('stops listening while rested, ignores audio, and resumes on the next config', async () => {
    const bench = new Bench();
    bench.rig.keywords.wakeAfterSamples = 8000;
    bench.open('camera', 'living');
    await bench.listening(1);
    bench.host.receive({
      type: 'ears',
      key: 'living',
      ear: { kind: 'rest', reason: 'conversation' },
    });
    await until(() => bench.rig.keywords.openStreams === 0, 'the spotter to be freed');
    bench.feed('living', speech(700));
    expect(bench.sent).toEqual([]);
    bench.host.receive({
      type: 'ears',
      key: 'living',
      ear: { kind: 'config', config: configOf() },
    });
    await bench.listening(2);
    bench.feed('living', speech(700));
    expect(bench.messagesOf('living', 'claim')).toHaveLength(1);
    await bench.host.stop();
  });

  it('keeps the running ear for an identical config and swaps it for a new one', async () => {
    const bench = new Bench();
    bench.open('camera', 'living');
    await bench.listening(1);
    bench.host.receive({
      type: 'ears',
      key: 'living',
      ear: { kind: 'config', config: configOf() },
    });
    bench.host.receive({
      type: 'ears',
      key: 'living',
      ear: { kind: 'config', config: configOf({ keywords: ['x y @other'] }) },
    });
    await bench.listening(2);
    bench.feed('living', speech(40));
    expect(bench.rig.keywords.listens.map((one) => one.keywords)).toEqual(['x y @other']);
    await bench.host.stop();
    expect(bench.rig.models.every((model) => model.released === 1)).toBe(true);
  });

  it('listens for nothing when neither wake nor writing down is on', async () => {
    const bench = new Bench();
    bench.open('camera', 'living', configOf({ wake: false, transcribe: false }));
    await bench.host.stop();
    expect(bench.rig.models).toEqual([]);
    expect(logs.events()).not.toContain('ear_host.listening');
  });

  it('logs a superseded wake and keeps listening', async () => {
    const bench = new Bench();
    bench.open('camera', 'living');
    await bench.listening(1);
    bench.host.receive({
      type: 'ears',
      key: 'living',
      ear: { kind: 'superseded', superseded: { winner: { source: 'voice_call', key: 'ann' } } },
    });
    expect(logs.events()).toContain('ear_host.superseded');
    bench.feed('living', speech(40));
    expect(bench.rig.keywords.openStreams).toBeGreaterThan(0);
    await bench.host.stop();
  });
});

describe('ear host close', () => {
  it('frees the spotter and the speech model of a closed source and sends nothing more', async () => {
    const bench = new Bench();
    bench.rig.keywords.wakeAfterSamples = 8000;
    bench.open('camera', 'living');
    bench.open('camera', 'kitchen');
    await bench.listening(2);
    bench.host.receive({ type: 'ears_close', key: 'living' });
    await until(
      () => bench.rig.models.filter((model) => model.released === 1).length === 1,
      'the close',
    );
    await until(() => bench.messagesOf('living', 'closed').length === 1, 'the closed message');
    bench.feed('living', speech(700));
    expect(bench.sent).toEqual([{ key: 'living', message: { kind: 'closed' } }]);
    bench.feed('kitchen', speech(700));
    expect(bench.messagesOf('kitchen', 'claim')).toHaveLength(1);
    await bench.host.stop();
  });

  it('frees every ear when the host stops', async () => {
    const bench = new Bench();
    bench.open('camera', 'living');
    bench.open('talk', 'message-1');
    bench.open('voice_call', 'ann', configOf(), 'opus_48k_stereo');
    await bench.listening(3);
    bench.feed('living', speech(40));
    bench.feed('message-1', speech(40));
    bench.feed('ann', speech(40, 2));
    expect(bench.rig.keywords.openStreams).toBeGreaterThan(0);
    await bench.host.stop();
    expect(bench.rig.keywords.openStreams).toBe(0);
    expect(bench.rig.models.map((model) => model.released)).toEqual([1, 1, 1]);
    bench.feed('living', speech(700));
    expect(bench.sent).toEqual([]);
  });

  it('replaces an ear opened twice under the same key', async () => {
    const bench = new Bench();
    bench.open('camera', 'living');
    await bench.listening(1);
    bench.open('camera', 'living');
    await bench.listening(2);
    expect(logs.events()).toContain('ear_host.reopened');
    await until(
      () => bench.rig.models.filter((model) => model.released === 1).length === 1,
      'the first ear to close',
    );
    await bench.host.stop();
  });

  it('names audio, messages and closes for a key it does not host', async () => {
    const bench = new Bench();
    bench.feed('ghost', speech(40));
    bench.host.receive({
      type: 'ears',
      key: 'ghost',
      ear: { kind: 'rest', reason: 'switched_off' },
    });
    bench.host.receive({ type: 'ears_close', key: 'ghost' });
    expect(bench.messagesOf('ghost', 'closed')).toHaveLength(1);
    expect(logs.events()).toEqual(
      expect.arrayContaining([
        'ear_host.audio_without_ear',
        'ear_host.message_without_ear',
        'ear_host.close_without_ear',
      ]),
    );
    await bench.host.stop();
  });
});

describe('ear host closing', () => {
  it('finishes the sentence in progress before it says it is closed', async () => {
    const bench = new Bench();
    bench.open('talk', 'message-1', configOf({ wake: false, transcribe: true }));
    await bench.listening(1);
    const model = bench.rig.models[0];
    if (model === undefined) throw new Error('no speech model');
    model.speech = true;
    bench.feed('message-1', speech(1500));
    await new Promise((resolve) => setTimeout(resolve, 50));
    model.speech = false;
    expect(bench.messagesOf('message-1', 'segment')).toEqual([]);
    bench.host.receive({ type: 'ears_close', key: 'message-1' });
    await until(() => bench.messagesOf('message-1', 'closed').length === 1, 'the closed message');
    const kinds = bench.sent.map((one) => one.message.kind);
    expect(kinds.indexOf('segment')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('segment')).toBeLessThan(kinds.indexOf('closed'));
    await bench.host.stop();
  });

  it('hands over a sentence still being spoken when the source closes, with no silence fed', async () => {
    const bench = new Bench();
    bench.open('talk', 'message-1', configOf({ wake: false, transcribe: true }));
    await bench.listening(1);
    const model = bench.rig.models[0];
    if (model === undefined) throw new Error('no speech model');
    model.speech = true;
    bench.feed('message-1', speech(1500));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bench.messagesOf('message-1', 'segment')).toEqual([]);
    bench.host.receive({ type: 'ears_close', key: 'message-1' });
    await until(() => bench.messagesOf('message-1', 'closed').length === 1, 'the closed message');
    expect(bench.messagesOf('message-1', 'segment')).toHaveLength(1);
    await bench.host.stop();
  });

  it('says closed once the ear is freed even when closing fails', async () => {
    const bench = new Bench();
    bench.open('camera', 'living');
    await bench.listening(1);
    const model = bench.rig.models[0];
    if (model === undefined) throw new Error('no speech model');
    model.release = (): Promise<void> => Promise.reject(new Error('release failed'));
    bench.host.receive({ type: 'ears_close', key: 'living' });
    await until(() => bench.messagesOf('living', 'closed').length === 1, 'the closed message');
    expect(logs.events()).toContain('ear_host.reconcile_failed');
    await bench.host.stop();
  });
});

describe('ear host scoring', () => {
  it.each([true, false])(
    'answers a score request with whether the spotter heard it (%s)',
    async (heard) => {
      const bench = new Bench();
      bench.rig.keywords.hearsAnything = heard;
      const pcm = new Int16Array([1, 2, 3, 4]);
      bench.host.receive({
        type: 'ears_score',
        id: 'one',
        keywords: ['a b @one', 'c d @two'],
        threshold: 0.06,
        pcm: Buffer.from(pcm.buffer).toString('base64'),
      });
      await until(() => bench.scored.length === 1, 'the score');
      expect(bench.scored).toEqual([{ id: 'one', heard }]);
      expect(bench.rig.keywords.scored).toEqual([
        { keywords: 'a b @one\nc d @two', threshold: 0.06, label: '4' },
      ]);
      await bench.host.stop();
    },
  );
});

describe('ear host scoring failures', () => {
  const request = (id: string): Parameters<EarHost['receive']>[0] => ({
    type: 'ears_score',
    id,
    keywords: ['a b @one'],
    threshold: 0.06,
    pcm: Buffer.from(new Int16Array([1, 2]).buffer).toString('base64'),
  });

  it('answers with the failure when the spotter rejects the speech', async () => {
    const bench = new Bench();
    bench.rig.keywords.hearsFailure = new Error('sherpa blew up');
    bench.host.receive(request('one'));
    await until(() => bench.scoreFailures.length === 1, 'the failure answer');
    expect(bench.scoreFailures).toEqual([{ id: 'one', reason: 'sherpa blew up' }]);
    expect(bench.scored).toEqual([]);
    expect(logs.events()).toContain('ear_host.score_failed');
    await bench.host.stop();
  });

  it('answers with the failure when the engine has no spotter to build', async () => {
    const bench = new Bench();
    const failing = new EarEngine({
      spotter: (): never => {
        throw new Error('engine not loaded');
      },
      model: bench.rig.engine.model,
    });
    const host = new EarHost(
      { engine: failing, clock: bench.clock, log: new Logger('hub.node-ear') },
      () => undefined,
      (id, heard) => {
        bench.scored.push({ id, heard });
      },
      (id, reason) => {
        bench.scoreFailures.push({ id, reason });
      },
    );
    host.receive(request('two'));
    await until(() => bench.scoreFailures.length === 1, 'the failure answer');
    expect(bench.scoreFailures).toEqual([{ id: 'two', reason: 'engine not loaded' }]);
    expect(bench.scored).toEqual([]);
    await host.stop();
  });
});

describe('ear host speech segments', () => {
  it('cuts what was said into a segment with its loudness when writing down is on', async () => {
    const bench = new Bench();
    bench.open('talk', 'message-1', configOf({ wake: false, transcribe: true }));
    await bench.listening(1);
    const model = bench.rig.models[0];
    if (model === undefined) throw new Error('no speech model');
    model.speech = true;
    bench.feed('message-1', speech(1500));
    await new Promise((resolve) => setTimeout(resolve, 50));
    model.speech = false;
    bench.feed('message-1', speech(1000));
    await until(() => bench.messagesOf('message-1', 'segment').length === 1, 'a speech segment');
    const [segment] = bench.messagesOf('message-1', 'segment');
    if (segment?.kind !== 'segment') throw new Error('no segment');
    expect(segment.segment.levelDbfs).toBeGreaterThan(-20);
    expect(segment.segment.levelDbfs).toBeLessThan(-15);
    expect(Date.parse(segment.segment.endedAt)).toBeGreaterThan(Date.parse(segment.segment.at));
    expect(pcmOf(segment.segment.pcm).length).toBeGreaterThan(16_000);
    await bench.host.stop();
  });

  it('writes nothing down when only the wake word is on', async () => {
    const bench = new Bench();
    bench.open('talk', 'message-1', configOf({ wake: true, transcribe: false }));
    await bench.listening(1);
    const model = bench.rig.models[0];
    if (model === undefined) throw new Error('no speech model');
    model.speech = true;
    bench.feed('message-1', speech(1500));
    await new Promise((resolve) => setTimeout(resolve, 50));
    model.speech = false;
    bench.feed('message-1', speech(1000));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bench.messagesOf('message-1', 'segment')).toEqual([]);
    await bench.host.stop();
  });
});
