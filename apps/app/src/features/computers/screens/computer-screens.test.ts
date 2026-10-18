import { describe, expect, it, vi } from 'vitest';
import { href } from '../../../app-shell/hrefs';
import { stripItems, readingsOfSummary } from '../model/computer-strip';
import { AI_SECTIONS, SECTIONS } from '../model/sections';

vi.mock('../../assistant', () => ({
  useHarnessCatalogue: (): { data: undefined } => ({ data: undefined }),
}));
vi.mock('../../devices', () => ({ useLastSeen: (): null => null }));

const { COMPUTER_SCREENS } = await import('./computer-screens');

const SUMMARY = {
  cpuLoad: 20,
  cpuTemperature: null,
  memoryPercent: 40,
  swapPercent: null,
  gpuLoad: 30,
  gpuTemperature: null,
  gpuMemoryPercent: null,
  cpuWatts: null,
  gpuWatts: null,
  downloadRate: 1000,
  uploadRate: 10,
  fullestDisk: { mount: '/', percent: 50 },
  batteryLevel: 50,
  charging: false,
  totalWatts: 10,
  processCount: 1,
  uptimeSeconds: 1,
} as const;

describe('computer screens', () => {
  it('has a screen for every section the rail and the section list link to', () => {
    const missing = SECTIONS.filter((section) => COMPUTER_SCREENS[section.id] === undefined);
    expect(missing.map((section) => section.id)).toEqual([]);
  });

  it('has a screen for every page a strip tile links to', () => {
    const pages = stripItems({
      readings: readingsOfSummary(SUMMARY),
      series: {
        'summary/cpuLoad': [],
        'summary/gpuLoad': [],
        'summary/memoryPercent': [],
        'summary/downloadRate': [],
        'summary/batteryLevel': [],
        'summary/totalWatts': [],
      },
      offline: false,
      target: (page) => href.settings.device('computer-1', page),
    }).map((item) => item.href);
    const ids = SECTIONS.map((section) => section.id);
    for (const target of pages) {
      const page = typeof target === 'object' && 'params' in target ? target.params.page : '';
      expect(ids).toContain(page);
    }
  });

  it('keeps the AI pages out of the computer screens', () => {
    for (const section of AI_SECTIONS) expect(COMPUTER_SCREENS[section.id]).toBeUndefined();
  });
});
