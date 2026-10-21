import { z } from 'zod';

export const WINDOW_ACTIONS = ['focus', 'minimise', 'close'] as const;

export type WindowAction = (typeof WINDOW_ACTIONS)[number];

export const WINDOW_ROW = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  app: z.strictObject({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
  desktop: z.string().min(1).nullable(),
  minimised: z.boolean(),
  focused: z.boolean(),
});

export type WindowRow = z.infer<typeof WINDOW_ROW>;

export const WINDOWS_STATE = z.strictObject({ windows: z.array(WINDOW_ROW) });

export type WindowsState = z.infer<typeof WINDOWS_STATE>;

export const WINDOW_CHANGE = z.strictObject({
  windowId: z.string().min(1).describe('A window id from computer_read windows'),
  action: z.enum(WINDOW_ACTIONS),
});

export type WindowChange = z.infer<typeof WINDOW_CHANGE>;
