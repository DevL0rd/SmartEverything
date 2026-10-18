import { OVERLAY_HOST_VIEW, type OverlayAction } from '@smarteverything/domain/voice-overlay';
import { z } from 'zod';

export const OVERLAY_ROLES = ['glow', 'pill', 'tray'] as const;
export const OVERLAY_ROLE = z.enum(OVERLAY_ROLES);
export type OverlayRole = z.infer<typeof OVERLAY_ROLE>;

export const OVERLAY_LEVELS_PORT_CHANNEL = 'desktop:overlay-levels';

export const OVERLAY_ROLE_ARGUMENT = '--overlay-role=';

export const OVERLAY_CHANNELS = {
  state: 'overlay:state',
  levels: 'overlay:levels',
  act: 'overlay:act',
  size: 'overlay:size',
  tray: 'overlay:tray',
  hold: 'overlay:hold',
  exited: 'overlay:exited',
  ready: 'overlay:ready',
} as const;

export const OVERLAY_PAGE_STATE = z.strictObject({
  view: OVERLAY_HOST_VIEW,
  trayOpen: z.boolean(),
  gpu: z.boolean(),
});
export type OverlayPageState = z.infer<typeof OVERLAY_PAGE_STATE>;

export const OVERLAY_LEVELS = z.strictObject({
  in: z.number(),
  out: z.number(),
  at: z.number(),
});
export type OverlayLevels = z.infer<typeof OVERLAY_LEVELS>;

export const OVERLAY_SIZE = z.strictObject({
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(2000),
});
export type OverlaySize = z.infer<typeof OVERLAY_SIZE>;

export interface OverlayBridge {
  readonly role: OverlayRole;
  onState(listener: (state: OverlayPageState) => void): () => void;
  onLevels(listener: (levels: OverlayLevels) => void): () => void;
  act(action: OverlayAction): void;
  size(size: OverlaySize): void;
  tray(open: boolean): void;
  hold(active: boolean): void;
  exited(): void;
  ready(): void;
}
