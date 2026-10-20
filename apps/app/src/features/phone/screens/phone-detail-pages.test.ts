import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { phoneDetailFor, type PhoneDetail, type PhoneTier } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { Device } from '../../../store/state';
import type { PhoneReadingsInput } from '../card/phone-face-fixtures';

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

vi.mock('../data/phone-live', () => ({
  PHONE_LIVE_TOPICS: ['live'],
  usePhoneLiveHeld: (): boolean => false,
  useThisPhoneLive: (): undefined => undefined,
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { StoreProvider } = await import('../../../store/store-context');
const { COLOUR_VARIABLE, PaletteContext } = await import('../../../design/colour-roles');
const { ScreenPause, ScreenPausedContext } = await import('../../../design/screen-pause');
const { phoneDetailKey } = await import('../data/phone-detail');
const fixtures = await import('../card/phone-face-fixtures');
const { SoundBody } = await import('./sound-screen');
const { ScreenBody } = await import('./screen-screen');
const { NetworkBody } = await import('./network-screen');
const { StorageBody } = await import('./storage-screen');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

const AT = '2026-10-18T13:58:00.000Z';
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const WEEK = [150, 210, 95, 180, 240, 130, 192];

const DETAIL: PhoneDetail = {
  sound: {
    streams: { media: 40, ring: 70, alarm: 90, notification: 55, call: 60 },
    hapticFeedback: true,
    touchSounds: false,
    output: { kind: 'bluetooth', name: 'Galaxy Buds3 Pro' },
    media: {
      title: 'Everything In Its Right Place',
      artist: 'Radiohead',
      app: 'com.spotify.music',
      appLabel: 'Spotify',
      state: 'playing',
      positionMs: 100_000,
      durationMs: 252_000,
    },
    at: AT,
  },
  screen: {
    brightness: 64,
    auto: true,
    autoRotate: true,
    timeoutSeconds: 60,
    fold: 'open',
    writable: true,
    usage: {
      unlocksToday: 41,
      screenMinutesByDay: WEEK.map((minutes, index) => ({
        day: `2026-10-${String(12 + index)}`,
        minutes,
      })),
    },
    at: AT,
  },
  network: {
    kind: 'wifi',
    wifi: { ssid: 'Home 5G', rssiDbm: -52, bars: 4, linkMbps: 866, bandGhz: 5 },
    cellular: { bars: 3, generation: '5g', operator: 'Telstra' },
    vpn: false,
    metered: false,
    airplane: false,
    wifiOn: true,
    locationOn: true,
    data: {
      today: { wifiBytes: Math.round(1.4 * GB), mobileBytes: 220 * MB },
      month: { wifiBytes: 38 * GB, mobileBytes: Math.round(4.2 * GB) },
    },
    at: AT,
  },
  connections: {
    bluetoothOn: true,
    bluetooth: [
      { name: 'Galaxy Buds3 Pro', kind: 'headset', batteryPercent: 64 },
      { name: 'Galaxy Watch7', kind: 'watch', batteryPercent: 18 },
      { name: 'Car audio', kind: 'car', batteryPercent: null },
    ],
    at: AT,
  },
  storage: {
    totalBytes: 256 * GB,
    freeBytes: 41 * GB,
    parts: [
      { kind: 'apps', bytes: 82 * GB },
      { kind: 'images', bytes: 54 * GB },
      { kind: 'video', bytes: 38 * GB },
      { kind: 'system', bytes: 28 * GB },
    ],
    apps: Array.from({ length: 300 }, (_, index) => ({
      package: `com.app.n${String(index)}`,
      label:
        index === 1
          ? 'An application with a very long label that goes on'
          : `App ${String(index + 1)}`,
      bytes: Math.round((4 - (index % 10) * 0.35) * GB) + index * MB,
    })),
    at: AT,
  },
};

interface Scene {
  readonly tier?: PhoneTier;
  readonly detail?: PhoneDetail | undefined;
  readonly readings?: PhoneReadingsInput;
  readonly away?: boolean;
  readonly online?: boolean;
  readonly features?: Parameters<typeof fixtures.phoneDevice>[0]['features'];
}

type Page = 'sound' | 'screen' | 'network' | 'storage';

const BODIES = {
  sound: SoundBody,
  screen: ScreenBody,
  network: NetworkBody,
  storage: StorageBody,
} as const;

function deviceOf(scene: Scene): Device {
  const other = (scene.tier ?? 'person') !== 'person';
  return fixtures.phoneDevice({
    ...(other ? { profileId: fixtures.OTHER_PROFILE, name: 'Sam’s Pixel 9' } : {}),
    ...(scene.away === true || other ? { clientId: fixtures.OTHER_CLIENT } : {}),
    ...(scene.online === undefined ? {} : { online: scene.online }),
    ...(scene.features === undefined ? {} : { features: scene.features }),
  });
}

function detailOf(scene: Scene, tier: PhoneTier): PhoneDetail | undefined {
  const source = 'detail' in scene ? scene.detail : DETAIL;
  return source === undefined ? undefined : phoneDetailFor(source, tier);
}

function text(page: Page, scene: Scene = {}): string {
  const tier = scene.tier ?? 'person';
  const device = deviceOf(scene);
  const detail = detailOf(scene, tier);
  const store = new EntityStore();
  store.update(() =>
    fixtures.phoneStore(
      device,
      { ...fixtures.DEFAULT_READINGS, ...scene.readings },
      { profileId: fixtures.PHONE_PROFILE, role: tier === 'member' ? 'member' : 'owner' },
    ),
  );
  const client = new QueryClient();
  if (detail !== undefined) client.setQueryData(phoneDetailKey(device.id), detail);
  const tree = createElement(
    QueryClientProvider,
    { client },
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(
        ScreenPausedContext,
        { value: new ScreenPause(null) },
        createElement(BODIES[page], { device }),
      ),
    ),
  );
  const markup = renderToStaticMarkup(
    createElement(() =>
      StoreProvider({ runtime: { store, ledger: new CommandLedger(store) }, children: tree }),
    ),
  );
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
}

function without(keys: readonly (keyof PhoneDetail)[]): PhoneDetail {
  return Object.fromEntries(Object.entries(DETAIL).filter(([key]) => !keys.some((k) => k === key)));
}

function screenWith(change: Partial<NonNullable<PhoneDetail['screen']>>): PhoneDetail {
  return DETAIL.screen === undefined
    ? DETAIL
    : { ...DETAIL, screen: { ...DETAIL.screen, ...change } };
}

const SYSTEM_READINGS: PhoneReadingsInput = {
  auto_rotate: true,
  haptic_feedback: false,
  touch_sounds: true,
  wifi_on: true,
  bluetooth_on: false,
  location_on: true,
  airplane_mode: false,
};

const NO_DND = [
  {
    feature: 'dnd',
    state: 'needs_permission',
    permission: 'android_dnd',
    reason: 'Do Not Disturb',
  },
] as const;

describe('the sound page', () => {
  it('shows the volumes, the output and what is playing for your own phone', () => {
    const page = text('sound');
    for (const word of ['Volumes', 'Media', 'Ring', 'Notification', 'Alarm', 'Call', 'Read only']) {
      expect(page).toContain(word);
    }
    expect(page).toContain('Galaxy Buds3 Pro · Bluetooth');
    expect(page).toContain('Everything In Its Right Place');
    expect(page).toContain('Radiohead · Spotify');
    expect(page).toContain('This is the phone in your hand');
  });

  it('offers Ring on another phone with the full-volume caption', () => {
    const page = text('sound', { away: true });
    expect(page).toContain('Rings at full volume even on silent');
    expect(page).not.toContain('This is the phone in your hand');
  });

  it('keeps the track and the Bluetooth name of another person from the owner', () => {
    const page = text('sound', { tier: 'owner' });
    expect(page).toContain('Titles stay with Sam');
    expect(page).not.toContain('Everything In Its Right Place');
    expect(page).not.toContain('Galaxy Buds3');
  });

  it('tells a member that only the person and the owner can change or ring it', () => {
    const page = text('sound', { tier: 'member' });
    expect(page).toContain('Only Sam and the owner can change the volume');
    expect(page).toContain('Only Sam and the owner can ring it');
  });

  it('explains missing Do Not Disturb access and leaves out Silent', () => {
    const page = text('sound', { features: NO_DND });
    expect(page).toContain(
      'Allow Do Not Disturb access on the phone to use Silent and Do Not Disturb',
    );
    expect(page.split('Silent')).toHaveLength(2);
    expect(text('sound')).toContain('Silent');
  });

  it('still shows the controls from reported values before the detailed report', () => {
    const page = text('sound', { detail: undefined });
    expect(page).toContain('Volumes');
    expect(page).toContain('Mode');
    expect(page).toContain('Nothing playing');
  });
});

describe('the screen page', () => {
  it('shows today against the average, the unlocks, brightness and the timeout', () => {
    const page = text('screen');
    expect(page).toContain('3h 12m');
    expect(page).toContain('15 % more than your average');
    expect(page).toContain('Unlocks today');
    expect(page).toContain('41');
    expect(page).toContain('Automatic brightness');
    expect(page).toContain('Fold: open');
    for (const label of ['15 s', '1 min', '30 min']) expect(page).toContain(label);
  });

  it('says less when today is shorter than the average', () => {
    const usage = DETAIL.screen?.usage;
    if (usage === null || usage === undefined) throw new Error('fixture has usage');
    const shorter = usage.screenMinutesByDay.map((entry, index) =>
      index === 6 ? { ...entry, minutes: 60 } : entry,
    );
    expect(
      text('screen', { detail: screenWith({ usage: { ...usage, screenMinutesByDay: shorter } }) }),
    ).toContain('64 % less than your average');
  });

  it('says what to allow when usage access or system settings are missing', () => {
    const noUsage = text('screen', { detail: screenWith({ usage: null }) });
    expect(noUsage).toContain('Allow App usage access on the phone to see screen time');
    expect(noUsage).not.toContain('Unlocks today');
    const locked = text('screen', { detail: screenWith({ writable: false, auto: false }) });
    expect(locked).toContain('Allow Modify system settings on the phone to change brightness here');
    expect(locked).toContain(
      'Allow Modify system settings on the phone to change the screen timeout here',
    );
  });

  it('shows the owner totals of another person and a member nothing personal', () => {
    expect(text('screen', { tier: 'owner' })).toContain('Sam’s average');
    const member = text('screen', { tier: 'member' });
    expect(member).toContain('Screen time stays with Sam');
    expect(member).not.toContain('Unlocks today');
  });

  it('waits for the first detailed report', () => {
    const page = text('screen', { detail: undefined });
    expect(page).not.toContain('Brightness');
    expect(page).not.toContain('Screen timeout');
  });
});

describe('the system switches on the screen page', () => {
  it('lists the three switches and the four radios with their state', () => {
    const page = text('screen', { readings: SYSTEM_READINGS });
    for (const word of [
      'System',
      'Auto-rotate',
      'Touch vibration',
      'Touch sounds',
      'Wi-Fi',
      'Bluetooth',
      'Location',
      'Airplane mode',
    ]) {
      expect(page).toContain(word);
    }
    expect(page.split(' On ').length - 1).toBe(2);
    expect(page.split(' Off ').length - 1).toBe(2);
  });

  it('offers to open the matching phone settings page only to the phone’s own person', () => {
    const own = text('screen', { readings: SYSTEM_READINGS });
    expect(own.split('Settings').length - 1).toBe(4);
    expect(text('screen', { tier: 'owner', readings: SYSTEM_READINGS })).not.toContain('Settings');
    expect(text('screen', { tier: 'member', readings: SYSTEM_READINGS })).not.toContain('Settings');
  });

  it('shows the radios of another person without any name and locks the switches', () => {
    const page = text('screen', { tier: 'owner', readings: SYSTEM_READINGS });
    expect(page).toContain('Wi-Fi');
    expect(page).toContain('Airplane mode');
    expect(page).not.toContain('Home 5G');
  });

  it('tells a member that only the person and the owner can change the switches', () => {
    expect(text('screen', { tier: 'member', readings: SYSTEM_READINGS })).toContain(
      'Only Sam and the owner can change these',
    );
  });

  it('asks for Modify system settings and offers its page to the person', () => {
    const page = text('screen', {
      detail: screenWith({ writable: false }),
      readings: SYSTEM_READINGS,
    });
    expect(page).toContain('Allow Modify system settings on the phone to change these here');
    expect(page).toContain('Open settings');
    const other = text('screen', {
      tier: 'owner',
      detail: screenWith({ writable: false }),
      readings: SYSTEM_READINGS,
    });
    expect(other).toContain('Allow Modify system settings on the phone to change these here');
    expect(other).not.toContain('Open settings');
  });

  it('shows a radio the phone has not reported without a state', () => {
    const page = text('screen', { readings: { wifi_on: true } });
    expect(page).toContain('Wi-Fi');
    expect(page.split(' On ').length - 1).toBe(1);
    expect(page).not.toContain(' Off ');
  });
});

describe('the network page', () => {
  it('shows the connection, mobile, data use, Bluetooth and where the switches live', () => {
    const page = text('network');
    for (const word of [
      'Home 5G',
      '866 Mbps',
      '5 GHz',
      'Telstra · 5G',
      'Today',
      'This month',
      'Galaxy Watch7',
      '3 connected',
      'VPN off',
      'Not metered',
    ]) {
      expect(page).toContain(word);
    }
    expect(page).toContain('Wi-Fi, Bluetooth and mobile data can only be switched on the phone');
  });

  it('hides the Wi-Fi name and the device names of another person from the owner', () => {
    const page = text('network', { tier: 'owner' });
    expect(page).not.toContain('Home 5G');
    expect(page).toContain('The Wi-Fi name stays with Sam');
    expect(page).toContain('Device names stay with Sam');
    expect(page).toContain('Headset');
  });

  it('gives a member the connection only', () => {
    const page = text('network', { tier: 'member' });
    expect(page).toContain('Data use stays with Sam');
    expect(page).toContain('Connected devices stay with Sam and the owner');
  });

  it('shows airplane mode, VPN and metered chips and the offline title', () => {
    const base = DETAIL.network;
    if (base === undefined) throw new Error('fixture has network');
    const page = text('network', {
      detail: {
        ...DETAIL,
        network: { ...base, kind: 'offline', airplane: true, vpn: true, metered: true },
      },
    });
    for (const word of ['Airplane mode on', 'VPN on', 'Metered', 'Offline'])
      expect(page).toContain(word);
  });

  it('leaves out mobile on a phone without it and asks for usage access for data', () => {
    const base = DETAIL.network;
    if (base === undefined) throw new Error('fixture has network');
    const page = text('network', {
      detail: {
        ...DETAIL,
        network: { ...base, cellular: null, data: null },
        connections: { bluetoothOn: true, bluetooth: [], at: AT },
      },
    });
    expect(page).not.toContain('Telstra');
    expect(page).toContain('Allow App usage access on the phone to see data use');
    expect(page).toContain('Nothing connected');
  });

  it('shows no reading while the phone is offline and waits for the first report', () => {
    expect(text('network', { online: false })).toContain('No reading while offline');
    expect(text('network', { detail: undefined })).not.toContain('Connection');
  });
});

describe('the storage page', () => {
  it('shows free space, the breakdown and the largest apps', () => {
    const page = text('storage');
    for (const word of [
      '41',
      'GB free',
      'Apps',
      'Images',
      'Video',
      'System',
      'Free',
      'Largest apps',
      'App 1',
    ]) {
      expect(page).toContain(word);
    }
  });

  it('asks for usage access when the phone cannot break the storage down', () => {
    const base = DETAIL.storage;
    if (base === undefined) throw new Error('fixture has storage');
    const page = text('storage', {
      detail: { ...DETAIL, storage: { ...base, parts: [], apps: [] } },
    });
    expect(page).toContain('Allow App usage access on the phone to see what takes the space');
    expect(page).toContain('No app sizes reported yet');
  });

  it('gives the owner totals and a member nothing', () => {
    expect(text('storage', { tier: 'owner' })).toContain('App names and sizes stay with Sam');
    expect(text('storage', { tier: 'member' })).toContain('Storage stays with Sam and the owner');
  });

  it('lists three hundred apps and keeps a long label', () => {
    const page = text('storage');
    expect(page).toContain('App 300');
    expect(page).toContain('An application with a very long label');
  });

  it('waits for the first detailed report', () => {
    expect(text('storage', { detail: without(['storage']) })).not.toContain('Largest apps');
  });
});
