import type { PresentedCapability, ValueDescriptor } from '@smarteverything/domain';

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
