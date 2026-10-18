import type { AssistantVoiceClientMessage, SightMode } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const CALL_ID = '6c1c4f32-0b8e-4c55-9d7a-2b1f8f6a1e01';
const LOOK_ID = '0a5e61f4-2d77-4a52-8d2e-5c0f8b8f7a10';

interface Native {
  steps: string[];
  granted: boolean;
  readonly startAssistantScreenShare: Mock<(sampling: { live: boolean }) => Promise<boolean>>;
  readonly setAssistantScreenLive: Mock<(live: boolean) => Promise<void>>;
  readonly captureAssistantScreenStill: Mock<() => Promise<boolean>>;
  readonly stopAssistantScreenShare: Mock<() => Promise<void>>;
}

const native = vi.hoisted((): Native => ({
  steps: [],
  granted: true,
  startAssistantScreenShare: vi.fn(),
  setAssistantScreenLive: vi.fn(),
  captureAssistantScreenStill: vi.fn(),
  stopAssistantScreenShare: vi.fn(),
}));

vi.mock('../../../../../../modules/health-connect', () => ({
  startAssistantScreenShare: native.startAssistantScreenShare,
  setAssistantScreenLive: native.setAssistantScreenLive,
  captureAssistantScreenStill: native.captureAssistantScreenStill,
  stopAssistantScreenShare: native.stopAssistantScreenShare,
}));

vi.mock('./native-camera', () => ({
  NativeCamera: class {
    on = false;
    close = vi.fn();
    discard = vi.fn();
    stream = vi.fn();
  },
}));

const { NativeSight } = await import('./native-sight');

function sightOf(mode: SightMode): {
  readonly sight: InstanceType<typeof NativeSight>;
  readonly sent: AssistantVoiceClientMessage[];
} {
  const sent: AssistantVoiceClientMessage[] = [];
  const sight = new NativeSight({
    callId: (): string => CALL_ID,
    hub: (): null => null,
    mode: (): SightMode => mode,
    facing: (): 'front' => 'front',
    open: (): boolean => true,
    send: (message): Promise<void> => {
      native.steps.push(message.type);
      sent.push(message);
      return Promise.resolve();
    },
    failure: vi.fn(),
  });
  return { sight, sent };
}

beforeEach(() => {
  native.steps = [];
  native.granted = true;
  native.startAssistantScreenShare.mockReset();
  native.startAssistantScreenShare.mockImplementation(() => {
    native.steps.push('projection');
    return Promise.resolve(native.granted);
  });
  native.setAssistantScreenLive.mockReset();
  native.setAssistantScreenLive.mockImplementation((live: boolean) => {
    native.steps.push(live ? 'frames_on' : 'frames_off');
    return Promise.resolve();
  });
  native.captureAssistantScreenStill.mockReset();
  native.captureAssistantScreenStill.mockImplementation(() => {
    native.steps.push('still');
    return Promise.resolve(true);
  });
  native.stopAssistantScreenShare.mockReset();
  native.stopAssistantScreenShare.mockResolvedValue(undefined);
});

describe('looking at the phone screen', () => {
  it('asks for the screen once and keeps sharing it for the later looks', async () => {
    const { sight } = sightOf('live');
    await sight.look({ source: 'phone_screen', target: null, lookId: LOOK_ID });
    await sight.look({ source: 'phone_screen', target: null, lookId: LOOK_ID });
    expect(native.startAssistantScreenShare).toHaveBeenCalledTimes(1);
    expect(native.stopAssistantScreenShare).not.toHaveBeenCalled();
    expect(native.captureAssistantScreenStill).toHaveBeenCalledTimes(2);
  });

  it('tells the home server about the share before any live picture is sent', async () => {
    const { sight } = sightOf('live');
    await sight.look({ source: 'phone_screen', target: null, lookId: LOOK_ID });
    expect(native.steps).toEqual([
      'projection',
      'sight_start',
      'frames_on',
      'sight_still',
      'still',
    ]);
  });

  it('opens the capture without live pictures so none is sent before the server listens', async () => {
    const { sight } = sightOf('live');
    await sight.startScreen();
    expect(native.startAssistantScreenShare).toHaveBeenCalledWith(
      expect.objectContaining({ live: false }),
    );
  });

  it('keeps the share open but silent when pictures are only sent on request', async () => {
    const { sight } = sightOf('on_demand');
    await sight.look({ source: 'phone_screen', target: null, lookId: LOOK_ID });
    expect(native.steps).toEqual([
      'projection',
      'sight_start',
      'frames_off',
      'sight_still',
      'still',
    ]);
  });

  it('reports a declined screen and shares nothing', async () => {
    native.granted = false;
    const { sight, sent } = sightOf('live');
    await expect(
      sight.look({ source: 'phone_screen', target: null, lookId: LOOK_ID }),
    ).rejects.toMatchObject({ refusal: 'declined' });
    expect(sent).toEqual([]);
    expect(native.captureAssistantScreenStill).not.toHaveBeenCalled();
  });

  it('asks again after the share was stopped', async () => {
    const { sight } = sightOf('live');
    await sight.look({ source: 'phone_screen', target: null, lookId: LOOK_ID });
    sight.stop('phone_screen', false);
    await sight.look({ source: 'phone_screen', target: null, lookId: LOOK_ID });
    expect(native.startAssistantScreenShare).toHaveBeenCalledTimes(2);
  });
});
