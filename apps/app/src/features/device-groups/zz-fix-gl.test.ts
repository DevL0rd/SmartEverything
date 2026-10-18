// @ts-nocheck
/* eslint-disable */
import { createElement, forwardRef, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readFileSync } from 'node:fs';
import { it, vi } from 'vitest';

const S = '/tmp/claude-1000/-home-devl0rd-Github-SmartEverything/af25caba-233f-4747-97ec-49424fe5c702/scratchpad/glfix';
vi.hoisted(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-18T14:00:00.000Z')); });
const env = vi.hoisted(() => ({ width: 412, height: 900, idiom: 'touch' as 'touch' | 'pointer', measure: 300, grid: 380 }));

vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<Record<string, unknown>>();
  const wrap = (Base: unknown) =>
    forwardRef((props: Record<string, unknown>, ref) => {
      const { className, contentContainerClassName, ...rest } = props;
      const style = [className === undefined ? {} : { $$css: true, tw: className }, rest['style']];
      const extra = contentContainerClassName === undefined ? {} : { contentContainerStyle: [{ $$css: true, tw: contentContainerClassName }, rest['contentContainerStyle']] };
      return createElement(Base as never, { ...rest, ...extra, style, ref });
    });
  const Pressable = forwardRef((props: Record<string, unknown>, ref) => {
    const { className, style, ...rest } = props;
    return createElement(rn['Pressable'] as never, { ...rest, ref, style: (state: unknown) => [className === undefined ? {} : { $$css: true, tw: className }, typeof style === 'function' ? (style as (s: unknown) => unknown)(state) : style] });
  });
  return {
    ...rn,
    View: wrap(rn['View']), Text: wrap(rn['Text']), ScrollView: wrap(rn['ScrollView']), TextInput: wrap(rn['TextInput']), Image: wrap(rn['Image']), Pressable,
    Dimensions: { get: () => ({ width: env.width, height: env.height, scale: 2, fontScale: 1 }), addEventListener: () => ({ remove: () => undefined }) },
    useWindowDimensions: () => ({ width: env.width, height: env.height, scale: 2, fontScale: 1 }),
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  };
});
vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const rn = await import('react-native');
  const created = (C: unknown) => forwardRef((props: Record<string, unknown>, ref) => {
    const { animatedProps, entering, exiting, layout, ...rest } = props;
    void animatedProps; void entering; void exiting; void layout;
    return createElement(C as never, { ...rest, ref });
  });
  const animated = { View: created(rn.View), Text: created(rn.Text), ScrollView: created(rn.ScrollView), createAnimatedComponent: created };
  const shared = (initial: unknown): object => ({ value: initial, get: () => initial, set: () => undefined });
  return {
    ...original, default: animated, ...animated,
    cancelAnimation: () => undefined, useAnimatedStyle: () => ({}), useAnimatedProps: () => ({}), useAnimatedReaction: () => undefined,
    useAnimatedRef: () => ({ current: null }), useAnimatedScrollHandler: () => undefined, useScrollViewOffset: () => shared(0),
    useFrameCallback: () => ({ setActive: () => undefined }), useDerivedValue: (compute: () => unknown) => shared(compute()),
    useSharedValue: (initial: unknown) => shared(initial), useReducedMotion: () => true,
    withRepeat: (v: unknown) => v, withSequence: (v: unknown) => v, withTiming: (v: unknown) => v, withSpring: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v, runOnJS: (f: unknown) => f,
  };
});
vi.mock('react-native-keyboard-controller', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  KeyboardAvoidingView: (await import('react-native')).View,
  KeyboardAwareScrollView: (await import('react-native')).ScrollView,
  KeyboardStickyView: (await import('react-native')).View,
  useKeyboardHandler: () => undefined,
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0, get: () => 0 }, progress: { value: 0, get: () => 0 } }),
}));
vi.mock('expo-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: (props: { children?: ReactNode }) => props.children ?? null,
  Redirect: () => null,
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: () => undefined, back: () => undefined, replace: () => undefined }),
}));
vi.mock('../../components/use-measured-width', () => ({
  useMeasuredWidth: (_snap?: unknown, initial = 0) => ({ width: initial > 0 ? initial : env.measure, onLayout: undefined }),
}));
vi.mock('../../design/visibility', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOnScreen: () => ({ visible: true, onLayout: undefined }),
  useOnScreenGate: () => ({ moving: false, reduced: true, onLayout: undefined }),
}));
vi.mock('../../design/platform', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useIdiom: () => env.idiom }));
vi.mock('../../components/grid', async () => {
  const { View } = await import('react-native');
  const { Children, isValidElement } = await import('react');
  const GAP = { grid: 12, tight: 8 };
  return {
    Grid: ({ minItemWidth, gap = 'grid', maxColumns = 6, children }) => {
      const items = Children.toArray(children).filter(isValidElement);
      const g = GAP[gap] ?? 8;
      const columns = Math.max(1, Math.min(maxColumns, Math.floor((env.grid + g) / (minItemWidth + g))));
      const rows = [];
      for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
      return createElement(View, { className: gap === 'grid' ? 'gap-grid-gap' : 'gap-2' }, rows.map((row, i) => createElement(View, { key: String(i), className: `flex-row items-stretch ${gap === 'grid' ? 'gap-grid-gap' : 'gap-2'}` }, row.map((item, c) => createElement(View, { key: item.key ?? c, className: 'min-w-0 flex-1' }, item)))));
    },
  };
});
vi.mock('../../platform/haptics', () => ({ selectionTick: () => undefined }));
vi.mock('../../components/after-paint', () => ({ AfterPaint: (p: { children: ReactNode }) => p.children }));
vi.mock('../../components/sheet', async (o) => ({ ...(await o()), Sheet: (p: { children: ReactNode }) => p.children }));
vi.mock('../../components/screen', async () => {
  const { View } = await import('react-native');
  const W = { dashboard: 'max-w-dashboard', detail: 'max-w-detail', reading: 'max-w-reading' };
  return {
    Screen: (p: { header?: ReactNode; banner?: ReactNode; footer?: ReactNode; children: ReactNode; maxWidth?: string }) =>
      createElement(View, { className: `w-full gap-section-gap self-center px-gutter pt-4 pb-8 ${W[p.maxWidth ?? 'dashboard']}` }, p.header, p.banner, p.children, p.footer),
  };
});

