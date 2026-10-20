import { describe, expect, it } from 'vitest';
import { readDescription } from '../src/description';
import { readJob } from '../src/jobs';
import { readEvent } from '../src/notifications';
import type { DropReporter } from '../src/schema-kit';
import { readStatus } from '../src/status';
import { readSupplies } from '../src/supply';

function recorder(): { reporter: DropReporter; drops: [string, string][] } {
  const drops: [string, string][] = [];
  return {
    drops,
    reporter: {
      dropped: (attribute, reason): void => {
        drops.push([attribute, reason]);
      },
    },
  };
}

describe('reporting dropped printer values', () => {
  it('reports each value that does not parse with its attribute and reason', () => {
    const { reporter, drops } = recorder();
    const status = readStatus(
      { 'printer-state': 3, 'queued-job-count': 'many', 'printer-state-message': 7 },
      reporter,
    );
    expect(status.queuedJobs).toBeNull();
    expect(status.message).toBeNull();
    expect(drops.map(([attribute]) => attribute)).toEqual([
      'printer-state-message',
      'queued-job-count',
    ]);
    for (const [, reason] of drops) expect(reason).toMatch(/expected/u);
  });

  it('reports a dropped set as one attribute and keeps the other values', () => {
    const { reporter, drops } = recorder();
    const supplies = readSupplies(
      { 'marker-names': ['Black'], 'marker-levels': ['full'], 'marker-types': ['toner'] },
      reporter,
    );
    expect(supplies).toHaveLength(1);
    expect(supplies[0]?.level).toBeNull();
    expect(drops.map(([attribute]) => attribute)).toEqual(['marker-levels']);
  });

  it('reports a bad member of a nested value by its dotted name and keeps its sibling', () => {
    const { reporter, drops } = recorder();
    const status = readStatus(
      {
        'printer-state': 3,
        'printer-impressions-completed-col': { monochrome: 'x', 'full-color': 9 },
      },
      reporter,
    );
    expect(status.counters.color).toBe(9);
    expect(status.counters.mono).toBeNull();
    expect(drops.map(([attribute]) => attribute)).toEqual([
      'printer-impressions-completed-col.monochrome',
    ]);
  });

  it('reports nothing for absent or valid values', () => {
    const { reporter, drops } = recorder();
    readStatus({ 'printer-state': 3, 'queued-job-count': 2 }, reporter);
    readDescription({ 'printer-state': 3 }, reporter);
    expect(drops).toEqual([]);
  });

  it('reports the same drops from a full description as from its parts', () => {
    const { reporter, drops } = recorder();
    const description = readDescription(
      { 'printer-state': 3, 'pages-per-minute': 'fast', 'queued-job-count': 'many' },
      reporter,
    );
    expect(description.capabilities.pagesPerMinute).toBeNull();
    expect(drops.map(([attribute]) => attribute).sort()).toEqual([
      'pages-per-minute',
      'queued-job-count',
    ]);
  });

  it('reports a skipped record and still returns null', () => {
    const { reporter, drops } = recorder();
    expect(readJob({ 'job-state': 3 }, reporter)).toBeNull();
    expect(readJob({ 'job-id': 1, 'job-state': 42 }, reporter)).toBeNull();
    expect(readEvent({}, reporter)).toBeNull();
    expect(drops.map(([attribute]) => attribute)).toEqual([
      'job-id',
      'job-state',
      'notify-sequence-number',
    ]);
    for (const [, reason] of drops) expect(reason).toMatch(/^record skipped/u);
  });

  it('gives the same results without a reporter', () => {
    const plain = { 'printer-state': 3, 'queued-job-count': 'many' };
    expect(readStatus(plain)).toEqual(readStatus(plain, recorder().reporter));
  });
});
