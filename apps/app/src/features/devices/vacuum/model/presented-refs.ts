import type { DevicePresentation, PresentedCapability } from '@smarteverything/domain';

export function presentedFor(
  presentation: DevicePresentation,
  ref: string,
): PresentedCapability | undefined {
  return presentation.capabilities.find(
    (presented) => presented.tier !== 'hidden' && (presented.role === ref || presented.key === ref),
  );
}

export function presentedRows(
  presentation: DevicePresentation,
  refs: readonly string[],
): readonly PresentedCapability[] {
  return refs.flatMap((ref) => {
    const presented = presentedFor(presentation, ref);
    return presented === undefined ? [] : [presented];
  });
}