const { SETTINGS_ROW } = await import('@smarteverything/domain');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { CommandLedger } = await import('../../store/command-ledger');
const { EntityStore } = await import('../../store/entity-store');
const { StoreProvider } = await import('../../store/store-context');
const { deviceFixture, stateFixture } = await import('../../store/device-fixture');
const { makeTable } = await import('../../store/state');
const { COLOUR_VARIABLE, PaletteContext } = await import('../../design/colour-roles');
const { LIGHTING, LightingContext } = await import('../device-visuals/parts/material');
const { ScreenPause, ScreenPausedContext } = await import('../../design/screen-pause');
const { targetHistoryKey } = await import('../../queries/keys');
const { changesByDevice } = await import('./model/lanes');
const { GroupScreen } = await import('./screens/group-screen');
const { GroupPage } = await import('./screens/group-page');
const { useGroupLoad } = await import('./widget/use-group-data');
const { DeviceSpotlightWidget, DeviceScreen } = await import('../devices');
const { roomLightsTarget } = await import('@smarteverything/domain');

const css = readFileSync('/home/devl0rd/Github/SmartEverything/apps/app/global.css', 'utf8');
function paletteOf(theme: 'light' | 'dark'): Record<string, string> {
  const start = css.indexOf(`@variant ${theme} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(Object.entries(COLOUR_VARIABLE).map(([role, name]) => {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(block);
    const g = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
    return [role, (m ?? g)?.[1]?.trim() ?? '#ff00ff'];
  }));
}

const NOW = Date.parse('2026-10-18T14:00:00.000Z');
const T_OLD = '2026-10-18T09:00:00.000Z';
const T_NEW = '2026-10-18T13:00:00.000Z';
const cap = (key: string, value: unknown) => ({ key, label: key, access: 'read_write', value });
const POWER = cap('power', { kind: 'boolean' });
const BRIGHT = cap('brightness', { kind: 'number', min: 1, max: 100, step: 1, unit: '%' });
const TEMP = cap('color_temperature', { kind: 'number', min: 2200, max: 6500, step: 100, unit: 'K' });
const COLOUR = cap('color', { kind: 'color' });
const KIND_CAPS = { colour: [POWER, BRIGHT, TEMP, COLOUR], white: [POWER, BRIGHT, TEMP], dim: [POWER, BRIGHT], onoff: [POWER] };
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GROUP = uid(9000);

interface L { name: string; kind: keyof typeof KIND_CAPS | 'plug'; on: boolean; level?: number; hue?: number; sat?: number; kelvin?: number; online?: boolean; room?: number; hidden?: boolean }

function build(list: readonly L[]) {
  const devices = []; const values = {}; const history = [];
  list.forEach((l, i) => {
    const id = uid(i + 1);
    const plug = l.kind === 'plug';
    devices.push(deviceFixture(i, { id, kind: plug ? 'plug' : 'light', name: l.name, online: l.online ?? true, room_id: `room-${String(l.room ?? 1)}`, hidden: l.hidden ?? false, capabilities: plug ? [POWER, cap('power_draw', { kind: 'number', min: 0, max: 5000, step: 1, unit: 'W' })] : KIND_CAPS[l.kind] }));
    const v = { power: { value: l.on, observedAt: T_OLD } };
    if (!plug && l.kind !== 'onoff') v.brightness = { value: l.level ?? 50, observedAt: T_OLD };
    if (l.kind === 'colour' || l.kind === 'white') v.color_temperature = { value: l.kelvin ?? 3000, observedAt: T_OLD };
    if (l.kind === 'colour' && l.hue !== undefined) v.color = { value: { hue: l.hue, saturation: l.sat ?? 80, value: 100 }, observedAt: T_NEW };
    if (plug) v.power_draw = { value: l.on ? 42 : 0, observedAt: T_OLD };
    values[id] = v;
    const h = (at: string, value: boolean, n: number) => history.push({ id: i * 10 + n, device_id: id, capability: 'power', value, observed_at: at });
    if (i % 3 === 0) { h('2026-10-17T18:10:00.000Z', true, 1); h('2026-10-17T23:40:00.000Z', false, 2); if (l.on) h('2026-10-18T06:30:00.000Z', true, 3); }
    else if (i % 3 === 1) { h('2026-10-18T07:00:00.000Z', true, 1); h('2026-10-18T08:20:00.000Z', false, 2); if (l.on) h('2026-10-18T12:15:00.000Z', true, 3); }
    else if (l.on) h('2026-10-18T13:20:00.000Z', true, 1);
  });
  return { devices, values, history };
}

const NAMED: L[] = [
  { name: 'Hall lamp', kind: 'colour', on: true, level: 60, hue: 32, sat: 58 },
  { name: 'Desk light', kind: 'colour', on: true, level: 40, hue: 220, sat: 90 },
  { name: 'Shelf strip', kind: 'white', on: true, level: 80, kelvin: 3000 },
  { name: 'Floor lamp', kind: 'colour', on: false, level: 50, hue: 300, sat: 70 },
  { name: 'Porch light', kind: 'colour', on: false, online: false },
  { name: 'Nook lamp', kind: 'dim', on: true, level: 8 },
];
const LONG: L[] = [
  { name: 'Living room ceiling light above the big sofa near the window', kind: 'colour', on: true, level: 1, hue: 0, sat: 100 },
  { name: 'Ceiling light 1', kind: 'white', on: true, level: 100, kelvin: 6500 },
  { name: 'Ceiling light 2', kind: 'white', on: false, level: 30, kelvin: 2700 },
];
const MANY: L[] = Array.from({ length: 40 }, (_, i) => ({ name: `House light ${String(i + 1)}`, kind: i % 3 === 0 ? 'colour' : 'white', on: i % 4 !== 0, level: (i * 13) % 100 + 1, hue: (i * 37) % 360, sat: 70, online: i % 9 !== 5 }));
const MIXED: L[] = [
  { name: 'Hall lamp', kind: 'colour', on: true, level: 60, hue: 32, sat: 58 },
  { name: 'Desk light', kind: 'white', on: false, level: 40, kelvin: 4000 },
  { name: 'TV plug', kind: 'plug', on: true },
  { name: 'Heater plug', kind: 'plug', on: false },
];
const OFFLINE: L[] = NAMED.slice(0, 4).map((l) => ({ ...l, online: false }));
const ALLOFF: L[] = NAMED.slice(0, 4).map((l) => ({ ...l, on: false }));
const ROOM: L[] = [
  { name: 'Ceiling light', kind: 'colour', on: true, level: 70, hue: 32, sat: 58, room: 2 },
  { name: 'Bedside lamp', kind: 'white', on: true, level: 30, kelvin: 2700, room: 2 },
  { name: 'Wardrobe light', kind: 'dim', on: false, level: 50, room: 2 },
  { name: 'Hidden strip', kind: 'colour', on: true, level: 50, hue: 120, room: 2, hidden: true },
  { name: 'Hall lamp', kind: 'colour', on: true, level: 60, hue: 32, room: 1 },
];

const OUTCOMES = (ids) => [
  { status: 'failed', deviceId: ids[1], reason: 'no_response' },
  { status: 'skipped', deviceId: ids[4], reason: 'offline' },
  { status: 'pending', deviceId: ids[3] },
  { status: 'failed', deviceId: uid(777), reason: 'refused', detail: 'Value outside range' },
];

const scenarios = [
  { name: 'named', list: NAMED, group: true },
  { name: 'result', list: NAMED, group: true, outcomes: true, member: uid(1) },
  { name: 'expanded', list: NAMED, group: true, member: uid(2) },
  { name: 'long', list: LONG, group: true, groupName: 'The really long named group of upstairs and downstairs lights' },
  { name: 'many', list: MANY, group: true },
  { name: 'mixed', list: MIXED, group: true, groupName: 'Living room evening' },
  { name: 'offline', list: OFFLINE, group: true },
  { name: 'alloff', list: ALLOFF, group: true },
  { name: 'lost', list: NAMED.slice(0, 3), group: true, extraIds: [uid(555), uid(556)] },
  { name: 'empty', list: [], group: true, extraIds: [] },
  { name: 'removed', list: NAMED, group: false, removed: true },
  { name: 'room', list: ROOM, room: 2 },
  { name: 'loading', list: NAMED, group: true, loading: true },
  { name: 'nohistory', list: NAMED, group: true, noHistory: true },
];

function storeOf(sc) {
  const { devices, values, history } = build(sc.list);
  const store = new EntityStore();
  const base = stateFixture(devices, values);
  const ids = devices.map((d) => d.id);
  const groups = sc.group ? { [GROUP]: { id: GROUP, name: sc.groupName ?? 'Downstairs lights', device_ids: sc.name === 'empty' ? [uid(999)] : [...ids.filter((_, i) => true), ...(sc.extraIds ?? [])], created_at: T_OLD, updated_at: T_OLD } } : {};
  store.update(() => ({ ...base, tables: { ...base.tables, device_groups: makeTable(groups, Object.keys(groups), 1) }, loaded: !sc.loading, ownerId: undefined, settings: SETTINGS_ROW.parse({ home_name: 'Home', time_zone: 'Europe/London', latitude: null, longitude: null, public_url: null, public_url_checked_at: null, public_url_verified_at: null, public_url_error: null, ice_servers: [], webrtc_candidates: [], push_project_id: null, updated_at: '2026-10-18T10:00:00.000Z' }) }) as never);
  return { store, devices, history, ids };
}

function wrap(theme, store, client, node) {
  const tree = createElement(QueryClientProvider, { client },
    createElement(PaletteContext, { value: paletteOf(theme) as never },
      createElement(LightingContext, { value: LIGHTING[theme] },
        createElement(ScreenPausedContext, { value: new ScreenPause(null) }, node))));
  return renderToStaticMarkup(createElement(() => StoreProvider({ runtime: { store, ledger: new CommandLedger(store) }, children: tree })));
}

function WithOutcomes({ target, params, outcomes }) {
  const load = useGroupLoad(target, undefined);
  if (load.status !== 'ready') return null;
  const data = { ...load.data, master: { ...load.data.master, outcomes } };
  return createElement(GroupPage, { data, group: null, params, onEdited: () => undefined, addToHome: () => undefined });
}

function renderGroup(sc, theme) {
  const { store, devices, history, ids } = storeOf(sc);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const pool = sc.room !== undefined ? devices.filter((d) => !d.hidden && d.room_id === `room-${String(sc.room)}` && d.kind === 'light') : devices;
  const powered = [...pool.filter((d) => d.online), ...pool.filter((d) => !d.online)].map((d) => d.id);
  for (const win of ['day', 'week']) client.setQueryData(targetHistoryKey(powered, win), { changes: changesByDevice(sc.noHistory ? [] : history, () => 'power'), before: new Map(), at: NOW });
  const target = sc.room !== undefined ? roomLightsTarget(`room-${String(sc.room)}`) : { kind: 'group', groupId: GROUP };
  const params = { member: sc.member ?? null, edit: false, focus: null };
  const node = sc.outcomes
    ? createElement(WithOutcomes, { target, params, outcomes: OUTCOMES(ids) })
    : createElement(GroupScreen, { target, params, addToHome: () => undefined });
  return wrap(theme, store, client, node);
}

const FACE_FRAMES = [
  ['xs-phone', 326, 96, 'touch', 'S'],
  ['xs-pointer', 508, 120, 'pointer', 'S'],
  ['m-phone358', 326, 168, 'touch', 'M'],
  ['m-phone412', 380, 168, 'touch', 'M'],
  ['l-phone', 326, 324, 'touch', 'L'],
  ['w-pointer', 1072, 120, 'pointer', 'W'],
  ['w-tablet', 600, 120, 'pointer', 'W'],
  ['xl-pointer', 1072, 296, 'pointer', 'XL'],
] as const;

const FACE_LIGHTS: L[] = [
  { name: 'Amber colour bulb 60', kind: 'colour', on: true, level: 60, hue: 32, sat: 58 },
  { name: 'Blue colour bulb 1', kind: 'colour', on: true, level: 1, hue: 225, sat: 100 },
  { name: 'White bulb 100', kind: 'white', on: true, level: 100, kelvin: 4000 },
  { name: 'Dimmer only 50', kind: 'dim', on: true, level: 50 },
  { name: 'Off colour bulb', kind: 'colour', on: false, level: 40, hue: 300, sat: 70 },
  { name: 'Offline bulb', kind: 'colour', on: true, level: 50, online: false },
];

function safe(fn: () => string): string {
  try { return fn(); } catch (e) { return `<pre style="color:red;white-space:pre-wrap">${String(e instanceof Error ? e.stack : e).slice(0, 1500)}</pre>`; }
}

it('renders', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T14:00:00.000Z'));
  const { StyleSheet } = await import('react-native-web');
  globalThis.requestAnimationFrame = (() => 1) as never;
  globalThis.cancelAnimationFrame = (() => undefined) as never;
  const out = {};
  const only = process.env['GL_ONLY'] ?? '';
  for (const theme of ['dark', 'light'] as const) {
    for (const sc of scenarios.filter((s) => s.name.includes(only))) {
      for (const w of [358, 412, 1024, 1440]) {
        env.width = w; env.height = 1000; env.idiom = w >= 1024 ? 'pointer' : 'touch'; env.measure = w; env.grid = w >= 1024 ? Math.round((w - 48 - 24) / 2) : w - 32;
        out[`page__${sc.name}__${String(w)}__${theme}`] = { html: safe(() => renderGroup(sc, theme)), w, h: 900, theme, kind: 'page', group: 'gp', label: sc.name };
      }
    }
    if (only === '' || only === 'faces') {
      const { store, devices } = storeOf({ list: FACE_LIGHTS, name: 'faces' });
      for (const [cls, w, h, idiom, size] of FACE_FRAMES) {
        env.width = 412; env.idiom = idiom; env.measure = Math.round(w * 0.6);
        devices.forEach((d, i) => {
          const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
          out[`card__${FACE_LIGHTS[i].name.replace(/ /g, '-')}__${cls}__${theme}`] = {
            html: safe(() => wrap(theme, store, client, createElement(DeviceSpotlightWidget, { deviceId: d.id, size, editing: false, frame: { width: w, height: h, idiom } }))),
            w, h, theme, kind: 'card', group: cls, label: `${FACE_LIGHTS[i].name} ${cls}`,
          };
        });
      }
      for (const w of [412, 1440]) {
        env.width = w; env.idiom = w >= 1024 ? 'pointer' : 'touch'; env.measure = Math.min(w, 700) - 64;
        for (const i of [0, 2, 4]) {
          const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
          out[`hero__${FACE_LIGHTS[i].name.replace(/ /g, '-')}__${String(w)}__${theme}`] = { html: safe(() => wrap(theme, store, client, createElement(DeviceScreen, { deviceId: devices[i].id, section: 'overview' }))), w, h: 900, theme, kind: 'page', group: 'hero', label: 'hero' };
        }
      }
    }
  }
  writeFileSync(`${S}/render.json`, JSON.stringify({ out, sheet: StyleSheet.getSheet().textContent }));
}, 900_000);
