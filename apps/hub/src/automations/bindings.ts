import { validateCommandBinding } from './validate-program';
import { validateBinding } from './validate-bindings';
import {
  ApiError,
  capabilityOf,
  checkValue,
  resolveCommandInput,
  type AutomationBindingContext,
  type AutomationBindingKind,
  type CapabilityKey,
  type JsonValue,
} from '@smarteverything/domain';
import {
  admitExecutionDevice,
  currentExecutionAuthorities,
} from '../assistant/execution-authority';
import type { CommandExecutor } from '../commands/executor';
import type { Store } from '../store/store';
import type { StructuredActionServices } from './structured-actions';
import { admitRun } from './run-context';

function valueReader(store: Store, id: string, kind: AutomationBindingKind): JsonValue {
  const content = store.automationValues.byId(id).content;
  if (content.kind !== kind)
    throw new ApiError(
      'invalid_request',
      `Value ${id} requires kind ${content.kind}, received ${kind}.`,
    );
  return content.value;
}
function desiredValue(
  store: Store,
  executor: CommandExecutor,
  target: {
    readonly deviceId: string;
    readonly key: CapabilityKey;
    readonly observedAt?: string | undefined;
  },
): JsonValue | undefined {
  const current = store.deviceEffects.find(target.deviceId, target.key);
  return current === undefined
    ? executor.intendedValue(target.deviceId, target.key, target.observedAt)
    : current.base;
}
function capabilityReader(
  store: Store,
  executor: CommandExecutor,
  binding: {
    readonly deviceId: string;
    readonly key: CapabilityKey;
    readonly kind: AutomationBindingKind;
  },
): JsonValue {
  const { deviceId, key, kind } = binding;
  validateBinding(store, { source: 'capability', kind, deviceId, capability: key }, []);
  for (const authority of currentExecutionAuthorities())
    admitExecutionDevice(store, deviceId, authority);
  const capability = capabilityOf(store.devices.byId(deviceId), key);
  if (
    capability === undefined ||
    capability.access === 'write' ||
    capability.value.kind === 'action'
  )
    throw new ApiError('command_refused', `Capability ${key} is unavailable or cannot be read.`);
  const observed = store.state
    .list()
    .find((row) => row.device_id === deviceId && row.capability === key);
  const intended = desiredValue(store, executor, {
    deviceId,
    key,
    observedAt: observed?.observed_at,
  });
  const value = intended === undefined ? observed?.value : intended;
  if (value === undefined)
    throw new ApiError('command_refused', `Capability ${key} has no current value.`);
  return checkValue(capability.value, value);
}
export function automationBindings(
  store: Store,
  executor: CommandExecutor,
  parameters: Readonly<Record<string, JsonValue>>,
): AutomationBindingContext {
  return {
    value: (id, kind) => valueReader(store, id, kind),
    parameter: (name): JsonValue => {
      const value = parameters[name];
      if (value === undefined)
        throw new ApiError('invalid_request', `Missing sequence parameter ${name}.`);
      return value;
    },
    capability: (id, key, kind) => capabilityReader(store, executor, { deviceId: id, key, kind }),
  };
}
export function boundAutomationCommand(
  store: Store,
  executor: CommandExecutor,
): StructuredActionServices['command'] {
  return async (action, context, parameters, issue): Promise<void> =>
    executor.admit(action.deviceId, action.capability, async () => {
      admitRun(context);
      const value = store.write(() => {
        validateCommandBinding(store, action);
        return resolveCommandInput(action.binding, automationBindings(store, executor, parameters));
      });
      await issue(value);
      admitRun(context);
    });
}
