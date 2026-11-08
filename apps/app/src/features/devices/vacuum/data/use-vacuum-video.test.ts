import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  API_ENDPOINTS as E,
  type VacuumVideoOpening,
  type WatchTopic,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeRequest {
  readonly body?: { readonly password?: string };
}

interface FakeClient {
  readonly call: (endpoint: unknown, request: FakeRequest) => Promise<unknown>;
}

interface FakePeer {
  readonly onMedia: () => void;
  readonly onState: () => void;
  readonly onVideoFlow: () => void;
  readonly offer: () => Promise<string>;
  readonly answer: (sdp: string) => Promise<void>;
  readonly setListening: () => void;
  readonly close: () => void;
}

const events = vi.hoisted(() => new Array<string>());

interface Answers {
  opening: VacuumVideoOpening;
}

const answers = vi.hoisted((): Answers => ({ opening: { status: 'live', sdp: 'answer-sdp' } }));

vi.mock('../../../../store/use-live-demand', () => ({
  useLiveDemand: (
    deviceId: string,
    topics: readonly WatchTopic[],
    _w: unknown,
    on: boolean,
  ): void => {
    useEffect(() => {
      if (!on) return undefined;
      events.push(`hold ${deviceId} ${topics.join(',')}`);
      return (): void => {
        events.push(`release ${deviceId}`);
      };
    }, [deviceId, topics, on]);
  },
}));

vi.mock('../../../../store/live-watch', () => ({
  liveWatch: {
    sendNow: (): void => {
      events.push('send demand');
    },
  },
}));

vi.mock('../../../../store/selectors', () => ({
  useSettings: (): { ice_servers: readonly unknown[] } => ({ ice_servers: [] }),
}));

vi.mock('../../../../api/transport', () => ({
  api: (): FakeClient => ({
    call: (endpoint, request): Promise<unknown> => {
      if (endpoint === E.openVacuumVideo) {
        events.push(`post ${request.body?.password ?? ''}`);
        return Promise.resolve(answers.opening);
      }
      events.push(endpoint === E.closeVacuumVideo ? 'delete' : 'other call');
      return Promise.resolve({ ok: true });
    },
  }),
}));

vi.mock('../../../cameras', () => ({
  createCameraPeer: (): FakePeer => ({
    onMedia: (): void => undefined,
    onState: (): void => undefined,
    onVideoFlow: (): void => undefined,
    offer: (): Promise<string> => Promise.resolve('offer-sdp'),
    answer: (sdp: string): Promise<void> => {
      events.push(`answer ${sdp}`);
      return Promise.resolve();
    },
    setListening: (): void => undefined,
    close: (): void => {
      events.push('peer closed');
    },
  }),
}));

const { useVacuumVideo } = await import('./use-vacuum-video');
const { forgetPassword, rememberPassword, rememberedPassword } = await import('./vacuum-video');

type Video = ReturnType<typeof useVacuumVideo>;

let root: Root | null = null;

function mount(active: boolean): () => Video | null {
  let latest: Video | null = null;
  function Probe(): ReactNode {
    latest = useVacuumVideo('robot', active);
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(createElement(Probe));
  });
  return (): Video | null => latest;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  events.length = 0;
  answers.opening = { status: 'live', sdp: 'answer-sdp' };
  forgetPassword('robot');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('the robot camera session', () => {
  it('opens with no password and shows no dialog when the robot has none', async () => {
    const video = mount(true);
    await vi.waitFor(() => {
      expect(events).toContain('answer answer-sdp');
    });
    expect(events.slice(0, 3)).toEqual(['hold robot video', 'send demand', 'post ']);
    expect(video()?.phase).toEqual({ kind: 'connecting' });
  });

  it('asks for the password only when the robot requires one, then posts it', async () => {
    answers.opening = { status: 'password_required' };
    const video = mount(true);
    await vi.waitFor(() => {
      expect(video()?.phase).toEqual({ kind: 'asking', wrong: false });
    });
    answers.opening = { status: 'live', sdp: 'answer-sdp' };
    act(() => {
      video()?.submit('1234');
    });
    await vi.waitFor(() => {
      expect(events).toContain('post 1234');
    });
  });

  it('holds and sends the video demand before it posts the opening', async () => {
    rememberPassword('robot', '1234');
    const video = mount(true);
    await vi.waitFor(() => {
      expect(events).toContain('answer answer-sdp');
    });
    expect(events.slice(0, 3)).toEqual(['hold robot video', 'send demand', 'post 1234']);
    expect(video()?.phase).toEqual({ kind: 'connecting' });
  });

  it('opens straight away with the password kept for this app session', async () => {
    rememberPassword('robot', '4321');
    mount(true);
    await vi.waitFor(() => {
      expect(events).toContain('post 4321');
    });
  });

  it('releases the demand on leaving without a close call', async () => {
    rememberPassword('robot', '4321');
    mount(true);
    await vi.waitFor(() => {
      expect(events).toContain('answer answer-sdp');
    });
    act(() => {
      root?.unmount();
    });
    root = null;
    expect(events).toContain('release robot');
    expect(events).not.toContain('delete');
  });

  it('closes the stream on the hub when the user closes the camera', async () => {
    rememberPassword('robot', '4321');
    const video = mount(true);
    await vi.waitFor(() => {
      expect(events).toContain('answer answer-sdp');
    });
    act(() => {
      video()?.close();
    });
    expect(events).toContain('delete');
    expect(video()?.phase).toEqual({ kind: 'idle' });
  });

  it('forgets a wrong password and asks again', async () => {
    rememberPassword('robot', '0000');
    answers.opening = { status: 'wrong_password' };
    const video = mount(true);
    await vi.waitFor(() => {
      expect(video()?.phase).toEqual({ kind: 'asking', wrong: true });
    });
    expect(events).toContain('peer closed');
    expect(rememberedPassword('robot')).toBeNull();
  });

  it('holds nothing and opens nothing while the view is off screen', async () => {
    rememberPassword('robot', '4321');
    mount(false);
    await settle();
    expect(events).toEqual([]);
  });
});
