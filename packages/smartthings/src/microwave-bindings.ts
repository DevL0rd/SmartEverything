import { z } from 'zod';
import {
  JSON_VALUE,
  MICROWAVE_DEFINED_RECIPE,
  MICROWAVE_UPDATE_SCHEDULE,
  MICROWAVE_COOK_DEFINED_RECIPE,
  MICROWAVE_COOK_RECIPE,
  MICROWAVE_UPDATE_MODULE,
  MICROWAVE_DURATION,
  MICROWAVE_KEYS,
  MICROWAVE_SPECIFICATION,
  type JsonValue,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { RawBinding } from './bindings';
import { MICROWAVE_ARGUMENT_SCHEMAS } from './microwave-argument-schemas';
import { MICROWAVE_RECIPE_SCHEMA } from './microwave-recipe-schema';
import { attributeValue } from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';

interface StructuredWrite {
  readonly arguments: readonly string[];
  readonly parse: (value: JsonValue) => JsonValue;
}
const STRUCTURED_WRITES: Readonly<Record<string, StructuredWrite>> = {
  [MICROWAVE_KEYS.definedRecipe]: {
    arguments: [
      'recipeType',
      'categoryId',
      'itemId',
      'servingSize',
      'cavityId',
      'browingLevel',
      'option',
    ],
    parse: (value) => JSON_VALUE.parse(MICROWAVE_DEFINED_RECIPE.parse(value)),
  },
  [MICROWAVE_KEYS.schedule]: {
    arguments: ['scheduledTime'],
    parse: (value) => JSON_VALUE.parse(MICROWAVE_UPDATE_SCHEDULE.parse(value)),
  },
  [MICROWAVE_KEYS.cookDefinedRecipe]: {
    arguments: ['recipeType', 'categoryId', 'itemId', 'servingSize', 'browingLevel', 'option'],
    parse: (value) => JSON_VALUE.parse(MICROWAVE_COOK_DEFINED_RECIPE.parse(value)),
  },
  [MICROWAVE_KEYS.cookRecipe]: {
    arguments: ['recipeType', 'recipeStages', 'recipeDisplay', 'recipeZones'],
    parse: (value) => JSON_VALUE.parse(MICROWAVE_COOK_RECIPE.parse(value)),
  },
  [MICROWAVE_KEYS.agreeUpdate]: {
    arguments: ['module'],
    parse: (value) => JSON_VALUE.parse(MICROWAVE_UPDATE_MODULE.parse(value)),
  },
  [MICROWAVE_KEYS.disagreeUpdate]: {
    arguments: ['module'],
    parse: (value) => JSON_VALUE.parse(MICROWAVE_UPDATE_MODULE.parse(value)),
  },
  [MICROWAVE_KEYS.setDuration]: {
    arguments: ['operationTime'],
    parse: (value) => z.strictObject({ operationTime: MICROWAVE_DURATION }).parse(value),
  },
};

function temperatureDescriptor(status: ComponentStatus): ValueDescriptor | null {
  const specification = attributeValue(
    status,
    'samsungce.kitchenModeSpecification',
    'specification',
  );
  if (specification === undefined) {
    return null;
  }
  const ranges = MICROWAVE_SPECIFICATION.parse(specification).single.flatMap((mode) => {
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

export function refineMicrowaveBinding(binding: RawBinding, status: ComponentStatus): RawBinding {
  if (attributeValue(status, 'samsungce.kitchenDeviceIdentification', 'type') !== 'microwave') {
    return binding;
  }
  if (binding.capability.key === 'raw:oven_operating_state.machine_state') {
    return {
      ...binding,
      capability: { ...binding.capability, value: { kind: 'enum', options: ['stop'] } },
    };
  }
  const spec = STRUCTURED_WRITES[binding.capability.key];
  const write = binding.write;
  if (spec !== undefined && write !== null) {
    return {
      ...binding,
      capability: {
        ...binding.capability,
        value: {
          kind: 'action',
          arguments: [...spec.arguments],
          argumentSchema:
            MICROWAVE_ARGUMENT_SCHEMAS[binding.capability.key] ??
            MICROWAVE_RECIPE_SCHEMA[binding.capability.key],
        },
      },
      write: (value) => write(spec.parse(value)),
    };
  }
  if (binding.capability.key !== MICROWAVE_KEYS.temperature) {
    return binding;
  }
  const descriptor = temperatureDescriptor(status);
  return descriptor === null
    ? binding
    : { ...binding, capability: { ...binding.capability, value: descriptor } };
}
