import {
  openAssistantSettings,
  openOverlaySettings,
  overlayLinked,
  overlayStatus as nativeOverlayStatus,
  type OverlayStatus,
} from '../../../../modules/health-connect';

export { openAssistantSettings, openOverlaySettings };
export type { OverlayStatus };

export function overlayStatus(): OverlayStatus | null {
  return overlayLinked() ? nativeOverlayStatus() : null;
}
