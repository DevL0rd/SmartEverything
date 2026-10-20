import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION,
  resolveNavigation,
  type NavFolder,
  type NavPin,
  type NavigationLayout,
} from '@smarteverything/domain';
import type { NavigationWriter } from './nav-layout';

const confirmAnswer = vi.hoisted(() => ({ accepted: true }));

vi.mock('../api/transport', () => ({
  api: (): { call: () => Promise<unknown> } => ({ call: () => Promise.resolve({}) }),
}));
vi.mock('../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../components/confirm-store', () => ({
  confirm: (): Promise<boolean> => Promise.resolve(confirmAnswer.accepted),
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'abcd-ef01-2345-6789' }));
vi.mock('expo-router', () => ({ router: { navigate: vi.fn() } }));
vi.mock('./routes', () => ({ TAB_ROUTES: [], ROUTES: [] }));
vi.mock('../features/device-visuals', () => ({ deviceIcon: (): string => 'bulb' }));
vi.mock('../settings/tree', () => ({ settingsPage: (): undefined => undefined }));
vi.mock('../settings/registry', () => ({ settingPageOf: (): undefined => undefined }));

const { activeLayoutOf, newNavId, pinLeavesOf, pinsOf, prewarmOrderOf } =
  await import('./nav-layout');
const { confirmRemoveMissing } = await import('./nav-edit-actions');
const { PREFS, savePref } = await import('../store/prefs');
const { EntityStore } = await import('../store/entity-store');

const DEVICE = '11111111-1111-4111-8111-111111111111';

const SESSION_ROW = SESSION.parse({
  client: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: '00000000-0000-4000-8000-000000000002',
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
});

const pin = (id: string): NavPin => ({
  kind: 'pin',
  id,
  target: { kind: 'device', deviceId: DEVICE, focus: null },
  title: null,
  icon: null,
});

function pairedStore(): InstanceType<typeof EntityStore> {
  const store = new EntityStore();
  store.update((state) => ({ ...state, session: SESSION_ROW }));
  return store;
}

function writerSpy(): NavigationWriter & { readonly committed: NavigationLayout[] } {
  const committed: NavigationLayout[] = [];
  return {
    committed,
    commit: (next): void => {
      committed.push(next);
    },
    switchScope: (): void => undefined,
    reset: (): void => undefined,
  };
}

const allAvailable = { section: (): boolean => true, exists: (): boolean => true };

describe('which layout is active', () => {
  it('follows the layout shared by all devices until this device has its own', () => {
    const store = pairedStore();
    expect(activeLayoutOf(store.get())).toEqual({
      scope: 'all',
      layout: { items: null, hidden: [] },
    });
    const shared: NavigationLayout = { items: null, hidden: ['talk'] };
    savePref(store, PREFS.navigation, shared);
    expect(activeLayoutOf(store.get())).toEqual({ scope: 'all', layout: shared });
    const own: NavigationLayout = { items: [pin('a')], hidden: [] };
    savePref(store, PREFS.navigationDevice, { override: own });
    expect(activeLayoutOf(store.get())).toEqual({ scope: 'device', layout: own });
  });

  it('goes back to the shared layout when the device layout is discarded', () => {
    const store = pairedStore();
    savePref(store, PREFS.navigationDevice, { override: { items: [pin('a')], hidden: [] } });
    savePref(store, PREFS.navigationDevice, { override: null });
    expect(activeLayoutOf(store.get()).scope).toBe('all');
  });
});

describe('the pins of a layout', () => {
  it('finds pins at the top level and inside folders', () => {
    const folder: NavFolder = {
      kind: 'folder',
      id: 'f',
      title: 'Rooms',
      icon: 'folder',
      items: [pin('inner'), { kind: 'section', section: 'home' }],
    };
    const layout: NavigationLayout = {
      items: [pin('outer'), { kind: 'section', section: 'devices' }, folder],
      hidden: [],
    };
    expect(pinsOf(layout).map((found) => found.id)).toEqual(['outer', 'inner']);
    expect(pinsOf({ items: null, hidden: [] })).toEqual([]);
  });
});

