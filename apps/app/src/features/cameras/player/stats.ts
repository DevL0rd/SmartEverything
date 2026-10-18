import { z } from 'zod';
import { count, decimal, withUnit } from '../../../format/number';

export const STATS_EVERY_MS = 2000;

const INBOUND_VIDEO = z.object({
  type: z.literal('inbound-rtp'),
  kind: z.literal('video').optional(),
  mediaType: z.literal('video').optional(),
  timestamp: z.number(),
  bytesReceived: z.number(),
  frameWidth: z.number().optional(),
  frameHeight: z.number().optional(),
  framesPerSecond: z.number().optional(),
  packetsLost: z.number().optional(),
  packetsReceived: z.number().optional(),
  framesDecoded: z.number().optional(),
});

export interface StreamSample {
  readonly at: number;
  readonly bytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly fps: number | null;
  readonly lost: number;
  readonly received: number;
  readonly framesDecoded: number | null;
}

export interface StreamStats {
  readonly kbps: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly fps: number | null;
  readonly lossPercent: number | null;
}

function isReportMap(report: unknown): report is ReadonlyMap<unknown, unknown> {
  return report instanceof Map;
}

function entriesOf(report: unknown): readonly unknown[] {
  if (isReportMap(report)) {
    return [...report.values()];
  }
  const record = z.record(z.string(), z.unknown()).safeParse(report);
  return record.success ? Object.values(record.data) : [];
}

type InboundVideo = z.infer<typeof INBOUND_VIDEO>;

function sampleFrom(inbound: InboundVideo): StreamSample {
  return {
    at: inbound.timestamp,
    bytes: inbound.bytesReceived,
    width: inbound.frameWidth ?? null,
    height: inbound.frameHeight ?? null,
    fps: inbound.framesPerSecond ?? null,
    lost: inbound.packetsLost ?? 0,
    received: inbound.packetsReceived ?? 0,
    framesDecoded: inbound.framesDecoded ?? null,
  };
}

export function sampleOf(report: unknown): StreamSample | null {
  for (const entry of entriesOf(report)) {
    const inbound = INBOUND_VIDEO.safeParse(entry);
    if (inbound.success && (inbound.data.kind === 'video' || inbound.data.mediaType === 'video')) {
      return sampleFrom(inbound.data);
    }
  }
  return null;
}

function rateOf(previous: StreamSample | null, current: StreamSample): number | null {
  if (previous === null || current.at <= previous.at || current.bytes < previous.bytes) {
    return null;
  }
  return ((current.bytes - previous.bytes) * 8) / (current.at - previous.at);
}

function lossOf(current: StreamSample): number | null {
  const total = current.lost + current.received;
  return total === 0 ? null : (current.lost / total) * 100;
}

export function statsBetween(previous: StreamSample | null, current: StreamSample): StreamStats {
  return {
    kbps: rateOf(previous, current),
    width: current.width,
    height: current.height,
    fps: current.fps,
    lossPercent: lossOf(current),
  };
}

export function bitrateText(kbps: number): string {
  return kbps >= 1000 ? withUnit(decimal(kbps / 1000, 1), 'Mb/s') : withUnit(count(kbps), 'kb/s');
}

export function resolutionText(stats: Pick<StreamStats, 'width' | 'height'>): string | null {
  if (stats.width === null || stats.height === null) {
    return null;
  }
  return `${String(stats.width)}×${String(stats.height)}`;
}

export function statsText(stats: StreamStats | null): string | null {
  if (stats === null) {
    return null;
  }
  const parts = [
    resolutionText(stats),
    stats.kbps === null ? null : bitrateText(stats.kbps),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}
