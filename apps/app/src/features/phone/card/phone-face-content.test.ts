import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import type { PhoneReadingsInput } from './phone-face-fixtures';

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const shared = (initial: unknown): object => ({
    value: initial,
    get: () => initial,
    set: (): undefined => undefined,
  });
  return {
    ...original,
    cancelAnimation: (): undefined => undefined,
    useAnimatedStyle: (): object => ({}),
    useAnimatedProps: (): object => ({}),
    useAnimatedReaction: (): undefined => undefined,
    useDerivedValue: (compute: () => unknown): object => shared(compute()),
    useSharedValue: (initial: unknown): object => shared(initial),
    useReducedMotion: (): boolean => true,
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

vi.mock('expo-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: (): { push: () => undefined } => ({ push: (): undefined => undefined }),
}));

vi.mock('../../../platform/haptics', () => ({
  selectionTick: (): undefined => undefined,
  heavyThud: (): undefined => undefined,
}));

vi.mock('../../../api/transport', () => ({
  api: (): { call: () => Promise<never> } => ({ call: () => new Promise<never>(() => undefined) }),
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { StoreProvider } = await import('../../../store/store-context');
const { COLOUR_VARIABLE, PaletteContext } = await import('../../../design/colour-roles');
const { ScreenPause, ScreenPausedContext } = await import('../../../design/screen-pause');
const { PhoneFace } = await import('./phone-face');
const fixtures = await import('./phone-face-fixtures');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

interface Scene {
  readonly device?: Parameters<typeof fixtures.phoneDevice>[0];
  readonly readings?: PhoneReadingsInput;
  readonly role?: 'owner' | 'member';
  readonly viewerProfile?: string;
}

function html(cls: FrameClass, scene: Scene = {}): string {
  const device: Device = fixtures.phoneDevice(scene.device ?? {});
  const store = new EntityStore();
  store.update(() =>
    fixtures.phoneStore(
      device,
      { ...fixtures.DEFAULT_READINGS, ...scene.readings },
      { profileId: scene.viewerProfile ?? fixtures.PHONE_PROFILE, role: scene.role ?? 'owner' },
    ),
  );
  const tree = createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(
        ScreenPausedContext,
        { value: new ScreenPause(null) },
        createElement(PhoneFace, { device, cls }),
      ),
    ),
  );
  return renderToStaticMarkup(
    createElement(() =>
      StoreProvider({ runtime: { store, ledger: new CommandLedger(store) }, children: tree }),
    ),
  );
}

const CLASSES = ['xs', 's', 'm', 'w', 'l', 'xl'] as const;
const AWAY = { device: { clientId: fixtures.OTHER_CLIENT } } as const;

function offers(markup: string, label: string): boolean {
  return markup.includes(`aria-label="${label}"`);
}

describe('phone card faces for your own phone', () => {
  it.each(CLASSES)(
    'names the phone, its battery and the ringer for screen readers at %s',
    (cls) => {
      expect(html(cls)).toContain('aria-label="Dana’s Fold7, Phone, 62 percent, ringer normal"');
    },
  );

  it.each(['m', 'w', 'l', 'xl'] as const)(
    'has no Ring on the phone the app runs on at %s',
    (cls) => {
      const markup = html(cls);
      expect(offers(markup, 'Ring')).toBe(false);
      expect(offers(markup, 'Flashlight off, turn on')).toBe(true);
    },
  );

  it.each(['m', 'w', 'l', 'xl'] as const)(
    'offers Ring on your phone from another device at %s',
    (cls) => {
      expect(offers(html(cls, AWAY), 'Ring')).toBe(true);
    },
  );

  it('says This phone and Your phone only where there is room', () => {
    expect(html('w').includes('This phone')).toBe(true);
    expect(html('w', AWAY).includes('Your phone')).toBe(true);
    expect(html('m').includes('This phone')).toBe(false);
  });

  it('turns Ring into Stop while it rings, short on the medium face', () => {
    const ringing = { ...AWAY, readings: { ringing: true } };
    expect(offers(html('l', ringing), 'Stop ringing')).toBe(true);
    expect(offers(html('m', ringing), 'Stop')).toBe(true);
    expect(offers(html('m', ringing), 'Ring')).toBe(false);
  });

  it('shows the flashlight as on and what is playing with its controls', () => {
    const markup = html('l', {
      readings: { flashlight: 'on', playback: 'playing', now_playing: 'Song' },
    });
    expect(offers(markup, 'Flashlight on, turn off')).toBe(true);
    expect(markup.includes('Song')).toBe(true);
    expect(offers(markup, 'Pause')).toBe(true);
    expect(html('xl', { readings: { now_playing: 'Song' } }).includes('aria-label="Next"')).toBe(
      true,
    );
  });

  it('says nothing is playing when nothing is', () => {
    expect(html('l', { readings: { now_playing: null } }).includes('Nothing playing')).toBe(true);
  });

  it('names a low battery in words and a charging one with when it is full', () => {
    expect(html('l', { readings: { battery: 12 } }).includes('Battery low')).toBe(true);
    const charging = html('l', {
      readings: { charging: true, charge_full_at: '2026-10-18T18:40:00.000Z' },
    });
    expect(charging).toMatch(/Charging · Full at ~\d{1,2}:\d{2}/);
  });

  it('asks for Do Not Disturb access instead of offering Silent', () => {
    const scene = {
      device: {
        features: [
          {
            feature: 'dnd',
            state: 'needs_permission',
            permission: 'android_dnd',
            reason: 'Allow it',
          },
        ],
      },
    };
    for (const cls of ['m', 'w', 'l'] as const) {
      expect(html(cls, scene).includes('Needs access')).toBe(true);
    }
  });

  it('leaves out the flashlight on a phone without one', () => {
    const scene = {
      device: { features: [{ feature: 'torch', state: 'unsupported', reason: 'none' }] },
    };
    expect(html('l', scene).includes('Flashlight')).toBe(false);
  });
});

describe('phone card faces for someone else’s phone', () => {
  const OTHER = {
    device: {
      profileId: fixtures.OTHER_PROFILE,
      clientId: fixtures.OTHER_CLIENT,
      name: 'Sam’s Pixel 9',
    },
  } as const;

  it('lets an owner act, with the screen time total on the extra large face', () => {
    const markup = html('xl', { ...OTHER, role: 'owner' });
    expect(offers(markup, 'Ring')).toBe(true);
    expect(markup.includes('SCREEN TIME TODAY')).toBe(true);
    expect(markup.includes('Apps and notifications stay with Sam')).toBe(true);
    expect(markup.includes('TOP APPS TODAY')).toBe(false);
  });

  it.each(['m', 'w', 'l', 'xl'] as const)(
    'gives a member no controls at %s, only who can change it',
    (cls) => {
      const markup = html(cls, { ...OTHER, role: 'member' });
      expect(offers(markup, 'Ring')).toBe(false);
      expect(markup.includes('Only Sam and the owner can change it')).toBe(true);
    },
  );
});

describe('a phone that is offline', () => {
  const OFFLINE = { device: { online: false, clientId: fixtures.OTHER_CLIENT } } as const;

  it.each(['m', 'w', 'l', 'xl'] as const)('keeps Ring and says commands wait at %s', (cls) => {
    const markup = html(cls, OFFLINE);
    expect(markup.includes('Phone is offline · commands wait until it is back')).toBe(true);
    expect(offers(markup, 'Ring')).toBe(true);
    expect(markup).toMatch(/Last report \d{1,2}:\d{2}/);
  });

  it('draws no ringer, flashlight or volume controls', () => {
    const markup = html('w', OFFLINE);
    expect(markup.includes('Media volume')).toBe(false);
    expect(markup.includes('Flashlight')).toBe(false);
  });
});
