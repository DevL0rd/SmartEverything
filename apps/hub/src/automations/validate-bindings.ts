import {
  ApiError,
  checkedBindingValue,
  capabilityOf,
  type AutomationBinding,
  type AutomationInput,
  type SequenceParameter,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const READABLE_KINDS: Readonly<Record<ValueDescriptor['kind'], readonly string[]>> = {
  boolean: ['boolean'],
  number: ['number', 'duration'],
  enum: ['string'],
  text: ['string'],
  color: [],
  action: [],
};
function validateCapabilityBinding(
  store: Store,
  binding: Extract<AutomationBinding, { source: 'capability' }>,
): void {
  const descriptor = capabilityOf(store.devices.byId(binding.deviceId), binding.capability);
  if (
    descriptor === undefined ||
    descriptor.access === 'write' ||
    descriptor.value.kind === 'action'
  )
    throw new ApiError(
      'invalid_request',
      'Binding requires a supported readable device capability.',
    );
  if (!READABLE_KINDS[descriptor.value.kind].includes(binding.kind))
    throw new ApiError(
      'invalid_request',
      'Binding kind does not match the device capability descriptor.',
    );
  if (
    binding.kind === 'duration' &&
    descriptor.value.kind === 'number' &&
    descriptor.value.unit !== 'ms'
  )
    throw new ApiError(
      'invalid_request',
      'Duration bindings require a capability measured in milliseconds.',
    );
}
export function validateBinding(
  store: Store,
  binding: AutomationBinding,
  parameters: readonly SequenceParameter[],
): void {
  switch (binding.source) {
    case 'literal':
      checkedBindingValue(binding.kind, binding.value);
      return;
    case 'value': {
      const content = store.automationValues.byId(binding.valueId).content;
      if (content.kind !== binding.kind)
        throw new ApiError('invalid_request', 'Binding kind does not match its Value.');
      return;
    }
    case 'parameter':
      if (
        !parameters.some(
          (parameter) => parameter.name === binding.name && parameter.kind === binding.kind,
        )
      )
        throw new ApiError(
          'invalid_request',
          `Unknown or incorrectly typed parameter ${binding.name}.`,
        );
      return;
    case 'capability':
      validateCapabilityBinding(store, binding);
      return;
  }
}
export function validateInput(
  store: Store,
  input: AutomationInput,
  parameters: readonly SequenceParameter[],
): void {
  validateBinding(store, input.binding, parameters);
  if (input.offset === undefined) return;
  const expected = input.binding.kind === 'duration' ? 'milliseconds' : 'number';
  if (!['number', 'duration'].includes(input.binding.kind) || input.offset.unit !== expected)
    throw new ApiError('invalid_request', 'Numeric offsets require a matching kind and unit.');
  if (
    input.offset.minimum !== undefined &&
    input.offset.maximum !== undefined &&
    input.offset.minimum > input.offset.maximum
  )
    throw new ApiError('invalid_request', 'Numeric input minimum exceeds its maximum.');
}
