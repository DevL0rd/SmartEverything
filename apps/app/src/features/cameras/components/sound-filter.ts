import type { CameraDetection } from '@smarteverything/domain';

export function soundSelection(
  chosen: readonly CameraDetection[],
  detection: CameraDetection,
  on: boolean,
): readonly CameraDetection[] | null {
  const next = on ? [...chosen, detection] : chosen.filter((entry) => entry !== detection);
  return next.length === 0 ? null : next;
}
