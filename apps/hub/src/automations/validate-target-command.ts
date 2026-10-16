import {
  ApiError,
  planGroupCommands,
  targetCapability,
  type TargetCommandAction,
  type PresentedCapability,
} from '@smarteverything/domain';
import { resolveTarget } from '../device-groups/commands';
import type { Store } from '../store/store';
import { validateCommandInput } from './validate-command-input';

function validateTargetBinding(
  presented: PresentedCapability,
  action: TargetCommandAction,
): boolean {
  if (!('binding' in action)) return true;
  try {
    if (
      action.binding.type === 'fields' &&
      (presented.colorEncoding !== undefined || presented.capability.value.kind === 'color')
    ) {
      const fields = action.binding.fields;
      return (
        Object.keys(fields).length === 3 &&
        ['hue', 'saturation', 'value'].every((key) => fields[key]?.binding.kind === 'number')
      );
    }
    validateCommandInput(presented.capability.value, action.binding);
    return true;
  } catch (cause) {
    if (!(cause instanceof ApiError)) throw cause;
    return false;
  }
}
export function validateTargetCommand(store: Store, action: TargetCommandAction): void {
  const devices = resolveTarget(store, action.target);
  if (devices.length === 0)
    throw new ApiError('invalid_request', 'The command target has no current devices.');
  if (!('binding' in action)) {
    const plan = planGroupCommands(
      devices.map((device) => ({ ...device, online: true })),
      action,
    );
    if (plan.commands.length > 0) return;
  } else if (
    devices.some((device) => {
      const capability = targetCapability(device, action.capability);
      return capability?.writable === true && validateTargetBinding(capability, action);
    })
  )
    return;
  throw new ApiError('invalid_request', 'No target device supports this command input.');
}
