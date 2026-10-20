import { describe, expect, it, vi } from 'vitest';
import {
  AI_CHAT_ROW,
  SCENE_ROW,
  type AiChatRow,
  type NavOpenTarget,
  type NavPinTarget,
  type RoomRow,
} from '@smarteverything/domain';
import { deviceFixture } from '../store/device-fixture';
import { emptyState, makeTable, type StoreState, type Table } from '../store/state';
import type { TargetFacts } from './nav-targets';

vi.mock('./routes', () => ({
  TAB_ROUTES: [
    { key: 'fitness', tab: 'fitness', title: 'Fitness', icon: 'fitness', href: '/fitness' },
  ],
  ROUTES: [
    { key: 'fitness', tab: 'fitness', title: 'Fitness', icon: 'fitness', href: '/fitness' },
    {
      key: 'fitness-sleep',
      tab: 'fitness',
      title: 'Sleep',
      icon: 'moon',
      href: '/fitness/sleep',
    },
    {
      key: 'automations.scenes',
      tab: 'automations',
      title: 'Scenes',
      icon: 'sparkles',
      href: '/automations/scenes',
    },
    {
      key: 'settings-appearance',
      tab: 'settings',
      title: 'Appearance',
      icon: 'customize',
      href: '/settings/appearance',
    },
  ],
}));

vi.mock('../settings/tree', () => ({
  settingsPage: (id: string): { id: string; title: string; icon: string } | undefined =>
    id === 'appearance' || id === 'appearance/navigation'
      ? { id, title: id === 'appearance' ? 'Appearance' : 'Navigation', icon: 'customize' }
      : undefined,
}));

vi.mock('../settings/registry', () => ({
  settingPageOf: (id: string): string | undefined => (id === 'theme' ? 'appearance' : undefined),
}));

vi.mock('../features/device-visuals', () => ({ deviceIcon: (): string => 'bulb' }));

const {
  leafKeyOfPath,
  navTargetHref,
  navTargetKey,
  pathnameOf,
  pinTargetOfPath,
  pinExists,
  pinnableTarget,
  targetFactsOf,
} = await import('./nav-targets');

const ID = '11111111-1111-4111-8111-111111111111';
const STAMP = '2026-10-17T10:00:00.000Z';

function roomRow(): RoomRow {
  return { id: ID, name: 'Living room', position: 0 };
}

function chatRow(unread: number): AiChatRow {
  return AI_CHAT_ROW.parse({
    id: ID,
    profile_id: ID,
    kind: 'chat',
    title: 'Dinner plan',
    icon: null,
    parent_id: null,
    source_key: null,
    engine: { kind: 'openrouter', model: 'x', effort: null },
    tools: null,
    pinned: false,
    archived_at: null,
    cost_micros: 0,
    unread_count: unread,
    last_message_at: STAMP,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function stateOf(parts: {
  readonly device?: boolean;
  readonly room?: boolean;
  readonly chat?: number;
  readonly scene?: boolean;
}): StoreState {
  const base = emptyState();
  const single = <R extends { readonly id: string }>(row: R): Table<R> =>
    makeTable({ [row.id]: row }, [row.id], 1);
  return {
    ...base,
    tables: {
      ...base.tables,
      devices:
        parts.device === true
          ? single(deviceFixture(0, { id: ID, display_name: 'Bedside lamp' }))
          : base.tables.devices,
      rooms: parts.room === true ? single(roomRow()) : base.tables.rooms,
      ai_chats: parts.chat === undefined ? base.tables.ai_chats : single(chatRow(parts.chat)),
      scenes:
        parts.scene === true
          ? single(
              SCENE_ROW.parse({
                id: ID,
                name: 'Movie',
                icon: 'tv',
                actions: [],
                position: 0,
                created_at: STAMP,
              }),
            )
          : base.tables.scenes,
    },
  };
}

describe('where a pin leads', () => {
  it.each([
    [{ kind: 'section', section: 'fitness' }, '/fitness'],
    [{ kind: 'page', path: 'fitness-sleep' }, '/fitness/sleep'],
    [
      { kind: 'room', roomId: ID },
      { pathname: '/rooms/[roomId]', params: { roomId: ID } },
    ],
    [
      { kind: 'chat', chatId: ID },
      { pathname: '/assistant/chat/[chatId]', params: { chatId: ID } },
    ],
    [
      { kind: 'device', deviceId: ID, focus: 'controls' },
      { pathname: '/device/[deviceId]', params: { deviceId: ID } },
    ],
  ] as const satisfies readonly [NavOpenTarget, unknown][])('opens %j', (target, expected) => {
    expect(navTargetHref(target)).toEqual(expected);
  });

  it('has no place for a page the app no longer has', () => {
    expect(navTargetHref({ kind: 'page', path: 'gone' })).toBeNull();
  });

  it('opens a settings page, a row on it, and finds the page of a bare row id', () => {
    expect(navTargetHref({ kind: 'setting', page: 'appearance', setting: null })).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['appearance'] },
    });
    expect(navTargetHref({ kind: 'setting', page: 'appearance', setting: 'theme' })).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['appearance'], focus: 'theme' },
    });
    expect(navTargetHref({ kind: 'setting', page: 'theme', setting: null })).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['appearance'], focus: 'theme' },
    });
    expect(navTargetHref({ kind: 'setting', page: 'nothing', setting: null })).toBeNull();
  });
});

