import { TILING_CHANGE, TILING_STATE, type TilingChange } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { NodeFailureError } from '../../../src/node/node-failure';
import { konveyorActionJson } from '../../../src/node/controls/linux/konveyor-action';
import { KonveyorTiling } from '../../../src/node/controls/linux/konveyor';
import { FakeKonveyorBus, WORKSPACES_SAMPLE } from './fake-konveyor';

function rig(bus = new FakeKonveyorBus()): {
  readonly bus: FakeKonveyorBus;
  readonly tiling: KonveyorTiling;
  readonly failures: unknown[];
} {
  const failures: unknown[] = [];
  const tiling = new KonveyorTiling({
    open: (): Promise<FakeKonveyorBus> => Promise.resolve(bus),
    failed: (cause): void => {
      failures.push(cause);
    },
  });
  return { bus, tiling, failures };
}

const ACTIONS: readonly (readonly [TilingChange, unknown])[] = [
  [
    { action: 'focus-window', windowId: 7 },
    { name: 'focus-window', arguments: [], properties: {}, id: 7 },
  ],
  [
    { action: 'focus-workspace', workspace: 2 },
    { name: 'focus-workspace', arguments: ['2'], properties: {}, id: null },
  ],
  [
    { action: 'focus-workspace', workspace: 'code' },
    { name: 'focus-workspace', arguments: ['code'], properties: {}, id: null },
  ],
  [
    { action: 'move-window-to-workspace', windowId: 9, workspace: 'web', focus: false },
    {
      name: 'move-window-to-workspace',
      arguments: ['web'],
      properties: { focus: 'false' },
      id: 9,
    },
  ],
  [
    { action: 'move-column-to-workspace', workspace: 3, focus: true },
    {
      name: 'move-column-to-workspace',
      arguments: ['3'],
      properties: { focus: 'true' },
      id: null,
    },
  ],
  [
    { action: 'move-column-to-monitor', output: 'HDMI-A-1' },
    { name: 'move-column-to-monitor', arguments: ['HDMI-A-1'], properties: {}, id: null },
  ],
  [
    { action: 'switch-preset-column-width' },
    { name: 'switch-preset-column-width', arguments: [], properties: {}, id: null },
  ],
  [{ action: 'center-column' }, { name: 'center-column', arguments: [], properties: {}, id: null }],
  [
    { action: 'toggle-overview' },
    { name: 'toggle-overview', arguments: [], properties: {}, id: null },
  ],
  [
    { action: 'set-workspace-name', name: 'mail' },
    { name: 'set-workspace-name', arguments: ['mail'], properties: {}, id: null },
  ],
  [
    { action: 'set-workspace-name', name: 'mail', workspace: 2 },
    {
      name: 'set-workspace-name',
      arguments: ['mail'],
      properties: { workspace: '2' },
      id: null,
    },
  ],
];

describe('the Konveyor action sent for each allowed change', () => {
  it.each(ACTIONS)('maps %j to exactly the action Konveyor expects', (change, expected) => {
    expect(JSON.parse(konveyorActionJson(TILING_CHANGE.parse(change)))).toEqual(expected);
  });
});

