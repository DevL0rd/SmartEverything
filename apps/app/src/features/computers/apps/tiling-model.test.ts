import { describe, expect, it } from 'vitest';
import { TILING_STATE, type TilingState } from '@smarteverything/domain';
import { tilingScreens, windowLabel, type TilingWorkspaceView } from './tiling-model';

function workspaceAt(state: TilingState, screen: number, position: number): TilingWorkspaceView {
  const found = tilingScreens(state)[screen]?.workspaces[position];
  if (found === undefined)
    throw new Error(`No workspace ${String(position)} on screen ${String(screen)}`);
  return found;
}

function window(
  id: number,
  workspaceId: number,
  extra: Partial<TilingState['windows'][number]> = {},
): TilingState['windows'][number] {
  return {
    id,
    title: `Window ${String(id)}`,
    appId: 'app',
    workspaceId,
    focused: false,
    floating: false,
    urgent: false,
    ...extra,
  };
}

const STATE: TilingState = TILING_STATE.parse({
  overviewOpen: false,
  outputs: [
    { name: 'DP-1', width: 2560, height: 1440 },
    { name: 'HDMI-A-1', width: 1920, height: 1080 },
  ],
  workspaces: [
    {
      id: 12,
      index: 2,
      name: null,
      output: 'DP-1',
      active: false,
      focused: false,
      urgent: true,
      activeWindowId: null,
      columns: [],
    },
    {
      id: 11,
      index: 1,
      name: 'code',
      output: 'DP-1',
      active: true,
      focused: true,
      urgent: false,
      activeWindowId: 7,
      columns: [
        { display: 'normal', windowIds: [7, 9] },
        { display: 'tabbed', windowIds: [11, 99] },
      ],
    },
    {
      id: 21,
      index: 1,
      name: null,
      output: 'HDMI-A-1',
      active: true,
      focused: false,
      urgent: false,
      activeWindowId: 31,
      columns: [{ display: 'normal', windowIds: [31] }],
    },
    {
      id: 22,
      index: 2,
      name: null,
      output: 'HDMI-A-1',
      active: false,
      focused: false,
      urgent: false,
      activeWindowId: 41,
      columns: [{ display: 'normal', windowIds: [41] }],
    },
  ],
  windows: [
    window(7, 11, { focused: true }),
    window(9, 11, { urgent: true }),
    window(11, 11),
    window(13, 11, { floating: true, title: '' }),
    window(31, 21),
    window(41, 22),
  ],
});

describe('the tiling layout shown for a computer', () => {
  it('groups workspaces by screen in their order and names unnamed ones by position', () => {
    const screens = tilingScreens(STATE);
    expect(screens.map((screen) => screen.name)).toEqual(['DP-1', 'HDMI-A-1']);
    expect(screens[0]?.workspaces.map((workspace) => workspace.title)).toEqual([
      'code',
      'Workspace 2',
    ]);
  });

  it('lists the columns with their windows, marks tabbed columns and skips windows that are gone', () => {
    const code = workspaceAt(STATE, 0, 0);
    expect(code.columns.map((column) => column.tabbed)).toEqual([false, true]);
    expect(code.columns.map((column) => column.windows.map((entry) => entry.id))).toEqual([
      [7, 9],
      [11],
    ]);
    expect(code.columns.flatMap((column) => column.windows)).toMatchObject([
      { id: 7, focused: true, urgent: false },
      { id: 9, focused: false, urgent: true },
      { id: 11, focused: false, urgent: false },
    ]);
  });

  it('shows a window that is in no column as floating, named by its app when it has no title', () => {
    expect(workspaceAt(STATE, 0, 0).floating).toEqual([
      { id: 13, label: 'app', focused: false, urgent: false },
    ]);
  });

  it('goes to a workspace on the focused screen by position or name', () => {
    expect(workspaceAt(STATE, 0, 0).open).toEqual({ action: 'focus-workspace', workspace: 'code' });
    expect(workspaceAt(STATE, 0, 1).open).toEqual({ action: 'focus-workspace', workspace: 2 });
  });

  it('goes to an unnamed workspace on another screen by its window, because a position counts on the focused screen', () => {
    expect(workspaceAt(STATE, 1, 0).open).toEqual({ action: 'focus-window', windowId: 31 });
    expect(workspaceAt(STATE, 1, 1).open).toEqual({ action: 'focus-window', windowId: 41 });
  });

  it('cannot go to an empty unnamed workspace on another screen', () => {
    const state: TilingState = {
      ...STATE,
      workspaces: STATE.workspaces.map((workspace) =>
        workspace.id === 22 ? { ...workspace, activeWindowId: null, columns: [] } : workspace,
      ),
    };
    expect(workspaceAt(state, 1, 1).open).toBeNull();
  });

  it('names a window by its title, then its app, then says it has none', () => {
    expect(windowLabel({ title: 'main.ts', appId: 'kate' })).toBe('main.ts');
    expect(windowLabel({ title: '', appId: 'kate' })).toBe('kate');
    expect(windowLabel({ title: '', appId: '' })).toBe('Untitled window');
  });
});
