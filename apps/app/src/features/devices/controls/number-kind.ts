import type { PresentedCapability, ValueDescriptor } from '@smarteverything/domain';
import { sliderLabelMode } from '../../../components/slider-layout';
import { DIAL_ROLES } from '../model/card-facts';

export type NumberDescriptor = Extract<ValueDescriptor, { kind: 'number' }>;

const STEPPER_MOST_STEPS = 12;

const STEPPED_ROLES: ReadonlySet<PresentedCapability['role']> = new Set(['channel']);

export function usesStepper(
  descriptor: NumberDescriptor,
  presented: Pick<PresentedCapability, 'role'>,
): boolean {
  return (
    STEPPED_ROLES.has(presented.role) ||
    (descriptor.max - descriptor.min) / descriptor.step <= STEPPER_MOST_STEPS
  );
}

export const SEGMENTED_MOST_OPTIONS = 5;

export type LabelMode = 'inline' | 'caption';

export const INLINE_LABEL_SHARE = 0.4;
const LABEL_GAP = 12;

export function isSliderControl(presented: PresentedCapability): boolean {
  const descriptor = presented.capability.value;
  return (
    descriptor.kind === 'number' &&
    !usesStepper(descriptor, presented) &&
    !(presented.role !== null && DIAL_ROLES.has(presented.role))
  );
}

export function labelModeOf(
  presented: PresentedCapability,
  requested: LabelMode,
  width: number,
): LabelMode {
  if (requested === 'caption' || !isSliderControl(presented)) {
    return requested;
  }
  return sliderLabelMode(width, INLINE_LABEL_SHARE, LABEL_GAP);
}
