import { beforeEach, describe, expect, it, vi } from 'vitest';

const appended: (readonly [string, string | undefined])[] = [];
const prepared: string[] = [];

vi.mock('electron', () => ({
  app: {
    commandLine: {
      appendSwitch: (name: string, value?: string): void => {
        appended.push([name, value]);
      },
    },
  },
}));

vi.mock('../src/display-capture.js', () => ({
  currentCaptureMode: (): string => 'portal',
  prepareScreenCapture: (mode: string): void => {
    prepared.push(mode);
  },
}));

const { prepareChromium } = await import('../src/chromium-switches.js');

describe('prepareChromium', () => {
  beforeEach(() => {
    appended.length = 0;
    prepared.length = 0;
  });

  it('prepares screen capture and keeps the idle Vulkan driver threads out of the Linux GPU process', () => {
    expect(prepareChromium('linux')).toBe('portal');
    expect(prepared).toEqual(['portal']);
    expect(appended).toEqual([['disable-features', 'Vulkan']]);
  });

  it('leaves the GPU features of macOS and Windows alone', () => {
    prepareChromium('darwin');
    prepareChromium('win32');
    expect(prepared).toEqual(['portal', 'portal']);
    expect(appended).toEqual([]);
  });
});
