import { z } from 'zod';

export const TILING_COLUMN_DISPLAYS = ['normal', 'tabbed'] as const;

export type TilingColumnDisplay = (typeof TILING_COLUMN_DISPLAYS)[number];

const WINDOW_ID = z.int().positive();

export const TILING_OUTPUT = z.strictObject({
  name: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
});

export type TilingOutput = z.infer<typeof TILING_OUTPUT>;

export const TILING_COLUMN = z.strictObject({
  display: z.enum(TILING_COLUMN_DISPLAYS),
  windowIds: z.array(WINDOW_ID),
});

export type TilingColumn = z.infer<typeof TILING_COLUMN>;

export const TILING_WORKSPACE = z.strictObject({
  id: z.int().nonnegative(),
  index: z.int().positive(),
  name: z.string().min(1).nullable(),
  output: z.string(),
  active: z.boolean(),
  focused: z.boolean(),
  urgent: z.boolean(),
  activeWindowId: WINDOW_ID.nullable(),
  columns: z.array(TILING_COLUMN),
});

export type TilingWorkspace = z.infer<typeof TILING_WORKSPACE>;

export const TILING_WINDOW = z.strictObject({
  id: WINDOW_ID,
  title: z.string(),
  appId: z.string(),
  workspaceId: z.int().nonnegative(),
  focused: z.boolean(),
  floating: z.boolean(),
  urgent: z.boolean(),
});

export type TilingWindow = z.infer<typeof TILING_WINDOW>;

export const TILING_STATE = z.strictObject({
  overviewOpen: z.boolean(),
  outputs: z.array(TILING_OUTPUT),
  workspaces: z.array(TILING_WORKSPACE),
  windows: z.array(TILING_WINDOW),
});

export type TilingState = z.infer<typeof TILING_STATE>;

export const TILING_WORKSPACE_REFERENCE = z
  .union([
    z.int().min(1).max(255),
    z
      .string()
      .trim()
      .min(1)
      .regex(/\D/, 'a workspace name has at least one character that is not a digit'),
  ])
  .describe(
    'A workspace position counted on the focused screen (1 is the first), or its name from get_computer view tiling',
  );

export type TilingWorkspaceReference = z.infer<typeof TILING_WORKSPACE_REFERENCE>;

const FOCUS = z
  .boolean()
  .default(true)
  .describe('Follow the move and show the target workspace (default true)');

const TARGET_WINDOW = WINDOW_ID.describe('A window id from get_computer view tiling');

export const TILING_CHANGE = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('focus-window'), windowId: TARGET_WINDOW }),
  z.strictObject({ action: z.literal('focus-workspace'), workspace: TILING_WORKSPACE_REFERENCE }),
  z.strictObject({
    action: z.literal('move-window-to-workspace'),
    windowId: TARGET_WINDOW,
    workspace: TILING_WORKSPACE_REFERENCE,
    focus: FOCUS,
  }),
  z.strictObject({
    action: z.literal('move-column-to-workspace'),
    workspace: TILING_WORKSPACE_REFERENCE,
    focus: FOCUS,
  }),
  z.strictObject({
    action: z.literal('move-column-to-monitor'),
    output: z.string().trim().min(1).describe('A screen name from get_computer view tiling'),
  }),
  z.strictObject({ action: z.literal('switch-preset-column-width') }),
  z.strictObject({ action: z.literal('center-column') }),
  z.strictObject({ action: z.literal('toggle-overview') }),
  z.strictObject({
    action: z.literal('set-workspace-name'),
    name: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/\D/, 'a workspace name has at least one character that is not a digit'),
    workspace: TILING_WORKSPACE_REFERENCE.optional(),
  }),
]);

export type TilingChange = z.infer<typeof TILING_CHANGE>;

export type TilingChangeInput = z.input<typeof TILING_CHANGE>;
