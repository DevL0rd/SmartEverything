import {
  ApiError,
  type ValueDescriptor,
  type AutomationBindingKind,
  type AutomationCommandInput,
} from '@smarteverything/domain';
export function validateCommandInput(
  descriptor: ValueDescriptor,
  binding: AutomationCommandInput,
): void {
  if (binding.type !== 'fields') {
    validateCommandKind(descriptor, binding.input.binding.kind);
    return;
  }
  if (descriptor.kind !== 'action' || descriptor.arguments === undefined)
    throw new ApiError(
      'invalid_request',
      'Field bindings require descriptor-defined command arguments.',
    );
  const allowed = descriptor.arguments;
  if (Object.keys(binding.fields).some((key) => !allowed.includes(key)))
    throw new ApiError('invalid_request', 'Field binding names an unsupported command argument.');
}

const COMMAND_BINDING_KINDS: Readonly<
  Record<ValueDescriptor['kind'], readonly AutomationBindingKind[]>
> = {
  boolean: ['boolean'],
  number: ['number', 'duration'],
  enum: ['string', 'choice'],
  text: ['string'],
  color: [],
  action: [],
};
function validateCommandKind(descriptor: ValueDescriptor, kind: AutomationBindingKind): void {
  if (!COMMAND_BINDING_KINDS[descriptor.kind].includes(kind))
    throw new ApiError(
      'invalid_request',
      'Binding kind does not match the writable capability descriptor.',
    );
  if (kind === 'duration' && descriptor.kind === 'number' && descriptor.unit !== 'ms')
    throw new ApiError(
      'invalid_request',
      'Duration command bindings require a target measured in milliseconds.',
    );
}
