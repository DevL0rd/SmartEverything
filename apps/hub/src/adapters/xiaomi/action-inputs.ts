import {
  CommandRefusedError,
  JSON_VALUE,
  checkValue,
  type CapabilityKey,
  type JsonValue,
} from '@smarteverything/domain';
import { toDevice, type ActionBinding } from '@smarteverything/xiaomi';
import { z } from 'zod';

export function actionInputs(
  capability: CapabilityKey,
  binding: ActionBinding,
  value: JsonValue,
): JsonValue[] {
  const args = z.record(z.string(), JSON_VALUE).parse(value ?? {});
  return binding.inputs.map((input) => {
    const argument = args[input.name];
    if (argument === undefined) {
      throw new CommandRefusedError(capability, `the argument ${input.name} is missing`);
    }
    return toDevice(
      `${capability}.${input.name}`,
      input.codec,
      checkValue(input.descriptor, argument),
    );
  });
}
