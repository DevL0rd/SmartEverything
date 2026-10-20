import {
  TILING_COLUMN_DISPLAYS,
  type TilingColumnDisplay,
  type TilingState,
} from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';

const WINDOW_ID = z.int().positive();

export const KONVEYOR_WINDOWS = z.array(
  z.looseObject({
    id: WINDOW_ID,
    title: z.string(),
    app_id: z.string(),
    workspace_id: z.int().nonnegative(),
    is_focused: z.boolean(),
    is_floating: z.boolean(),
    is_urgent: z.boolean(),
  }),
);

export const KONVEYOR_WORKSPACES = z.array(
  z.looseObject({
    id: z.int().nonnegative(),
    idx: z.int().positive(),
    name: z.string().min(1).nullable(),
    output: z.string(),
    is_urgent: z.boolean(),
    is_active: z.boolean(),
    is_focused: z.boolean(),
    active_window_id: WINDOW_ID.nullable(),
    columns: z.array(z.array(WINDOW_ID)),
    column_displays: z.array(z.enum(TILING_COLUMN_DISPLAYS)),
  }),
);

export const KONVEYOR_OUTPUTS = z.array(
  z.looseObject({
    name: z.string().min(1),
    logical: z.looseObject({ width: z.number().positive(), height: z.number().positive() }),
  }),
);

export const KONVEYOR_OVERVIEW = z.looseObject({ is_open: z.boolean() });

function displayOf(
  displays: readonly TilingColumnDisplay[],
  position: number,
): TilingColumnDisplay {
  const display = displays[position];
  if (display === undefined) {
    throw new NodeFailureError(
      'failed',
      `Konveyor listed ${String(displays.length)} column display modes but a column at position ${String(position)}.`,
    );
  }
  return display;
}

export interface KonveyorReadings {
  readonly windows: z.output<typeof KONVEYOR_WINDOWS>;
  readonly workspaces: z.output<typeof KONVEYOR_WORKSPACES>;
  readonly outputs: z.output<typeof KONVEYOR_OUTPUTS>;
  readonly overview: z.output<typeof KONVEYOR_OVERVIEW>;
}

export function tilingStateOf(readings: KonveyorReadings): TilingState {
  return {
    overviewOpen: readings.overview.is_open,
    outputs: readings.outputs.map((output) => ({
      name: output.name,
      width: output.logical.width,
      height: output.logical.height,
    })),
    workspaces: readings.workspaces.map((workspace) => ({
      id: workspace.id,
      index: workspace.idx,
      name: workspace.name,
      output: workspace.output,
      active: workspace.is_active,
      focused: workspace.is_focused,
      urgent: workspace.is_urgent,
      activeWindowId: workspace.active_window_id,
      columns: workspace.columns.map((windowIds, position) => ({
        display: displayOf(workspace.column_displays, position),
        windowIds,
      })),
    })),
    windows: readings.windows.map((window) => ({
      id: window.id,
      title: window.title,
      appId: window.app_id,
      workspaceId: window.workspace_id,
      focused: window.is_focused,
      floating: window.is_floating,
      urgent: window.is_urgent,
    })),
  };
}
