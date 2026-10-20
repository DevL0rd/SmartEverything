import {
  openAssistantSettings,
  openOverlaySettings,
  overlayLinked,
  overlayStatus as nativeOverlayStatus,
  resetOverlayPosition,
  type OverlayStatus,
} from '../../../../modules/health-connect';

export { openAssistantSettings, openOverlaySettings, resetOverlayPosition };
export type { OverlayStatus };

export function overlayStatus(): OverlayStatus | null {
  return overlayLinked() ? nativeOverlayStatus() : null;
}
