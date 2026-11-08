import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { href } from '../../../app-shell/hrefs';
import { deviceFixture } from '../../../store/device-fixture';
import { CardPicture } from './card-picture';

interface PictureKey {
  readonly target: unknown;
  readonly currentTarget: unknown;
  readonly key: string;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
  readonly preventDefault: () => void;
  readonly stopPropagation: () => void;
}

interface PictureSurface {
  readonly accessibilityRole?: string;
  readonly tabIndex?: number;
  readonly onClick?: (event: {
    readonly detail: number;
    readonly stopPropagation: () => void;
  }) => void;
  readonly onKeyDownCapture?: (event: PictureKey) => void;
  readonly onAccessibilityAction?: (event: {
    readonly nativeEvent: { readonly actionName: string };
  }) => void;
  readonly children?: ReactNode;
}

interface Probe {
  readonly navigate: ReturnType<typeof vi.fn>;
  surface: PictureSurface | null;
  native: boolean;
  stage: Readonly<Record<string, unknown>> | null;
}

const probe = vi.hoisted((): Probe => ({
  navigate: vi.fn(),
  surface: null,
  native: false,
  stage: null,
}));

vi.mock('react-native', () => ({
  View: (props: PictureSurface): ReactNode => {
    if (props.accessibilityRole === 'button') probe.surface = props;
    return props.children;
  },
}));

vi.mock('react-native-gesture-handler', () => {
  const chain = vi.fn();
  const gesture = { runOnJS: chain, onStart: chain, onEnd: chain, numberOfTaps: chain };
  chain.mockReturnValue(gesture);
  return {
    Gesture: { Tap: chain, LongPress: chain, Exclusive: vi.fn() },
    GestureDetector: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  };
});

vi.mock('expo-router', () => ({ useRouter: (): { navigate: typeof probe.navigate } => probe }));
vi.mock('../../../design/platform', () => ({
  isNative: (): boolean => probe.native,
  useIdiom: (): 'pointer' => 'pointer',
}));
vi.mock('../../../components/icon-button', () => ({ IconButton: vi.fn() }));
vi.mock('../../../design/screen-pause', () => ({ useScreenPaused: (): boolean => false }));
vi.mock('../player/use-live-session', () => ({
  useScreenSession: (): { readonly session: { readonly listening: boolean } } => ({
    session: { listening: false },
  }),
}));
vi.mock('../player/use-on-screen', () => ({
  useOnScreen: (): { readonly attach: null; readonly onLayout: null; readonly visible: true } => ({
    attach: null,
    onLayout: null,
    visible: true,
  }),
}));
vi.mock('../player/player-stage', () => ({
  PlayerStage: (props: Readonly<Record<string, unknown>>): null => {
    probe.stage = props;
    return null;
  },
}));
vi.mock('../../device-visuals', () => ({ CameraSnapshot: (): null => null }));

const device = deviceFixture(0, { kind: 'camera' });

function mountPicture(editing: boolean, onMenu?: () => void): void {
  renderToStaticMarkup(
    createElement(CardPicture, {
      entry: { device, name: device.label, camera: null, room: null },
      hovered: false,
      onMenu,
      editing,
    }),
  );
}

function renderPicture(onMenu?: () => void): PictureSurface {
  mountPicture(false, onMenu);
  if (probe.surface === null) throw new Error('Expected a camera action surface');
  return probe.surface;
}

beforeEach(() => {
  probe.navigate.mockClear();
  probe.native = false;
  probe.surface = null;
  probe.stage = null;
});

function keyEvent(key: string, shiftKey = false): PictureKey {
  const target = Symbol('camera');
  return {
    target,
    currentTarget: target,
    key,
    shiftKey,
    repeat: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('camera widget opening', () => {
  it.each(['Enter', ' '])(
    'keeps %j with the browser button rather than starting a gesture',
    (key) => {
      const surface = renderPicture();
      const event = keyEvent(key);
      surface.onKeyDownCapture?.(event);
      expect(surface.tabIndex).toBe(0);
      expect(probe.navigate).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
    },
  );

  it('opens for browser keyboard or assistive clicks and leaves pointer clicks with gestures', () => {
    const surface = renderPicture();
    surface.onClick?.({ detail: 1, stopPropagation: vi.fn() });
    expect(probe.navigate).not.toHaveBeenCalled();
    surface.onClick?.({ detail: 0, stopPropagation: vi.fn() });
    expect(probe.navigate).toHaveBeenCalledExactlyOnceWith(href.camera(device.id));
  });

  it('opens full screen and the options from web shortcuts', () => {
    const onMenu = vi.fn();
    const surface = renderPicture(onMenu);
    const full = keyEvent('Enter', true);
    surface.onKeyDownCapture?.(full);
    expect(full.preventDefault).toHaveBeenCalledOnce();
    surface.onKeyDownCapture?.(keyEvent('F10', true));
    expect(onMenu).toHaveBeenCalledOnce();
    expect(probe.navigate).toHaveBeenCalledExactlyOnceWith(href.camera(device.id, 'full'));
  });

  it('opens the requested view from native accessibility actions', () => {
    probe.native = true;
    const onMenu = vi.fn();
    const surface = renderPicture(onMenu);
    surface.onAccessibilityAction?.({ nativeEvent: { actionName: 'activate' } });
    surface.onAccessibilityAction?.({ nativeEvent: { actionName: 'fullScreen' } });
    surface.onAccessibilityAction?.({ nativeEvent: { actionName: 'menu' } });
    expect(onMenu).toHaveBeenCalledOnce();
    expect(surface.onKeyDownCapture).toBeUndefined();
    expect(probe.navigate.mock.calls).toEqual([
      [href.camera(device.id)],
      [href.camera(device.id, 'full')],
    ]);
  });

  it('renders an inert snapshot while editing the board', () => {
    mountPicture(true);
    expect(probe.surface).toBeNull();
    expect(probe.stage).toBeNull();
  });

  it('plays the live picture filling the tile whenever the board is not being edited', () => {
    mountPicture(false);
    expect(probe.stage).toMatchObject({ compact: true, videoFit: 'cover' });
  });
});
