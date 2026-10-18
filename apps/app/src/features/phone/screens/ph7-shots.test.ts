// @ts-nocheck
/* eslint-disable */
import { createElement, forwardRef, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readFileSync } from 'node:fs';
import { it, vi } from 'vitest';

const S =
  '/tmp/claude-1000/-home-devl0rd-Github-SmartEverything/af25caba-233f-4747-97ec-49424fe5c702/scratchpad/ph7';
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T14:00:00.000Z'));
});
const env = vi.hoisted(() => ({
  width: 412,
  height: 900,
  idiom: 'touch' as 'touch' | 'pointer',
  measure: 300,
  area: 412,
  node: null as unknown,
}));

vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<Record<string, unknown>>();
  const wrap = (Base: unknown) =>
    forwardRef((props: Record<string, unknown>, ref) => {
      const { className, contentContainerClassName, ...rest } = props;
      const style = [className === undefined ? {} : { $$css: true, tw: className }, rest['style']];
      const extra =
        contentContainerClassName === undefined
          ? {}
          : {
              contentContainerStyle: [
                { $$css: true, tw: contentContainerClassName },
                rest['contentContainerStyle'],
              ],
            };
      return createElement(Base as never, { ...rest, ...extra, style, ref });
    });
  const Pressable = forwardRef((props: Record<string, unknown>, ref) => {
    const { className, style, ...rest } = props;
    return createElement(rn['Pressable'] as never, {
      ...rest,
      ref,
      style: (state: unknown) => [
        className === undefined ? {} : { $$css: true, tw: className },
        typeof style === 'function' ? (style as (s: unknown) => unknown)(state) : style,
      ],
    });
  });
  return {
    ...rn,
    View: wrap(rn['View']),
    Text: wrap(rn['Text']),
    ScrollView: wrap(rn['ScrollView']),
    TextInput: wrap(rn['TextInput']),
    Image: wrap(rn['Image']),
    Pressable,
    Dimensions: {
      get: () => ({ width: env.width, height: env.height, scale: 2, fontScale: 1 }),
      addEventListener: () => ({ remove: () => undefined }),
    },
    useWindowDimensions: () => ({ width: env.width, height: env.height, scale: 2, fontScale: 1 }),
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  };
});
vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const rn = await import('react-native');
  const created = (C: unknown) =>
    forwardRef((props: Record<string, unknown>, ref) => {
      const { animatedProps, entering, exiting, layout, ...rest } = props;
      void animatedProps;
      void entering;
      void exiting;
      void layout;
      return createElement(C as never, { ...rest, ref });
    });
  const animated = {
    View: created(rn.View),
    Text: created(rn.Text),
    ScrollView: created(rn.ScrollView),
    createAnimatedComponent: created,
  };
  const shared = (initial: unknown): object => ({
    value: initial,
    get: () => initial,
    set: () => undefined,
  });
  return {
    ...original,
    default: animated,
    ...animated,
    cancelAnimation: () => undefined,
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useAnimatedReaction: () => undefined,
    useAnimatedRef: () => ({ current: null }),
    useDerivedValue: (c: () => unknown) => shared(c()),
    useSharedValue: (i: unknown) => shared(i),
    useReducedMotion: () => true,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    runOnJS: (f: unknown) => f,
  };
});
vi.mock('expo-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: (p: { children?: ReactNode }) => p.children ?? null,
  Redirect: () => null,
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: () => undefined, back: () => undefined, replace: () => undefined }),
}));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (_s?: unknown, initial = 0) => ({
    width: initial > 0 ? initial : env.measure,
    onLayout: undefined,
  }),
}));
vi.mock('../../../design/visibility', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOnScreen: () => ({ visible: true, onLayout: undefined }),
  useOnScreenGate: () => ({ moving: false, reduced: true, onLayout: undefined }),
}));
vi.mock('../../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIdiom: () => env.idiom,
}));
vi.mock('../../../design/size-class', async (importOriginal) => {
  const o = await importOriginal<Record<string, unknown>>();
  return {
    ...o,
    useSizeClass: () => ({
      ...(o as any).useSizeClass?.(),
      width: env.width >= 1024 ? 'expanded' : env.width >= 600 ? 'medium' : 'compact',
      idiom: env.idiom,
      split: false,
      area: env.area,
    }),
  };
});
vi.mock('../../../platform/haptics', () => ({
  selectionTick: () => undefined,
  heavyThud: () => undefined,
}));
vi.mock('../data/phone-live', () => ({
  PHONE_LIVE_TOPICS: ['live'],
  usePhoneLiveHeld: () => false,
  useThisPhoneLive: () => undefined,
}));
vi.mock('../../../api/transport', () => ({
  api: () => ({ call: () => new Promise(() => undefined) }),
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { StoreProvider } = await import('../../../store/store-context');
const { makeTable } = await import('../../../store/state');
const { COLOUR_VARIABLE, PaletteContext } = await import('../../../design/colour-roles');
const { LIGHTING, LightingContext } = await import('../../device-visuals/parts/material');
const { ScreenPause, ScreenPausedContext } = await import('../../../design/screen-pause');
const { phoneDetailKey } = await import('../data/phone-detail');
const fx = await import('../card/phone-face-fixtures');


const { SoundBody } = await import('./sound-screen');
const { ScreenBody } = await import('./screen-screen');
const { NetworkBody } = await import('./network-screen');
const { StorageBody } = await import('./storage-screen');
const { bodyWidthOf } = await import('../model/sections');
const css = readFileSync('/home/devl0rd/Github/SmartEverything/apps/app/global.css', 'utf8');
function paletteOf(theme) {
  const start = css.indexOf(`@variant ${theme} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    Object.entries(COLOUR_VARIABLE).map(([role, name]) => {
      const m = new RegExp(`${name}:\\s*([^;]+);`).exec(block);
      const g = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
      return [role, (m ?? g)?.[1]?.trim() ?? '#ff00ff'];
    }),
  );
}
const AT = '2026-10-18T13:58:00.000Z';
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const days = Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${12 + i}`, minutes: [150, 210, 95, 180, 240, 130, 192][i] }));
function apps(n, long) {
  return Array.from({ length: n }, (_, i) => ({ package: `com.app.n${i}`, label: long && i === 1 ? 'An application with a very long label that goes past sixty characters in total' : `App ${i + 1}`, bytes: Math.round((4 - (i % 10) * 0.35) * GB) + i * MB }));
}
const DETAIL = {
  sound: { streams: { media: 40, ring: 70, alarm: 90, notification: 55, call: 60 }, output: { kind: 'bluetooth', name: 'Galaxy Buds3 Pro' }, media: { title: 'Everything In Its Right Place', artist: 'Radiohead', app: 'com.spotify.music', appLabel: 'Spotify', state: 'playing', positionMs: 100000, durationMs: 252000 }, at: AT },
  screen: { brightness: 64, auto: true, timeoutSeconds: 60, fold: 'open', writable: true, usage: { unlocksToday: 41, screenMinutesByDay: days }, at: AT },
  network: { kind: 'wifi', wifi: { ssid: 'Home 5G', rssiDbm: -52, bars: 4, linkMbps: 866, bandGhz: 5 }, cellular: { bars: 3, generation: '5g', operator: 'Telstra' }, vpn: false, metered: false, airplane: false, data: { today: { wifiBytes: Math.round(1.4 * GB), mobileBytes: 220 * MB }, month: { wifiBytes: 38 * GB, mobileBytes: Math.round(4.2 * GB) } }, at: AT },
  connections: { bluetooth: [{ name: 'Galaxy Buds3 Pro', kind: 'headset', batteryPercent: 64 }, { name: 'Galaxy Watch7', kind: 'watch', batteryPercent: 18 }, { name: 'Car audio', kind: 'car', batteryPercent: null }], at: AT },
  storage: { totalBytes: 256 * GB, freeBytes: 41 * GB, parts: [{ kind: 'apps', bytes: 82 * GB }, { kind: 'images', bytes: 54 * GB }, { kind: 'video', bytes: 38 * GB }, { kind: 'audio', bytes: 6 * GB }, { kind: 'system', bytes: 28 * GB }, { kind: 'other', bytes: 7 * GB }], apps: apps(10, false), at: AT },
};
const clone = (v) => JSON.parse(JSON.stringify(v));
function edit(fn) { const d = clone(DETAIL); fn(d); return d; }
const READ = { ...fx.DEFAULT_READINGS, ring_volume: 70, notification_volume: 55, alarm_volume: 90, brightness: 64, auto_brightness: true, now_playing: 'Everything In Its Right Place', playback: 'playing', audio_output: 'bluetooth' };
const OWNER = { profileId: fx.PHONE_PROFILE, role: 'owner' };
const MEMBER = { profileId: fx.PHONE_PROFILE, role: 'member' };
const OTHER = { profileId: fx.OTHER_PROFILE, clientId: fx.OTHER_CLIENT, name: 'Sam’s Pixel 9' };
const ownerOf = (d) => ({ ...d, sound: { ...d.sound, output: { ...d.sound.output, name: null }, media: { ...d.sound.media, title: null, artist: null, app: null, appLabel: null } }, network: { ...d.network, wifi: { ...d.network.wifi, ssid: null } }, connections: { ...d.connections, bluetooth: d.connections.bluetooth.map((b) => ({ ...b, name: null })) }, storage: { ...d.storage, apps: [] } });
const memberOf = (d) => { const o = ownerOf(d); const { connections, storage, ...rest } = o; return { ...rest, screen: { ...o.screen, usage: null }, network: { ...o.network, data: null } }; };
const SCENARIOS = {
  sound: [
    ['own', {}, OWNER, READ, DETAIL],
    ['owner-sees-sam', OTHER, OWNER, { ...READ, now_playing: null }, ownerOf(DETAIL)],
    ['member', OTHER, MEMBER, { ...READ, now_playing: null }, memberOf(DETAIL)],
    ['offline', { online: false, clientId: fx.OTHER_CLIENT }, OWNER, READ, DETAIL],
    ['dnd-needs-access', { clientId: fx.OTHER_CLIENT, features: [{ feature: 'dnd', state: 'needs_permission', permission: 'android_dnd', reason: 'Do Not Disturb access' }] }, OWNER, { ...READ, ringer_mode: 'vibrate' }, DETAIL],
    ['long-ringing', { name: 'A very long phone name that goes past forty characters', clientId: fx.OTHER_CLIENT }, OWNER, { ...READ, ringing: true }, edit((d) => { d.sound.media.title = 'An extremely long track title that keeps going and going past any sensible width for a card'; d.sound.output.name = 'A Bluetooth speaker with a very long name'; })],
    ['empty', {}, OWNER, { battery: 50 }, undefined],
  ],
  screen: [
    ['own', {}, OWNER, READ, DETAIL],
    ['folded-less', {}, OWNER, READ, edit((d) => { d.screen.fold = 'folded'; d.screen.usage.screenMinutesByDay[6].minutes = 60; })],
    ['not-writable', {}, OWNER, READ, edit((d) => { d.screen.writable = false; d.screen.auto = false; })],
    ['usage-off', {}, OWNER, READ, edit((d) => { d.screen.usage = null; })],
    ['owner-sees-sam', OTHER, OWNER, READ, ownerOf(DETAIL)],
    ['member', OTHER, MEMBER, READ, memberOf(DETAIL)],
    ['offline', { online: false }, OWNER, READ, DETAIL],
    ['empty', {}, OWNER, {}, undefined],
  ],
  network: [
    ['wifi-own', {}, OWNER, READ, DETAIL],
    ['cellular', {}, OWNER, READ, edit((d) => { d.network.kind = 'cellular'; })],
    ['airplane-vpn', {}, OWNER, READ, edit((d) => { d.network.kind = 'offline'; d.network.airplane = true; d.network.vpn = true; d.network.metered = true; d.network.wifi = null; })],
    ['owner-sees-sam', OTHER, OWNER, READ, ownerOf(DETAIL)],
    ['member', OTHER, MEMBER, READ, memberOf(DETAIL)],
    ['offline', { online: false }, OWNER, READ, DETAIL],
    ['many-bluetooth', {}, OWNER, READ, edit((d) => { d.connections.bluetooth = Array.from({ length: 12 }, (_, i) => ({ name: i === 2 ? 'A Bluetooth device with a very long name that never ends' : `Device ${i + 1}`, kind: ['headset', 'watch', 'speaker', 'car', 'computer', 'other'][i % 6], batteryPercent: i % 3 === 0 ? null : 10 + i * 7 })); })],
    ['no-telephony-no-usage', {}, OWNER, READ, edit((d) => { d.network.cellular = null; d.network.data = null; d.connections.bluetooth = []; })],
    ['empty', {}, OWNER, {}, undefined],
  ],
  storage: [
    ['own', {}, OWNER, READ, DETAIL],
    ['usage-missing', {}, OWNER, READ, edit((d) => { d.storage.parts = []; d.storage.apps = []; })],
    ['owner-sees-sam', OTHER, OWNER, READ, ownerOf(DETAIL)],
    ['member', OTHER, MEMBER, READ, memberOf(DETAIL)],
    ['offline', { online: false }, OWNER, READ, DETAIL],
    ['many-long', {}, OWNER, READ, edit((d) => { d.storage.apps = apps(300, true); })],
    ['nearly-full', {}, OWNER, READ, edit((d) => { d.storage.freeBytes = 2 * GB; })],
    ['empty', {}, OWNER, {}, undefined],
  ],
};
const BODIES = { sound: SoundBody, screen: ScreenBody, network: NetworkBody, storage: StorageBody };
const WIDTH = { phone358: 358, phone412: 412, fold760: 760, tablet1024: 1024, desktop1440: 1440 };
function render(page, sc, theme) {
  const [, over, viewer, readings, detail] = sc;
  const device = fx.phoneDevice(over);
  const base = fx.phoneStore(device, readings, viewer);
  const store = new EntityStore();
  store.update(() => base);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  if (detail !== undefined) client.setQueryData(phoneDetailKey(device.id), detail);
  const Body = BODIES[page];
  const tree = createElement(QueryClientProvider, { client }, createElement(PaletteContext, { value: paletteOf(theme) }, createElement(LightingContext, { value: LIGHTING[theme] }, createElement(ScreenPausedContext, { value: new ScreenPause(null) }, createElement(Body, { device })))));
  return renderToStaticMarkup(createElement(() => StoreProvider({ runtime: { store, ledger: new CommandLedger(store) }, children: tree })));
}
function safe(fn) {
  try { return fn(); } catch (e) { return `<pre style="color:red;white-space:pre-wrap">${String(e instanceof Error ? e.stack : e).slice(0, 1800)}</pre>`; }
}
it('writes the pages for screenshots', async () => {
  const { StyleSheet } = await import('react-native-web');
  const out = {};
  const only = process.env['PH7_SHOTS'] === 'all' ? '' : (process.env['PH7_SHOTS'] ?? '');
  for (const theme of ['dark', 'light'])
    for (const [bp, width] of Object.entries(WIDTH))
      for (const page of Object.keys(SCENARIOS).filter((p) => p.includes(only)))
        for (const sc of SCENARIOS[page]) {
          env.width = width;
          env.area = width;
          env.idiom = width >= 1024 ? 'pointer' : 'touch';
          const body = bodyWidthOf(width);
          env.measure = Math.round(body * (body >= 640 ? 0.5 : 1) - 40);
          out[`${bp}__${theme}__${page}__${sc[0]}`] = { html: safe(() => render(page, sc, theme)), w: body, h: 0, theme, bp, label: `${page} ${sc[0]}` };
        }
  writeFileSync(`${S}/render.json`, JSON.stringify({ out, sheet: StyleSheet.getSheet().textContent }));
}, 600_000);
