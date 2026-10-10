import { TALK_SAMPLE_RATE, type EchoTestOutcome } from '@smarteverything/domain';
import type { HeardFrame } from './speech-gate';

const BASELINE_MS = 800;
const TAIL_MS = 300;
const PROBE_SECONDS = 2.2;
const SWEEP_FROM_HZ = 300;
const SWEEP_TO_HZ = 3000;
const SYLLABLE_HZ = 4;
const PEAK = 0.45;
const FADE_SECONDS = 0.03;
const MIN_FRAMES = 20;
const NOISY_LEVEL = 0.06;
const SOME_EXCESS = 0.012;
const STRONG_EXCESS = 0.05;
const SOME_PROBABILITY = 0.5;
const STRONG_PROBABILITY = 0.8;
const MEDIAN = 0.5;
const HIGH = 0.9;

export interface EchoMeasurement {
  readonly frames: number;
  readonly floor: number;
  readonly noisy: number;
  readonly residual: number;
  readonly probability: number;
}

export interface EchoPorts {
  readonly observe: (listener: (frame: HeardFrame) => void) => (() => void) | null;
  readonly probe: (samples: Float32Array<ArrayBuffer>, sampleRate: number) => Promise<void>;
}

export class EchoTestUnavailableError extends Error {
  override readonly name = 'EchoTestUnavailableError';
}

export function probeSignal(sampleRate: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.round(PROBE_SECONDS * sampleRate));
  let phase = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const seconds = index / sampleRate;
    const sweep = SWEEP_FROM_HZ + (SWEEP_TO_HZ - SWEEP_FROM_HZ) * (seconds / PROBE_SECONDS);
    phase += (2 * Math.PI * sweep) / sampleRate;
    const syllable = 0.5 - 0.5 * Math.cos(2 * Math.PI * SYLLABLE_HZ * seconds);
    const fade = Math.min(1, seconds / FADE_SECONDS, (PROBE_SECONDS - seconds) / FADE_SECONDS);
    samples[index] = PEAK * syllable * fade * Math.sin(phase);
  }
  return samples;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function measurementOf(
  frames: readonly HeardFrame[],
  probeAt: number,
  probeEnd: number,
): EchoMeasurement {
  const quiet = frames.filter((frame) => frame.at < probeAt).map((frame) => frame.level);
  const heard = frames.filter((frame) => frame.at >= probeAt && frame.at <= probeEnd);
  return {
    frames: Math.min(quiet.length, heard.length),
    floor: percentile(quiet, MEDIAN),
    noisy: percentile(quiet, HIGH),
    residual: percentile(
      heard.map((frame) => frame.level),
      HIGH,
    ),
    probability: Math.max(0, ...heard.map((frame) => frame.probability)),
  };
}

export async function measureEcho(ports: EchoPorts): Promise<EchoMeasurement> {
  const frames: HeardFrame[] = [];
  const stop = ports.observe((frame) => {
    frames.push(frame);
  });
  if (stop === null) {
    throw new EchoTestUnavailableError('The microphone is not listening yet');
  }
  try {
    await delay(BASELINE_MS);
    const probeAt = performance.now();
    await ports.probe(probeSignal(TALK_SAMPLE_RATE), TALK_SAMPLE_RATE);
    const probeEnd = performance.now() + TAIL_MS;
    await delay(TAIL_MS);
    return measurementOf(frames, probeAt, probeEnd);
  } finally {
    stop();
  }
}

export function outcomeOf(measurement: EchoMeasurement): EchoTestOutcome {
  if (measurement.frames < MIN_FRAMES || measurement.noisy > NOISY_LEVEL) {
    return 'failed';
  }
  const excess = measurement.residual - measurement.floor;
  if (measurement.probability >= STRONG_PROBABILITY || excess > STRONG_EXCESS) {
    return 'strong';
  }
  return measurement.probability >= SOME_PROBABILITY || excess > SOME_EXCESS ? 'some' : 'none';
}
