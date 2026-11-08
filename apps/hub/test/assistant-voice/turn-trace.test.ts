import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicMeter } from '../../src/assistant-voice/mic-meter';
import { TurnTimer } from '../../src/assistant-voice/turn-timing';
import type { MeasureFields, MeasureLevel } from '../../src/assistant-voice/turn-timing';
import { MODEL_SILENT_MS, TurnTrace } from '../../src/assistant-voice/turn-trace';

interface Logged {
  readonly event: string;
  readonly fields: MeasureFields;
  readonly level: MeasureLevel;
}

function rig(): {
  readonly trace: TurnTrace;
  readonly logged: Logged[];
  readonly tick: (ms: number) => Promise<void>;
} {
  vi.useFakeTimers();
  let clock = 1000;
  const logged: Logged[] = [];
  const trace = new TurnTrace(
    () => clock,
    (event, fields, level = 'info') => {
      logged.push({ event, fields, level });
    },
    'abc123',
  );
  trace.opened('live-model');
  return {
    trace,
    logged,
    tick: async (ms): Promise<void> => {
      clock += ms;
      await vi.advanceTimersByTimeAsync(ms);
    },
  };
}

function named(logged: readonly Logged[], event: string): Logged[] {
  return logged.filter((entry) => entry.event === event);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('turn timeline', () => {
  it('reports every phase of a turn with its ids when it completes', async () => {
    const { trace, logged, tick } = rig();
    trace.speechEnded();
    await tick(200);
    trace.heard(12);
    await tick(300);
    trace.output('tool');
    trace.toolReceived('c1', 'device_control', false);
    trace.toolStarted('c1');
    await tick(50);
    trace.toolFinished('c1', false);
    trace.resultHanded('c1', 'session');
    await tick(700);
    trace.output('audio');
    trace.audioSent(3);
    await tick(400);
    trace.completed();
    const [line] = named(logged, 'voice.turn_timeline');
    expect(line?.level).toBe('info');
    expect(line?.fields).toMatchObject({
      turnId: 't1',
      provider: 'gemini',
      model: 'live-model',
      warm: 'abc123',
      tools: 1,
      speechEndMs: 0,
      transcriptMs: 200,
      firstOutputMs: 500,
      lastResultMs: 550,
      firstOutputAfterResultMs: 1250,
      firstAudioMs: 1250,
      totalMs: 1650,
      slowestToolMs: 50,
    });
  });

  it('logs each tool call received and handed back with concurrency', async () => {
    const { trace, logged, tick } = rig();
    trace.speechEnded();
    trace.toolReceived('a', 'one', true);
    trace.toolReceived('b', 'two', true);
    await tick(10);
    trace.resultHanded('a', 'session');
    trace.resultHanded('b', 'late_text');
    expect(named(logged, 'voice.tool_received').map((entry) => entry.fields['concurrent'])).toEqual(
      [1, 2],
    );
    const handed = named(logged, 'voice.tool_result_handed');
    expect(handed.map((entry) => entry.level)).toEqual(['info', 'warn']);
    expect(handed[0]?.fields).toMatchObject({ mode: 'session', totalMs: 10, concurrent: 1 });
  });

  it('records the pending turn age and queue depth on a transcript without warning', async () => {
    const { trace, logged, tick } = rig();
    trace.speechEnded();
    trace.toolReceived('a', 'one', false);
    await tick(5000);
    trace.heard(8);
    const [heard] = named(logged, 'voice.transcript_received');
    expect(heard?.level).toBe('debug');
    expect(heard?.fields).toMatchObject({
      turnId: 't1',
      joinedTurn: true,
      pendingMs: 5000,
      queueDepth: 1,
    });
  });
});

describe('model silence', () => {
  it('warns once when a request gets no output within the threshold', async () => {
    const { trace, logged, tick } = rig();
    trace.speechEnded();
    await tick(MODEL_SILENT_MS - 1);
    expect(named(logged, 'voice.model_silent')).toHaveLength(0);
    await tick(1);
    await tick(MODEL_SILENT_MS * 2);
    const warned = named(logged, 'voice.model_silent');
    expect(warned).toHaveLength(1);
    expect(warned[0]?.level).toBe('warn');
    expect(warned[0]?.fields).toMatchObject({ since: 'request', turnId: 't1' });
  });

  it('measures the wait from the last tool result and clears on output', async () => {
    const { trace, logged, tick } = rig();
    trace.speechEnded();
    trace.toolReceived('a', 'one', false);
    trace.output('tool');
    await tick(100);
    trace.resultHanded('a', 'session');
    await tick(MODEL_SILENT_MS);
    expect(named(logged, 'voice.model_silent')[0]?.fields).toMatchObject({
      since: 'tool_result',
      silentMs: MODEL_SILENT_MS,
      lastResultAgeMs: MODEL_SILENT_MS,
    });
    const fresh = rig();
    fresh.trace.speechEnded();
    await fresh.tick(MODEL_SILENT_MS - 100);
    fresh.trace.output('audio');
    await fresh.tick(MODEL_SILENT_MS * 2);
    expect(named(fresh.logged, 'voice.model_silent')).toHaveLength(0);
  });

  it('warns when a turn completes after the call ended', async () => {
    const { trace, logged, tick } = rig();
    trace.speechEnded();
    trace.callEnded('hung_up', 'client_hang_up', { stallCount: 2, longestMs: 900 });
    await tick(30_000);
    trace.completed();
    expect(named(logged, 'voice.turn_after_end')[0]?.level).toBe('warn');
    expect(named(logged, 'voice.model_silent')).toHaveLength(0);
  });
});

describe('call summary', () => {
  it('summarizes turns, tools, slowest turn and ending in one event', async () => {
    const { trace, logged, tick } = rig();
    trace.speechEnded();
    await tick(100);
    trace.output('audio');
    trace.completed();
    trace.speechEnded();
    trace.toolReceived('a', 'one', false);
    await tick(900);
    trace.resultHanded('a', 'session');
    trace.output('audio');
    trace.completed();
    trace.callEnded('hung_up', 'client_hang_up', { stallCount: 3, longestMs: 1500 });
    const [summary] = named(logged, 'voice.call_summary');
    expect(summary?.fields).toMatchObject({
      turns: 2,
      tools: 1,
      slowestTurn: 't2',
      slowestTurnMs: 900,
      micStalls: 3,
      endReason: 'hung_up',
      endedBy: 'person',
      durationMs: 1000,
    });
  });
});

describe('audio gaps', () => {
  it('reports an underrun between audio chunks of the same turn', async () => {
    const { trace, logged, tick } = rig();
    trace.output('audio');
    trace.audioSent(5);
    await tick(2500);
    trace.audioSent(5);
    const [gap] = named(logged, 'voice.audio_gap');
    expect(gap?.fields).toMatchObject({ gapMs: 2400 });
    expect(gap?.level).toBe('debug');
  });
});

describe('microphone stalls', () => {
  it('logs each long stall as it ends and summarizes counters', () => {
    let clock = 0;
    const logged: Logged[] = [];
    const meter = new MicMeter(
      () => clock,
      (event, fields, level = 'info') => {
        logged.push({ event, fields, level });
      },
    );
    const chunk = new Int16Array(320);
    meter.heard(chunk, false);
    clock += 20;
    meter.heard(chunk, false);
    clock += 4020;
    meter.heard(chunk, true);
    meter.summarize();
    const [stall] = named(logged, 'voice.mic_stalled');
    expect(stall?.level).toBe('warn');
    expect(stall?.fields).toMatchObject({ lengthMs: 4000, count: 1 });
    expect(named(logged, 'voice.mic_summarized')[0]?.fields).toMatchObject({
      stalls: 1,
      longestStallMs: 4000,
      chunks: 3,
      forwardedChunks: 2,
      droppedChunks: 1,
    });
  });

  it('keeps the existing summary fields unchanged', () => {
    const logged: Logged[] = [];
    const meter = new MicMeter(
      () => 0,
      (event, fields, level = 'info') => {
        logged.push({ event, fields, level });
      },
    );
    meter.summarize();
    const fields = named(logged, 'voice.mic_summarized')[0]?.fields ?? {};
    for (const name of ['forwardedMs', 'droppedMs', 'stalls', 'longestStallMs']) {
      expect(fields).toHaveProperty(name);
    }
    expect(
      new TurnTimer(
        () => 0,
        () => undefined,
        () => null,
      ),
    ).toBeDefined();
  });
});
