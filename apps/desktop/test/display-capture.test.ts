import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeSource {
  readonly id: string;
  readonly name: string;
}

const sources: FakeSource[] = [];
const requested: unknown[] = [];

vi.mock('electron', () => ({
  app: { commandLine: { getSwitchValue: (): string => '', appendSwitch: (): void => undefined } },
  desktopCapturer: {
    getSources: (options: unknown): Promise<FakeSource[]> => {
      requested.push(options);
      return Promise.resolve(sources);
    },
  },
  screen: {
    getAllDisplays: (): never[] => [],
    getPrimaryDisplay: (): { id: number } => ({ id: 0 }),
  },
  systemPreferences: { getMediaAccessStatus: (): string => 'granted' },
}));

const { DisplayCapture } = await import('../src/display-capture.js');
const { CaptureModeError } = await import('../src/capture-errors.js');

const START = 'app://smarteverything/';

function ask(
  capture: InstanceType<typeof DisplayCapture>,
): Promise<{ readonly video: FakeSource } | null> {
  return new Promise((resolve) => {
    capture.answerRequest({ securityOrigin: START, videoRequested: true }, resolve);
  });
}

describe('starting a screen share from the desktop app', () => {
  beforeEach(() => {
    sources.length = 0;
    requested.length = 0;
    sources.push({ id: 'screen:0:0', name: 'Entire screen' });
  });

  it('clears the in-app choice in portal mode instead of failing, so the share can start', async () => {
    const capture = new DisplayCapture('portal', START);
    await expect(capture.choose(null)).resolves.toBeUndefined();
  });

  it('answers a portal share with the source the system dialog picked', async () => {
    const capture = new DisplayCapture('portal', START);
    await capture.choose(null);
    const answer = await ask(capture);
    expect(answer?.video.id).toBe('screen:0:0');
    expect(requested).toEqual([
      expect.objectContaining({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
      }),
    ]);
  });

  it('still refuses picking a named source in portal mode', async () => {
    const capture = new DisplayCapture('portal', START);
    await expect(capture.choose('screen:0:0')).rejects.toBeInstanceOf(CaptureModeError);
  });

  it('answers a picker share with the chosen source once', async () => {
    const capture = new DisplayCapture('picker', START);
    await capture.choose('screen:0:0');
    expect((await ask(capture))?.video.id).toBe('screen:0:0');
    expect(await ask(capture)).toBeNull();
  });

  it('refuses a picker share nobody chose a source for', async () => {
    const capture = new DisplayCapture('picker', START);
    await capture.choose(null);
    expect(await ask(capture)).toBeNull();
  });

  it('refuses a request from another origin', async () => {
    const capture = new DisplayCapture('portal', START);
    const answer = await new Promise((resolve) => {
      capture.answerRequest(
        { securityOrigin: 'https://example.com', videoRequested: true },
        resolve,
      );
    });
    expect(answer).toBeNull();
  });
});