describe('Konveyor tiling presence', () => {
  it('is a feature only while Konveyor owns its name on the session bus', async () => {
    const { bus, tiling } = rig();
    await expect(tiling.features()).resolves.toEqual(['tiling']);
    bus.owned = false;
    await expect(tiling.features()).resolves.toEqual([]);
    expect(bus.calls[0]).toMatchObject({
      destination: 'org.freedesktop.DBus',
      member: 'NameHasOwner',
      body: ['org.kde.Konveyor'],
    });
  });

  it('offers nothing when nobody is signed in instead of failing', async () => {
    const tiling = new KonveyorTiling({
      open: (): Promise<never> =>
        Promise.reject(new NodeFailureError('no_session', 'Nobody is signed in.')),
      failed: (): void => undefined,
    });
    await expect(tiling.features()).resolves.toEqual([]);
  });

  it('lets any other failure through', async () => {
    const tiling = new KonveyorTiling({
      open: (): Promise<never> => Promise.reject(new Error('bus broke')),
      failed: (): void => undefined,
    });
    await expect(tiling.features()).rejects.toThrow('bus broke');
  });

  it('tells when Konveyor appears or disappears and ignores every other name', async () => {
    const { bus, tiling } = rig();
    const changes = vi.fn();
    const stop = tiling.watchPresence(changes);
    await vi.waitFor(() => {
      expect(bus.watching('NameOwnerChanged')).toBe(true);
    });
    bus.emit('NameOwnerChanged', ['org.kde.Konveyor', '', ':1.77']);
    bus.emit('NameOwnerChanged', ['org.kde.Konveyor', ':1.77', '']);
    bus.emit('NameOwnerChanged', ['org.example.other', '', ':1.9']);
    expect(changes).toHaveBeenCalledTimes(2);
    expect(bus.rules[0]).toMatchObject({ sender: 'org.freedesktop.DBus' });
    stop();
    expect(bus.watching('NameOwnerChanged')).toBe(false);
  });

  it('does not stay on when a presence watch is stopped before the bus answers', async () => {
    const { bus, tiling } = rig();
    tiling.watchPresence(() => undefined)();
    await vi.waitFor(() => {
      expect(bus.rules).toHaveLength(1);
    });
    await vi.waitFor(() => {
      expect(bus.watching('NameOwnerChanged')).toBe(false);
    });
  });
});

describe('reading the Konveyor layout', () => {
  it('turns what Konveyor reports into the tiling state and keeps what it adds', async () => {
    const { tiling } = rig();
    const state = await tiling.read();
    expect(TILING_STATE.parse(state)).toEqual({
      overviewOpen: false,
      outputs: [{ name: 'DP-1', width: 2560, height: 1440 }],
      workspaces: [
        {
          id: 1,
          index: 1,
          name: 'code',
          output: 'DP-1',
          active: true,
          focused: true,
          urgent: false,
          activeWindowId: 7,
          columns: [{ display: 'normal', windowIds: [7] }],
        },
        {
          id: 2,
          index: 2,
          name: null,
          output: 'DP-1',
          active: false,
          focused: false,
          urgent: true,
          activeWindowId: null,
          columns: [],
        },
      ],
      windows: [
        {
          id: 7,
          title: 'main.ts - Editor',
          appId: 'org.kde.kate',
          workspaceId: 1,
          focused: true,
          floating: false,
          urgent: false,
        },
        {
          id: 9,
          title: 'Terminal',
          appId: 'org.example.terminal',
          workspaceId: 1,
          focused: false,
          floating: true,
          urgent: true,
        },
      ],
    });
  });

  it('says that Konveyor is not running when its name has no owner', async () => {
    const bus = new FakeKonveyorBus();
    bus.owned = false;
    await expect(rig(bus).tiling.read()).rejects.toMatchObject({
      name: 'NodeFailureError',
      code: 'not_supported',
    });
  });

  it('fails loudly when Konveyor answers with something that is not its layout', async () => {
    const bus = new FakeKonveyorBus();
    bus.windows = [{ id: 'seven' }];
    await expect(rig(bus).tiling.read()).rejects.toThrow();
  });

  it('fails loudly when a column has no display mode', async () => {
    const bus = new FakeKonveyorBus();
    bus.workspaces = [{ ...WORKSPACES_SAMPLE[0], column_displays: [] }];
    await expect(rig(bus).tiling.read()).rejects.toThrow(/display modes/);
  });
});

describe('changing the Konveyor layout', () => {
  it('sends the allowed action as JSON and answers the layout afterwards', async () => {
    const { bus, tiling } = rig();
    const state = await tiling.change({ action: 'toggle-overview' });
    const action = bus.calls.find((call) => call.member === 'Action');
    expect(action).toMatchObject({
      destination: 'org.kde.Konveyor',
      path: '/Konveyor',
      iface: 'org.kde.Konveyor',
      signature: 's',
    });
    expect(JSON.parse(String(action?.body?.[0]))).toEqual({
      name: 'toggle-overview',
      arguments: [],
      properties: {},
      id: null,
    });
    expect(state.workspaces).toHaveLength(2);
  });

  it('turns the error text Konveyor answers with into a named failure', async () => {
    const bus = new FakeKonveyorBus();
    bus.refusal = 'no window with id 7';
    const { tiling } = rig(bus);
    const failure = await tiling
      .change({ action: 'focus-window', windowId: 7 })
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(NodeFailureError);
    expect(failure).toMatchObject({
      code: 'failed',
      message: 'Konveyor did not do that: no window with id 7',
    });
  });

  it('never reaches the configuration loader, app rules or any other Konveyor call', async () => {
    const { bus, tiling } = rig();
    for (const [change] of ACTIONS) {
      await tiling.change(change);
    }
    expect(new Set(bus.members())).toEqual(
      new Set(['NameHasOwner', 'Action', 'Windows', 'Workspaces', 'Outputs', 'OverviewState']),
    );
  });

  it('refuses while Konveyor is not running', async () => {
    const bus = new FakeKonveyorBus();
    bus.owned = false;
    await expect(rig(bus).tiling.change({ action: 'center-column' })).rejects.toMatchObject({
      code: 'not_supported',
    });
    expect(bus.members()).not.toContain('Action');
  });
});