describe('the order tabs are prewarmed in', () => {
  const orderOf = (layout: NavigationLayout): readonly string[] =>
    prewarmOrderOf(resolveNavigation(layout, allAvailable));

  it('follows the default page order and ends with settings', () => {
    expect(orderOf({ items: null, hidden: [] })).toEqual([
      '(home)',
      '(devices)',
      '(cameras)',
      '(fitness)',
      '(z-assistant)',
      '(talk)',
      '(automations)',
      '(settings)',
    ]);
  });

  it('follows the order the person chose, including sections inside folders', () => {
    const folder: NavFolder = {
      kind: 'folder',
      id: 'f',
      title: 'More',
      icon: 'folder',
      items: [{ kind: 'section', section: 'fitness' }, pin('p')],
    };
    const order = orderOf({
      items: [{ kind: 'section', section: 'automations' }, folder, pin('q')],
      hidden: [],
    });
    expect(order.slice(0, 3)).toEqual(['(automations)', '(fitness)', '(home)']);
  });

  it('leaves hidden sections out so they are not prewarmed', () => {
    const order = orderOf({ items: null, hidden: ['talk', 'cameras'] });
    expect(order).not.toContain('(talk)');
    expect(order).not.toContain('(cameras)');
    expect(order.at(-1)).toBe('(settings)');
  });
});

describe('the pages kept warm for pins', () => {
  const ROOM = '33333333-3333-4333-8333-333333333333';
  const roomPin = (id: string): NavPin => ({
    kind: 'pin',
    id,
    target: { kind: 'room', roomId: ROOM },
    title: null,
    icon: null,
  });
  const leavesOf = (layout: NavigationLayout, gone: string): readonly string[] =>
    pinLeavesOf(
      resolveNavigation(layout, {
        section: () => true,
        exists: (target) => !(target.kind === 'room' && target.roomId === gone),
      }),
    ).map((leaf) => leaf.params['deviceId'] ?? leaf.params['roomId'] ?? '');

  it('follow the layout order, inside folders too, once per page', () => {
    const folder: NavFolder = {
      kind: 'folder',
      id: 'f',
      title: 'More',
      icon: 'folder',
      items: [roomPin('inside')],
    };
    const layout: NavigationLayout = {
      items: [folder, pin('outer'), roomPin('again'), { kind: 'section', section: 'home' }],
      hidden: [],
    };
    expect(leavesOf(layout, '')).toEqual([ROOM, DEVICE]);
  });

  it('never include a pin whose target is gone', () => {
    const layout: NavigationLayout = { items: [roomPin('r'), pin('d')], hidden: [] };
    expect(leavesOf(layout, ROOM)).toEqual([DEVICE]);
  });
});

describe('ids of new navigation items', () => {
  it('are short and made only of letters and digits', () => {
    expect(newNavId()).toMatch(/^[a-z0-9]{10}$/u);
  });
});

describe('removing a pin that points at something that was removed', () => {
  beforeEach(() => {
    confirmAnswer.accepted = true;
  });

  async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('removes the pin once the person agrees', async () => {
    const store = pairedStore();
    savePref(store, PREFS.navigation, { items: [pin('gone'), pin('kept')], hidden: [] });
    const writer = writerSpy();
    confirmRemoveMissing('gone', store, writer);
    await settled();
    expect(writer.committed.map((next) => pinsOf(next).map((found) => found.id))).toEqual([
      ['kept'],
    ]);
  });

  it('keeps the pin when the person declines', async () => {
    confirmAnswer.accepted = false;
    const store = pairedStore();
    savePref(store, PREFS.navigation, { items: [pin('gone')], hidden: [] });
    const writer = writerSpy();
    confirmRemoveMissing('gone', store, writer);
    await settled();
    expect(writer.committed).toEqual([]);
  });
});