describe('knowing the page a pin stands for', () => {
  it('matches the key of the current address for every kind of pin', () => {
    const pairs: readonly [NavOpenTarget, string][] = [
      [{ kind: 'device', deviceId: ID, focus: null }, `/device/${ID}`],
      [{ kind: 'device', deviceId: ID, focus: 'x' }, `/device/${ID}/settings/diagnostics`],
      [{ kind: 'camera', deviceId: ID }, `/cameras/${ID}`],
      [{ kind: 'room', roomId: ID }, `/rooms/${ID}/lights`],
      [{ kind: 'group', groupId: ID }, `/groups/${ID}`],
      [{ kind: 'scene', sceneId: ID }, `/automations/scenes/${ID}`],
      [{ kind: 'automation', automationId: ID, focus: null }, `/automations/${ID}/runs`],
      [{ kind: 'chat', chatId: ID }, `/assistant/chat/${ID}`],
      [{ kind: 'page', path: 'fitness-sleep' }, '/fitness/sleep'],
      [{ kind: 'page', path: 'automations.scenes' }, '/automations/scenes'],
      [
        { kind: 'setting', page: 'appearance/navigation', setting: null },
        '/settings/appearance/navigation',
      ],
      [{ kind: 'setting', page: 'theme', setting: null }, '/settings/appearance'],
    ];
    for (const [target, address] of pairs) {
      expect(leafKeyOfPath(address), address).toBe(navTargetKey(target));
    }
  });

  it('does not take a list page for an item', () => {
    for (const address of [
      '/cameras/events',
      '/groups/new',
      '/automations/runs',
      '/automations/scenes',
    ]) {
      expect(leafKeyOfPath(address)).toMatch(/^page:/u);
    }
  });

  it('ignores a trailing index and a leading slash', () => {
    expect(pathnameOf('/fitness/workouts/index')).toBe('fitness/workouts');
    expect(pathnameOf({ pathname: '/fitness/workouts', params: { start: '1' } })).toBe(
      'fitness/workouts',
    );
  });
});

describe('the pin a page offers', () => {
  it('offers the item that the address stands for, whichever sub-page of it is open', () => {
    const pairs: readonly [string, NavPinTarget][] = [
      [`/device/${ID}/settings/diagnostics`, { kind: 'device', deviceId: ID, focus: null }],
      [`/cameras/${ID}`, { kind: 'camera', deviceId: ID }],
      [`/rooms/${ID}/lights`, { kind: 'room', roomId: ID }],
      [`/groups/${ID}`, { kind: 'group', groupId: ID }],
      [`/automations/scenes/${ID}`, { kind: 'scene', sceneId: ID }],
      [`/automations/${ID}/runs`, { kind: 'automation', automationId: ID, focus: null }],
    ];
    for (const [address, target] of pairs) {
      expect(pinTargetOfPath(address), address).toStrictEqual(target);
    }
  });

  it('offers a sub-page by its route key and a page of a plugin by its plugin route', () => {
    expect(pinTargetOfPath('/fitness/sleep')).toStrictEqual({
      kind: 'page',
      path: 'fitness-sleep',
    });
    expect(pinTargetOfPath('/automations/scenes')).toStrictEqual({
      kind: 'page',
      path: 'automations.scenes',
    });
    expect(pinTargetOfPath('/plugins/garden/overview')).toStrictEqual({
      kind: 'page',
      path: 'plugin.garden.overview',
    });
  });

  it('offers nothing for a section, a chat, a setting, a list of new items or an unknown page', () => {
    for (const address of [
      '/fitness',
      '/',
      `/assistant/chat/${ID}`,
      '/settings/appearance/navigation',
      '/groups/new',
      '/cameras/events',
      '/nowhere',
      '/rooms/not-an-id',
    ]) {
      expect(pinTargetOfPath(address), address).toBeNull();
    }
  });
});