describe('following the Konveyor layout', () => {
  async function watching(): Promise<ReturnType<typeof rig> & { readonly seen: unknown[] }> {
    const made = rig();
    const seen: unknown[] = [];
    made.tiling.watch((state) => seen.push(state));
    await vi.waitFor(() => {
      expect(seen).toHaveLength(1);
      expect(made.bus.watching('LayoutChanged')).toBe(true);
    });
    return { ...made, seen };
  }

  it('sends the layout once to a new watcher and listens to the layout signal of Konveyor only', async () => {
    const { bus } = await watching();
    expect(bus.rules).toContainEqual({
      sender: 'org.kde.Konveyor',
      path: '/Konveyor',
      iface: 'org.kde.Konveyor',
      member: 'LayoutChanged',
    });
    expect(bus.reads).toBe(1);
  });

  it('reads the layout once and sends one frame for each signal', async () => {
    const { bus, seen } = await watching();
    bus.overviewOpen = true;
    bus.emit('LayoutChanged');
    await vi.waitFor(() => {
      expect(seen).toHaveLength(2);
    });
    expect(bus.reads).toBe(2);
  });

  it('stays quiet when a signal left the layout as it was', async () => {
    const { bus, seen } = await watching();
    bus.emit('LayoutChanged');
    await vi.waitFor(() => {
      expect(bus.reads).toBe(2);
    });
    expect(seen).toHaveLength(1);
  });

  it('folds signals that arrive during a read into one more read', async () => {
    const { bus, seen } = await watching();
    const release = bus.holdReads();
    bus.overviewOpen = true;
    bus.emit('LayoutChanged');
    await vi.waitFor(() => {
      expect(bus.reads).toBe(2);
    });
    bus.emit('LayoutChanged');
    bus.emit('LayoutChanged');
    bus.emit('LayoutChanged');
    release();
    await vi.waitFor(() => {
      expect(bus.reads).toBe(3);
    });
    await vi.waitFor(() => {
      expect(seen).toHaveLength(2);
    });
    expect(bus.reads).toBe(3);
  });

  it('reads again when Konveyor comes back and sends nothing while it is gone', async () => {
    const { bus, seen } = await watching();
    bus.owned = false;
    bus.emit('NameOwnerChanged', ['org.kde.Konveyor', ':1.77', '']);
    await vi.waitFor(() => {
      expect(bus.members().filter((member) => member === 'NameHasOwner')).toHaveLength(2);
    });
    expect(seen).toHaveLength(1);
    bus.owned = true;
    bus.overviewOpen = true;
    bus.emit('NameOwnerChanged', ['org.kde.Konveyor', '', ':1.78']);
    await vi.waitFor(() => {
      expect(seen).toHaveLength(2);
    });
  });

  it('stops listening with the last watcher and closes the bus when stopped', async () => {
    const made = rig();
    const stop = made.tiling.watch(() => undefined);
    await vi.waitFor(() => {
      expect(made.bus.watching('LayoutChanged')).toBe(true);
    });
    stop();
    expect(made.bus.watching('LayoutChanged')).toBe(false);
    expect(made.bus.watching('NameOwnerChanged')).toBe(false);
    await made.tiling.stop();
    expect(made.bus.closed).toBe(true);
  });

  it('reports a read that fails instead of swallowing it', async () => {
    const made = rig();
    made.bus.windows = 'not a list';
    made.tiling.watch(() => undefined);
    await vi.waitFor(() => {
      expect(made.failures).toHaveLength(1);
    });
  });
});
