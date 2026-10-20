import type {
  TilingChange,
  TilingState,
  TilingWindow,
  TilingWorkspace,
  TilingWorkspaceReference,
} from '@smarteverything/domain';

export interface TilingWindowView {
  readonly id: number;
  readonly label: string;
  readonly focused: boolean;
  readonly urgent: boolean;
}

export interface TilingColumnView {
  readonly key: string;
  readonly tabbed: boolean;
  readonly windows: readonly TilingWindowView[];
}

export interface TilingWorkspaceView {
  readonly id: number;
  readonly title: string;
  readonly shown: boolean;
  readonly focused: boolean;
  readonly urgent: boolean;
  readonly columns: readonly TilingColumnView[];
  readonly floating: readonly TilingWindowView[];
  readonly open: TilingChange | null;
}

export interface TilingScreenView {
  readonly name: string;
  readonly workspaces: readonly TilingWorkspaceView[];
}

export const TILING_OVERVIEW: TilingChange = { action: 'toggle-overview' };

export const TILING_CENTER: TilingChange = { action: 'center-column' };

export const TILING_CYCLE_WIDTH: TilingChange = { action: 'switch-preset-column-width' };

export function windowLabel(window: Pick<TilingWindow, 'title' | 'appId'>): string {
  if (window.title !== '') return window.title;
  return window.appId === '' ? 'Untitled window' : window.appId;
}

function viewOfWindow(window: TilingWindow): TilingWindowView {
  return {
    id: window.id,
    label: windowLabel(window),
    focused: window.focused,
    urgent: window.urgent,
  };
}

function referenceOf(
  workspace: TilingWorkspace,
  focusedOutput: string | null,
): TilingWorkspaceReference | null {
  if (workspace.name !== null) return workspace.name;
  return workspace.output === focusedOutput ? workspace.index : null;
}

function openChange(workspace: TilingWorkspace, focusedOutput: string | null): TilingChange | null {
  const reference = referenceOf(workspace, focusedOutput);
  if (reference !== null) return { action: 'focus-workspace', workspace: reference };
  return workspace.activeWindowId === null
    ? null
    : { action: 'focus-window', windowId: workspace.activeWindowId };
}

function viewOfWorkspace(
  workspace: TilingWorkspace,
  windows: ReadonlyMap<number, TilingWindow>,
  focusedOutput: string | null,
): TilingWorkspaceView {
  const tiled = new Set(workspace.columns.flatMap((column) => column.windowIds));
  const floating = [...windows.values()].filter(
    (window) => window.workspaceId === workspace.id && !tiled.has(window.id),
  );
  return {
    id: workspace.id,
    title: workspace.name ?? `Workspace ${String(workspace.index)}`,
    shown: workspace.active,
    focused: workspace.focused,
    urgent: workspace.urgent,
    columns: workspace.columns.map((column, position) => ({
      key: `${String(workspace.id)}-${String(position)}`,
      tabbed: column.display === 'tabbed',
      windows: column.windowIds.flatMap((id) => {
        const window = windows.get(id);
        return window === undefined ? [] : [viewOfWindow(window)];
      }),
    })),
    floating: floating.map(viewOfWindow),
    open: openChange(workspace, focusedOutput),
  };
}

export function tilingScreens(state: TilingState): readonly TilingScreenView[] {
  const windows = new Map(state.windows.map((window) => [window.id, window] as const));
  const focusedOutput = state.workspaces.find((workspace) => workspace.focused)?.output ?? null;
  const names = [
    ...new Set([
      ...state.outputs.map((output) => output.name),
      ...state.workspaces.map((workspace) => workspace.output),
    ]),
  ];
  return names.map((name) => ({
    name,
    workspaces: state.workspaces
      .filter((workspace) => workspace.output === name)
      .sort((left, right) => left.index - right.index)
      .map((workspace) => viewOfWorkspace(workspace, windows, focusedOutput)),
  }));
}

export function focusWindowChange(window: TilingWindowView): TilingChange {
  return { action: 'focus-window', windowId: window.id };
}
