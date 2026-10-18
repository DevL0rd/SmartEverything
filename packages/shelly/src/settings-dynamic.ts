import { z } from 'zod';
import { flag, num, stringMap, strings, text, type Place } from './settings-meta';

const components = (group: string): Place => ['presence-components', group];
const VIRTUAL = components('virtual');
const BTHOME = components('bthome');

function ui(place: Place, extra: z.ZodRawShape = {}): z.ZodOptional<z.ZodNullable<z.ZodType>> {
  return z
    .looseObject({
      view: text('Display view', place),
      unit: text('Display unit', place),
      icon: text('Display icon', place),
      titles: stringMap('Value labels', place),
      buttonIcons: strings('Button icons', place),
      images: stringMap('Value images', place),
      visible: flag('Show component', place),
      order: num('Component order', place, { step: 1 }),
      ...extra,
    })
    .nullable()
    .optional();
}

function component(
  place: Place,
  shape: z.ZodRawShape = {},
  uiExtra: z.ZodRawShape = {},
): z.ZodObject<z.ZodRawShape, z.core.$loose> {
  return z.looseObject({
    name: text('Component name', place, { nullable: true }),
    meta: z
      .looseObject({ ui: ui(place, uiExtra) })
      .nullable()
      .optional(),
    ...shape,
  });
}
const persisted = (place: Place): z.ZodRawShape => ({
  persisted: flag('Persist value', place),
});

const DISPLAY_NAME: z.ZodRawShape = {
  name: text('Display name', VIRTUAL, { nullable: true, keywords: ['display name', 'appearance'] }),
};
function virtual(
  shape: z.ZodRawShape = {},
  uiExtra: z.ZodRawShape = {},
): z.ZodObject<z.ZodRawShape, z.core.$loose> {
  return component(VIRTUAL, shape, { ...DISPLAY_NAME, ...uiExtra });
}

export const SHELLY_BOOLEAN_SETTINGS = virtual({
  ...persisted(VIRTUAL),
  default_value: flag('Default value', VIRTUAL),
});
export const SHELLY_NUMBER_SETTINGS = virtual(
  {
    ...persisted(VIRTUAL),
    default_value: num('Default value', VIRTUAL, { nullable: true }),
    min: num('Value min', VIRTUAL, { nullable: true }),
    max: num('Value max', VIRTUAL, { nullable: true }),
  },
  { step: num('Value step', VIRTUAL, { min: Number.MIN_VALUE, keywords: ['increment', 'step'] }) },
);
export const SHELLY_ENUM_SETTINGS = virtual({
  ...persisted(VIRTUAL),
  default_value: text('Default value', VIRTUAL, { nullable: true }),
  options: strings('Allowed values', VIRTUAL),
});
export const SHELLY_TEXT_SETTINGS = virtual({
  ...persisted(VIRTUAL),
  default_value: text('Default value', VIRTUAL, { nullable: true }),
  max_len: num('Maximum text length', VIRTUAL, { min: 1, step: 1 }),
});
export const SHELLY_BUTTON_SETTINGS = virtual();
export const SHELLY_GROUP_SETTINGS = virtual();

export const SHELLY_BTHOME_SETTINGS = z.looseObject({
  enable: flag('Enable BTHome', BTHOME),
});
export const SHELLY_BTHOME_DEVICE_SETTINGS = component(BTHOME, {
  addr: text('Bluetooth address', BTHOME),
  key: text('Encryption key', BTHOME, { secret: true, nullable: true }),
});
export const SHELLY_BTHOME_SENSOR_SETTINGS = component(BTHOME, {
  addr: text('Bluetooth address', BTHOME),
  obj_id: num('BTHome object ID', BTHOME, { min: 0, max: 255, step: 1 }),
  idx: num('BTHome object index', BTHOME, { min: 0, step: 1 }),
});