describe('what may be pinned', () => {
  it('keeps a target that opens something', () => {
    const target: NavPinTarget = { kind: 'page', path: 'fitness-sleep' };
    expect(pinnableTarget(target)).toBe(target);
  });

  it('refuses a section, a page of the settings and a target that opens nothing', () => {
    expect(pinnableTarget({ kind: 'page', path: 'settings-appearance' })).toBeNull();
    expect(pinnableTarget({ kind: 'page', path: 'settings#list:rooms' })).toBeNull();
    expect(pinnableTarget({ kind: 'page', path: 'fitness' })).toBeNull();
  });
});

describe('whether a pin still points at something', () => {
  const found: TargetFacts = { exists: true, title: 'Found', icon: 'info', count: 0 };

  it('keeps a pinnable target that exists', () => {
    const target: NavPinTarget = { kind: 'page', path: 'fitness-sleep' };
    expect(pinExists(target, new Map([[navTargetKey(target), found]]))).toBe(true);
  });

  it('treats a target missing from the facts as gone', () => {
    expect(pinExists({ kind: 'page', path: 'fitness-sleep' }, new Map())).toBe(false);
  });

  it('treats a page of the settings as gone even when a writer pinned it and it exists', () => {
    const target: NavPinTarget = { kind: 'page', path: 'settings-appearance' };
    expect(pinExists(target, new Map([[navTargetKey(target), found]]))).toBe(false);
  });
});

describe('what a pin shows', () => {
  it('shows the live name of a device with its icon', () => {
    const state = stateOf({ device: true });
    expect(targetFactsOf({ kind: 'device', deviceId: ID, focus: null }, state)).toEqual({
      exists: true,
      title: 'Bedside lamp',
      icon: 'bulb',
      count: 0,
    });
  });

  it('marks a removed room, group, scene, automation, chat and device as not found', () => {
    const state = stateOf({});
    const targets: NavOpenTarget[] = [
      { kind: 'room', roomId: ID },
      { kind: 'group', groupId: ID },
      { kind: 'scene', sceneId: ID },
      { kind: 'automation', automationId: ID, focus: null },
      { kind: 'chat', chatId: ID },
      { kind: 'device', deviceId: ID, focus: null },
      { kind: 'camera', deviceId: ID },
    ];
    for (const target of targets) {
      expect(targetFactsOf(target, state)).toMatchObject({ exists: false, title: null });
    }
  });

  it('names a room, counts the unread messages of a chat and uses the icon of a scene', () => {
    const state = stateOf({ room: true, chat: 3, scene: true });
    expect(targetFactsOf({ kind: 'room', roomId: ID }, state)).toMatchObject({
      title: 'Living room',
      icon: 'grid',
    });
    expect(targetFactsOf({ kind: 'chat', chatId: ID }, state)).toMatchObject({
      title: 'Dinner plan',
      count: 3,
    });
    expect(targetFactsOf({ kind: 'scene', sceneId: ID }, state)).toMatchObject({
      title: 'Movie',
      icon: 'tv',
    });
  });

  it('names pages, settings and sections from the app itself', () => {
    const state = stateOf({});
    expect(targetFactsOf({ kind: 'page', path: 'fitness-sleep' }, state)).toMatchObject({
      title: 'Sleep',
      icon: 'moon',
    });
    expect(targetFactsOf({ kind: 'page', path: 'gone' }, state).exists).toBe(false);
    expect(
      targetFactsOf({ kind: 'setting', page: 'appearance/navigation', setting: null }, state),
    ).toMatchObject({ exists: true, title: 'Navigation' });
    expect(targetFactsOf({ kind: 'section', section: 'fitness' }, state).title).toBe('Fitness');
  });
});
