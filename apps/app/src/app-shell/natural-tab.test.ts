import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { router } from 'expo-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNaturalTabForColdLinks } from './natural-tab';

let segments: readonly string[] = [];
let params: Readonly<Record<string, string | string[]>> = {};

vi.mock('expo-router', () => ({
  router: { dismissAll: vi.fn(), replace: vi.fn() },
  useSegments: (): typeof segments => segments,
  useGlobalSearchParams: (): typeof params => params,
}));

function NavigationEffects(): null {
  useNaturalTabForColdLinks();
  return null;
}

function coldLink(
  route: readonly string[],
  searchParams: typeof params = { roomId: 'room-a' },
): void {
  segments = route;
  params = searchParams;
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(NavigationEffects));
  });
  act(() => {
    root.unmount();
  });
}

const DEVICES_ROOM = ['(app)', '(devices)', 'rooms', '[roomId]'] as const;
const DEVICE = ['(app)', '(devices)', 'device', '[deviceId]'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('natural tab for cold device links', () => {
  it('keeps the requested overview focus when moving the device link to Home', () => {
    const query = { deviceId: 'device-a', show: 'rooms' };
    coldLink(DEVICE, query);
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      { pathname: '/(app)/(home)/device/[deviceId]', params: query },
      { withAnchor: true },
    );
  });

  it('keeps the requested metric when moving a history link to Home', () => {
    const query = { deviceId: 'device-a', section: 'history', metric: 'temperature' };
    coldLink([...DEVICE, '[section]'], query);
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      { pathname: '/(app)/(home)/device/[deviceId]/[section]', params: query },
      { withAnchor: true },
    );
  });
});

describe('natural tab for cold room links', () => {
  it('opens a room on the Home stack', () => {
    coldLink(DEVICES_ROOM);
    expect(router.dismissAll).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      { pathname: '/(app)/(home)/rooms/[roomId]', params: { roomId: 'room-a' } },
      { withAnchor: true },
    );
  });

  it('opens the room lights page on the Home stack', () => {
    coldLink([...DEVICES_ROOM, 'lights']);
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      {
        pathname: '/(app)/(home)/rooms/[roomId]/lights',
        params: { roomId: 'room-a', member: null, edit: null, focus: null },
      },
      { withAnchor: true },
    );
  });

  it('preserves the member, editor and focus requested by the lights link', () => {
    coldLink([...DEVICES_ROOM, 'lights'], {
      roomId: 'room-a',
      member: ['lamp & shade', 'ceiling'],
      edit: '1',
      focus: 'brightness/level',
    });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      {
        pathname: '/(app)/(home)/rooms/[roomId]/lights',
        params: { roomId: 'room-a', member: 'lamp & shade', edit: '1', focus: 'brightness/level' },
      },
      { withAnchor: true },
    );
  });

  it('leaves other room descendants and links already on Home in place', () => {
    coldLink([...DEVICES_ROOM, 'other']);
    coldLink([...DEVICES_ROOM, 'lights', 'other']);
    coldLink(['(app)', '(home)', 'rooms', '[roomId]', 'lights']);
    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
