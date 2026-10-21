import { describe, expect, it } from 'vitest';
import { EchoProbe } from '../../src/assistant-voice/echo-probe';
import { MicMeter } from '../../src/assistant-voice/mic-meter';
import { TurnTimer } from '../../src/assistant-voice/turn-timing';

const CHUNK_MS = 20;
const MIC_CHUNK = 320;
const LIVE_CHUNK = 480;

interface Logged {
  readonly event: string;
  readonly fields: Readonly<Record<string, number | string>>;
}

function tone(samples: number, amplitude: number): Int16Array {
  return Int16Array.from({ length: samples }, (_, index) =>
    Math.round(amplitude * Math.sin(index * 0.3)),
  );
}

function envelope(index: number): number {
  return 2000 + 6000 * Math.abs(Math.sin(index * 0.37) * Math.cos(index * 0.11));
}

function simulate(lagMs: number): Logged[] {
  let clock = 0;
  const logged: Logged[] = [];
  const meter = new MicMeter(
    () => clock,
    (event, fields) => {
      logged.push({ event, fields });
    },
  );
  const burstChunks = 200;
  for (let index = 0; index < burstChunks; index++) {
    meter.played(tone(LIVE_CHUNK, envelope(index)));
  }
  const audibleUntil = burstChunks * CHUNK_MS + 2800;
  for (let step = 0; step < 400; step++) {
    clock = step * CHUNK_MS + CHUNK_MS;
    const echoIndex = Math.floor((clock - lagMs) / CHUNK_MS);
    const amplitude = echoIndex >= 0 && echoIndex < burstChunks ? envelope(echoIndex) * 0.2 : 40;
    meter.heard(tone(MIC_CHUNK, amplitude), clock <= audibleUntil);
  }
  meter.summarize();
  return logged;
}

describe('echo measurement', () => {
  it('finds the delay between playback and the microphone', () => {
    const echo = simulate(640).find((entry) => entry.event === 'voice.echo_measured');
    expect(echo).toBeDefined();
    expect(Math.abs(Number(echo?.fields['lagMs']) - 640)).toBeLessThanOrEqual(80);
    expect(Number(echo?.fields['correlation'])).toBeGreaterThan(0.8);
  });

  it('reports how long the microphone was dropped and how loud it was', () => {
    const logged = simulate(640);
    const gated = logged.find((entry) => entry.event === 'voice.mic_gated');
    expect(Number(gated?.fields['droppedMs'])).toBeGreaterThan(6000);
    const summary = logged.find((entry) => entry.event === 'voice.mic_summarized');
    expect(summary?.fields['stalls']).toBe(0);
  });

  it('counts a stall in the microphone arrival', () => {
    let clock = 0;
    const logged: Logged[] = [];
    const meter = new MicMeter(
      () => clock,
      (event, fields) => {
        logged.push({ event, fields });
      },
    );
    [20, 40, 400, 420].forEach((at) => {
      clock = at;
      meter.heard(tone(MIC_CHUNK, 500), false);
    });
    meter.summarize();
    const summary = logged.find((entry) => entry.event === 'voice.mic_summarized');
    expect(summary?.fields).toMatchObject({ stalls: 1, longestStallMs: 340 });
  });

  it('gives nothing when too little was played', () => {
    const probe = new EchoProbe(() => 1000, 24_000);
    probe.play(tone(LIVE_CHUNK, 1000));
    expect(probe.estimate()).toBeNull();
  });
});

describe('turn timing', () => {
  it('measures from the last transcript to the first audio and adds tool time', () => {
    let clock = 1000;
    const logged: Logged[] = [];
    const timer = new TurnTimer(
      () => clock,
      (event, fields) => {
        logged.push({ event, fields });
      },
      () => 900,
    );
    timer.heard();
    clock = 1500;
    timer.heard();
    clock = 2000;
    timer.tool('sight_look', 1600);
    clock = 2600;
    timer.spoke();
    expect(logged.map((entry) => entry.event)).toEqual(['voice.tool_timed', 'voice.turn_timed']);
    expect(logged[0]?.fields).toEqual({ tool: 'sight_look', ms: 400 });
    expect(logged[1]?.fields).toEqual({
      toolMs: 400,
      tools: 1,
      sinceTranscriptMs: 1100,
      transcriptSpanMs: 500,
      sinceVoiceMs: 900,
    });
  });
});

describe('echo measurement without the gate', () => {
  it('measures the echo from a microphone that is never dropped', () => {
    let clock = 0;
    const logged: Logged[] = [];
    const meter = new MicMeter(
      () => clock,
      (event, fields) => {
        logged.push({ event, fields });
      },
    );
    for (let index = 0; index < 200; index++) {
      meter.played(tone(LIVE_CHUNK, envelope(index)));
    }
    for (let step = 0; step < 400; step++) {
      clock = step * CHUNK_MS + CHUNK_MS;
      const echoIndex = Math.floor((clock - 640) / CHUNK_MS);
      const amplitude = echoIndex >= 0 && echoIndex < 200 ? envelope(echoIndex) * 0.2 : 40;
      meter.heard(tone(MIC_CHUNK, amplitude), false);
    }
    meter.summarize();
    const echo = logged.find((entry) => entry.event === 'voice.echo_measured');
    expect(Math.abs(Number(echo?.fields['lagMs']) - 640)).toBeLessThanOrEqual(80);
    expect(logged.some((entry) => entry.event === 'voice.mic_gated')).toBe(false);
  });
});
