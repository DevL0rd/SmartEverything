import { describe, expect, it } from 'vitest';
import type { SpeedTestResult } from '@smarteverything/domain';
import { listSpeedTests, saveSpeedTest } from '../../../src/plugins/builtin/router/speed-tests';
import { memoryRecords } from '../memory-records';

function resultAt(index: number): SpeedTestResult {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
    server: 'test server',
    downloadMbps: 100 + index,
    uploadMbps: 10,
    pingMs: 10,
    jitterMs: 1,
    packetLossPercent: 0,
  };
}

describe('router speed test history', () => {
  it('keeps the newest 20 results, newest first', () => {
    const records = memoryRecords();
    for (let index = 0; index < 45; index += 1) {
      saveSpeedTest(records, resultAt(index));
    }
    const kept = listSpeedTests(records);
    expect(kept).toHaveLength(20);
    expect(kept[0]?.downloadMbps).toBe(144);
    expect(kept.at(-1)?.downloadMbps).toBe(125);
  });
});
