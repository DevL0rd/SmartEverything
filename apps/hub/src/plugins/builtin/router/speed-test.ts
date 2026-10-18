import { Logger, describeFailure } from '@smarteverything/logging';
import { randomUUID } from 'node:crypto';
import type { SpeedTestProgress, SpeedTestResult } from '@smarteverything/domain';
import { roundTo } from './frame-math';

const log = new Logger('hub.router-speed-test');

const BASE_URL = 'https://speed.cloudflare.com';
const DOWNLOAD_BYTES = 50_000_000;
const UPLOAD_CHUNK_BYTES = 2_000_000;
const PHASE_SECONDS = 8;
const LATENCY_SAMPLES = 12;
const REQUEST_TIMEOUT_MS = 5_000;
const PROGRESS_EVERY_MS = 500;

export class SpeedTestError extends Error {
  override readonly name = 'SpeedTestError';
}

type Progress = (progress: SpeedTestProgress) => void;

export async function runSpeedTest(
  onProgress: Progress,
  signal: AbortSignal,
): Promise<SpeedTestResult> {
  onProgress({ phase: 'ping', mbps: 0, pingMs: null, downloadMbps: null, reason: null });
  const latency = await measureLatency(signal);
  const downloadMbps = await measureDownload((mbps) => {
    onProgress({
      phase: 'download',
      mbps,
      pingMs: latency.pingMs,
      downloadMbps: null,
      reason: null,
    });
  }, signal);
  if (downloadMbps === 0) {
    throw new SpeedTestError('The download test received no data');
  }
  const uploadMbps = await measureUpload((mbps) => {
    onProgress({ phase: 'upload', mbps, pingMs: latency.pingMs, downloadMbps, reason: null });
  }, signal);
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    server: 'Cloudflare',
    downloadMbps,
    uploadMbps,
    ...latency,
  };
}

interface Latency {
  readonly pingMs: number;
  readonly jitterMs: number;
  readonly packetLossPercent: number;
}

async function measureLatency(signal: AbortSignal): Promise<Latency> {
  const samples: number[] = [];
  for (let index = 0; index < LATENCY_SAMPLES; index += 1) {
    const started = performance.now();
    const ok = await fetch(`${BASE_URL}/__down?bytes=0`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    }).then(
      async (response) => {
        await response.arrayBuffer();
        return response.ok;
      },
      () => false,
    );
    if (ok) {
      samples.push(performance.now() - started);
    }
  }
  if (samples.length === 0) {
    throw new SpeedTestError('Cloudflare could not be reached');
  }
  return {
    pingMs: roundTo(Math.min(...samples), 1),
    jitterMs: roundTo(jitterOf(samples), 1),
    packetLossPercent: roundTo((100 * (LATENCY_SAMPLES - samples.length)) / LATENCY_SAMPLES, 1),
  };
}

function jitterOf(samples: readonly number[]): number {
  if (samples.length < 2) {
    return 0;
  }
  const steps = samples
    .slice(1)
    .map((sample, index) => Math.abs(sample - (samples[index] ?? sample)));
  return steps.reduce((total, step) => total + step, 0) / steps.length;
}

class Meter {
  #bytes = 0;
  #lastReport = 0;
  readonly #started = performance.now();

  constructor(private readonly report: (mbps: number) => void) {}

  get mbps(): number {
    const seconds = (performance.now() - this.#started) / 1000;
    return seconds > 0 ? roundTo((this.#bytes * 8) / seconds / 1e6, 1) : 0;
  }

  get expired(): boolean {
    return performance.now() - this.#started >= PHASE_SECONDS * 1000;
  }

  add(bytes: number): void {
    this.#bytes += bytes;
    if (performance.now() - this.#lastReport >= PROGRESS_EVERY_MS) {
      this.#lastReport = performance.now();
      this.report(this.mbps);
    }
  }
}

async function measureDownload(
  report: (mbps: number) => void,
  signal: AbortSignal,
): Promise<number> {
  const meter = new Meter(report);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(PHASE_SECONDS * 1000)]);
  while (!meter.expired && !signal.aborted) {
    const interrupted = (): null => {
      if (deadline.aborted) {
        return null;
      }
      throw new SpeedTestError('The download test was interrupted');
    };
    const response = await fetch(`${BASE_URL}/__down?bytes=${String(DOWNLOAD_BYTES)}`, {
      signal: deadline,
    }).catch(interrupted);
    if (response === null) {
      break;
    }
    if (!response.ok || response.body === null) {
      throw new SpeedTestError(`Cloudflare answered with HTTP ${String(response.status)}`);
    }
    await countBody(response.body, meter).catch(interrupted);
  }
  return meter.mbps;
}

async function countBody(body: ReadableStream<Uint8Array>, meter: Meter): Promise<void> {
  for await (const chunk of body) {
    meter.add(chunk.byteLength);
  }
}

async function measureUpload(report: (mbps: number) => void, signal: AbortSignal): Promise<number> {
  const meter = new Meter(report);
  const payload = new Uint8Array(UPLOAD_CHUNK_BYTES);
  while (!meter.expired && !signal.aborted) {
    const response = await fetch(`${BASE_URL}/__up`, {
      method: 'POST',
      body: payload,
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS * 4)]),
    }).catch((cause: unknown) => {
      log.warn('upload.request_failed', { error: describeFailure(cause).message });
      return null;
    });
    if (response?.ok !== true) {
      throw new SpeedTestError('The upload test was interrupted');
    }
    await response.arrayBuffer();
    meter.add(UPLOAD_CHUNK_BYTES);
  }
  return meter.mbps;
}
