import type { SpeedTestResult } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { dailyTests, gaugeMax, lineShare, speedHistory } from './speed-model';

function localAt(day: number, hour: number): string {
  return new Date(2026, 9, day, hour).toISOString();
}

function test(at: string, downloadMbps: number): SpeedTestResult {
  return {
    id: crypto.randomUUID(),
    at,
    server: 'Local',
    downloadMbps,
    uploadMbps: downloadMbps / 10,
    pingMs: 8,
    jitterMs: 1,
    packetLossPercent: 0,
  };
}

describe('speed test history', () => {
  it('keeps the newest test of each day, oldest day first', () => {
    const tests = [
      test(localAt(16, 18), 300),
      test(localAt(16, 9), 200),
      test(localAt(14, 12), 100),
    ];
    expect(dailyTests(tests).map((entry) => entry.downloadMbps)).toEqual([100, 300]);
  });

  it('draws one point per day for download and upload', () => {
    const series = speedHistory([test(localAt(16, 18), 300), test(localAt(15, 9), 200)]);
    expect(series.download.map((point) => point.v)).toEqual([200, 300]);
    expect(series.upload.map((point) => point.v)).toEqual([20, 30]);
  });

  it('is empty without tests', () => {
    expect(speedHistory([])).toEqual({ download: [], upload: [] });
  });
});

describe('gauge scale', () => {
  const best = { downloadMbps: 860, uploadMbps: 41 };

  it('rounds 1.25 times the best result up to a round scale', () => {
    expect(gaugeMax('download', best)).toBe(1000);
    expect(gaugeMax('upload', best)).toBe(50);
    expect(gaugeMax('download', { downloadMbps: 60, uploadMbps: 5 })).toBe(100);
  });

  it('uses a fixed scale for latency and a base scale without a result', () => {
    expect(gaugeMax('ping', best)).toBe(100);
    expect(gaugeMax('download', null)).toBe(100);
  });
});

describe('line share', () => {
  it('is download now over the last measured download, capped at all of it', () => {
    expect(lineShare(215, { downloadMbps: 860 })).toBe(0.25);
    expect(lineShare(900, { downloadMbps: 860 })).toBe(1);
    expect(lineShare(10, null)).toBeNull();
  });
});
