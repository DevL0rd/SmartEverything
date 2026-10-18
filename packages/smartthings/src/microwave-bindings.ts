import { z } from 'zod';
import {
  JSON_VALUE,
  MICROWAVE_COOK_DEFINED_RECIPE,
  MICROWAVE_COOK_RECIPE,
  MICROWAVE_DEFINED_RECIPE,
  MICROWAVE_KEYS,
  MICROWAVE_OPERATION_TIME,
  MICROWAVE_SPECIFICATION,
  MICROWAVE_UPDATE_MODULE,
  MICROWAVE_UPDATE_SCHEDULE,
  type JsonValue,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { RawBinding } from './bindings';
import { attributeValue, stringList } from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';

type StructuredWrite = z.ZodObject<z.core.$ZodShape, z.core.$strict>;

const STRUCTURED_WRITES: Readonly<Record<string, StructuredWrite>> = {
  [MICROWAVE_KEYS.definedRecipe]: MICROWAVE_DEFINED_RECIPE,
  [MICROWAVE_KEYS.schedule]: MICROWAVE_UPDATE_SCHEDULE,
  [MICROWAVE_KEYS.cookDefinedRecipe]: MICROWAVE_COOK_DEFINED_RECIPE,
  [MICROWAVE_KEYS.cookRecipe]: MICROWAVE_COOK_RECIPE,
  [MICROWAVE_KEYS.agreeUpdate]: MICROWAVE_UPDATE_MODULE,
  [MICROWAVE_KEYS.disagreeUpdate]: MICROWAVE_UPDATE_MODULE,
  [MICROWAVE_KEYS.setDuration]: MICROWAVE_OPERATION_TIME,
};

function argumentSchemaOf(schema: StructuredWrite): JsonValue {
  const entries = Object.entries(z.toJSONSchema(schema, { io: 'input' })).filter(
    ([name]) => name !== '$schema',
  );
  return JSON_VALUE.parse(Object.fromEntries(entries));
}

function specificationOf(status: ComponentStatus): z.infer<typeof MICROWAVE_SPECIFICATION> | null {
  const specification = attributeValue(
    status,
    'samsungce.kitchenModeSpecification',
    'specification',
  );
  return specification === undefined ? null : MICROWAVE_SPECIFICATION.parse(specification);
}

function temperatureDescriptor(status: ComponentStatus): ValueDescriptor | null {
  const ranges = (specificationOf(status)?.single ?? []).flatMap((mode) => {
    const range = mode.supportedOptions.temperature?.['C'];
    return range === undefined ? [] : [range];
  });
  return ranges.length === 0
    ? null
    : {
        kind: 'number',
        min: Math.min(...ranges.map((range) => range.min)),
        max: Math.max(...ranges.map((range) => range.max)),
        step: Math.min(...ranges.map((range) => range.resolution)),
        unit: 'C',
      };
}

function supportedPowerLevels(status: ComponentStatus): JsonValue | undefined {
  return attributeValue(status, 'samsungce.microwavePower', 'supportedPowerLevels');
}

function powerDescriptor(status: ComponentStatus): ValueDescriptor | null {
  const levels = (specificationOf(status)?.single ?? []).flatMap(
    (mode) => mode.supportedOptions.powerLevel?.supportedValues ?? [],
  );
  const options = levels.length === 0 ? stringList(supportedPowerLevels(status)) : levels;
  return options.length === 0 ? null : { kind: 'enum', options: [...new Set(options)] };
}

const STATUS_DESCRIPTORS: Readonly<
  Record<string, (status: ComponentStatus) => ValueDescriptor | null>
> = {
  [MICROWAVE_KEYS.temperature]: temperatureDescriptor,
  [MICROWAVE_KEYS.power]: powerDescriptor,
};

function withDescriptor(binding: RawBinding, value: ValueDescriptor): RawBinding {
  return { ...binding, capability: { ...binding.capability, value } };
}

function structuredBinding(
  binding: RawBinding,
  schema: StructuredWrite,
  write: NonNullable<RawBinding['write']>,
): RawBinding {
  return {
    ...withDescriptor(binding, {
      kind: 'action',
      arguments: Object.keys(schema.shape),
      argumentSchema: argumentSchemaOf(schema),
    }),
    write: (value) => write(JSON_VALUE.parse(schema.parse(value))),
  };
}

export function refineMicrowaveBinding(binding: RawBinding, status: ComponentStatus): RawBinding {
  if (attributeValue(status, 'samsungce.kitchenDeviceIdentification', 'type') !== 'microwave') {
    return binding;
  }
  const key = binding.capability.key;
  if (key === 'raw:oven_operating_state.machine_state') {
    return withDescriptor(binding, { kind: 'enum', options: ['stop'] });
  }
  const structured = STRUCTURED_WRITES[key];
  if (structured !== undefined && binding.write !== null) {
    return structuredBinding(binding, structured, binding.write);
  }
  const descriptor = STATUS_DESCRIPTORS[key]?.(status) ?? null;
  return descriptor === null ? binding : withDescriptor(binding, descriptor);
}
