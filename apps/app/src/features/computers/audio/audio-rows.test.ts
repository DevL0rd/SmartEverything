import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AudioApp, AudioDevice, DisplayOutput } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { Palette } from '../../../design/colour-roles';

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const shared = (initial: unknown): object => ({
    get: () => initial,
    set: (): undefined => undefined,
  });
  return {
    ...original,
    useAnimatedStyle: (): object => ({}),
    useAnimatedProps: (): object => ({}),
    useDerivedValue: (compute: () => unknown): object => shared(compute()),
    useSharedValue: (initial: unknown): object => shared(initial),
    useReducedMotion: (): boolean => false,
    withTiming: (value: unknown): unknown => value,
  };
});

vi.mock('react-native-gesture-handler', async (importOriginal) => {
  const chain: () => unknown = () => new Proxy(chain, { get: () => chain, apply: () => chain() });
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    Gesture: chain(),
    GestureDetector: (props: { children?: ReactNode }): ReactNode => props.children,
  };
});

vi.mock('../../../platform/haptics', () => ({ selectionTick: (): undefined => undefined }));

const { COLOUR_VARIABLE, PaletteContext } = await import('../../../design/colour-roles');
const { DeviceRow } = await import('./device-row');
const { AppRow } = await import('./app-row');
const { DisplayRow } = await import('../displays/display-list');
const { Arrangement } = await import('../displays/arrangement');
const { arrangementOf } = await import('../model/displays-model');

const PALETTE: Palette = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function html(node: ReactNode): string {
  return renderToStaticMarkup(createElement(PaletteContext, { value: PALETTE }, node));
}

const SPEAKERS: AudioDevice = {
  id: 'sp',
  name: 'Speakers (Realtek)',
  kind: 'speakers',
  isDefault: true,
  available: true,
  volume: 42,
  muted: false,
  maxVolume: 150,
  batteryPercent: null,
  usedBy: [],
};

const HEADSET: AudioDevice = {
  ...SPEAKERS,
  id: 'hp',
  name: 'Arctis Nova 7',
  kind: 'headset',
  isDefault: false,
  muted: true,
  batteryPercent: 70,
  usedBy: ['Discord'],
};

const SPOTIFY: AudioApp = {
  streamId: '12',
  app: 'Spotify',
  icon: null,
  volume: 70,
  muted: false,
  outputId: null,
};

const none = (): undefined => undefined;

const SCREEN: DisplayOutput = {
  id: 'DP-3',
  name: 'Dell U2723QE',
  builtIn: false,
  enabled: true,
  primary: true,
  mode: { width: 2560, height: 1440, refreshHz: 165, preferred: false },
  modes: [],
  scalePercent: 125,
  rotation: 0,
  x: 0,
  y: 0,
  brightness: 60,
  hdr: { supported: false, enabled: false },
  vrr: null,
  mirrorOf: null,
};

describe('audio and display rows', () => {
  it('shows a device with its note, battery and state', () => {
    const base = {
      over: false,
      offline: false,
      wide: true,
      onDefault: none,
      onVolume: none,
      onMute: none,
    };
    const speakers = html(createElement(DeviceRow, { ...base, device: SPEAKERS }));
    expect(speakers).toContain('Speakers (Realtek)');
    expect(speakers).toContain('aria-checked="true"');
    expect(speakers).toContain('42 %');
    const headset = html(createElement(DeviceRow, { ...base, device: HEADSET }));
    expect(headset).toContain('In use by Discord');
    expect(headset).toContain('70 %');
    expect(headset).toContain('Unmute Arctis Nova 7');
  });

  it('shows an app with its output on the default device', () => {
    const markup = html(
      createElement(AppRow, {
        app: SPOTIFY,
        outputs: [SPEAKERS, HEADSET],
        over: false,
        offline: true,
        wide: false,
        onVolume: none,
        onMute: none,
        onOutput: none,
      }),
    );
    expect(markup).toContain('Spotify');
    expect(markup).toContain('Output for Spotify: Speakers (Realtek)');
    expect(markup).toContain('Mute Spotify');
  });

  it('shows a display row and the arrangement', () => {
    const row = html(
      createElement(DisplayRow, {
        output: SCREEN,
        disabled: false,
        canSwitch: true,
        onOpen: none,
        onToggle: none,
      }),
    );
    expect(row).toContain('Dell U2723QE');
    expect(row).toContain('2,560 × 1,440 · 165 Hz · 125 % · DP-3');
    expect(row).toContain('Primary');
    const layout = arrangementOf([SCREEN], 360);
    const map = html(
      createElement(Arrangement, {
        disabled: false,
        outputs: [SCREEN],
        on: layout.on,
        off: layout.off,
        height: layout.height,
        onOpen: none,
        onMove: none,
      }),
    );
    expect(map).toContain('Screen arrangement');
    expect(map).toContain('Dell U2723QE');
  });
});
