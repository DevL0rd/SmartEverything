import type { TilingChange, TilingWorkspaceReference } from '@smarteverything/domain';

interface KonveyorAction {
  readonly name: string;
  readonly arguments: readonly string[];
  readonly properties: Readonly<Record<string, string>>;
  readonly id: number | null;
}

function action(
  name: string,
  parts: Partial<Pick<KonveyorAction, 'arguments' | 'properties' | 'id'>> = {},
): KonveyorAction {
  return { name, arguments: [], properties: {}, id: null, ...parts };
}

function flag(value: boolean): string {
  return value ? 'true' : 'false';
}

function workspaceProperty(
  workspace: TilingWorkspaceReference | undefined,
): Readonly<Record<string, string>> {
  return workspace === undefined ? {} : { workspace: String(workspace) };
}

function actionOf(change: TilingChange): KonveyorAction {
  switch (change.action) {
    case 'focus-window':
      return action('focus-window', { id: change.windowId });
    case 'focus-workspace':
      return action('focus-workspace', { arguments: [String(change.workspace)] });
    case 'move-window-to-workspace':
      return action('move-window-to-workspace', {
        arguments: [String(change.workspace)],
        properties: { focus: flag(change.focus) },
        id: change.windowId,
      });
    case 'move-column-to-workspace':
      return action('move-column-to-workspace', {
        arguments: [String(change.workspace)],
        properties: { focus: flag(change.focus) },
      });
    case 'move-column-to-monitor':
      return action('move-column-to-monitor', { arguments: [change.output] });
    case 'switch-preset-column-width':
      return action('switch-preset-column-width');
    case 'center-column':
      return action('center-column');
    case 'toggle-overview':
      return action('toggle-overview');
    case 'set-workspace-name':
      return action('set-workspace-name', {
        arguments: [change.name],
        properties: workspaceProperty(change.workspace),
      });
  }
}

export function konveyorActionJson(change: TilingChange): string {
  return JSON.stringify(actionOf(change));
}
