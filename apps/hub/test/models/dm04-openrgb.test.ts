import { MODEL_SPEC, identityScore, type DiscoveredDevice } from '@smarteverything/domain';
import { checkAuthoring } from '@smarteverything/models';
import { describe, expect, it } from 'vitest';
import { admitEntry } from '../../src/models/contributions';
import { openRgbPlugin } from '../../src/plugins/builtin/openrgb';
import {
  OPENRGB_MODELS,
  RGB_CASE_FAN_MODEL,
  RGB_KEYBOARD_MODEL,
  RGB_MOUSE_MODEL,
  RGB_RAM_MODEL,
} from '../../src/plugins/builtin/openrgb/models';
import { DEFAULT_LOOK } from '../../src/plugins/builtin/openrgb/colour-math';
import {
  controllerIds,
  describeUnit,
  unitsOf,
} from '../../src/plugins/builtin/openrgb/controller-device';
import type { OpenRgbController } from '../../src/plugins/builtin/openrgb/transport';
import { OPENRGB_DEVICE_TYPE_PRODUCTS } from '../../src/plugins/builtin/openrgb/models-kit';

const RECORDED_KEYBOARD: OpenRgbController = {
  type: 5,
  name: 'Corsair K70 RGB',
  vendor: 'Corsair',
  serial: 'CS-0001',
  location: 'HID: /dev/hidraw3',
  activeMode: 0,
  modes: [{ name: 'Direct', flagList: ['perLedColor'], colors: [] }],
  zones: [{ name: 'Keyboard', ledsCount: 2 }],
  colors: [
    { red: 0, green: 0, blue: 0 },
    { red: 0, green: 0, blue: 0 },
  ],
};

function described(info: OpenRgbController): DiscoveredDevice {
  const [id = ''] = controllerIds([info]);
  const [unit] = unitsOf(id, info);
  if (unit === undefined) throw new Error('no unit');
  return describeUnit({
    unit,
    info,
    state: { on: true, look: DEFAULT_LOOK },
    effect: null,
    online: true,
    at: '2026-01-01T00:00:00.000Z',
  });
}

const SPECS = [RGB_KEYBOARD_MODEL, RGB_MOUSE_MODEL, RGB_RAM_MODEL, RGB_CASE_FAN_MODEL];

describe('the OpenRGB peripheral models', () => {
  it.each(SPECS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it.each(SPECS.map((spec) => [spec.id, spec] as const))(
    '%s tints its lights from the device colour and darkens them when off or offline',
    (_id, spec) => {
      const channels = spec.channels ?? [];
      expect(channels.some((channel) => channel.source === 'colour')).toBe(true);
      const dark = channels.filter(
        (channel) => channel.property === 'emissive' && channel.map.type === 'enum',
      );
      expect(new Set(dark.map((channel) => channel.source))).toStrictEqual(
        new Set(['power', 'online']),
      );
      expect(spec.shots?.[0]?.when.anyOf[0]?.allOf.map((leaf) => leaf.signal)).toStrictEqual([
        'power',
        'brightness',
      ]);
    },
  );

  it('spins the case fan rotor only from a reported speed', () => {
    const spin = RGB_CASE_FAN_MODEL.channels?.find((channel) => channel.property === 'rotate');
    expect(spin).toMatchObject({ target: 'rotor', source: 'speed', motion: { type: 'spin' } });
    expect(RGB_CASE_FAN_MODEL.states?.['violet']).not.toHaveProperty('speed');
    expect(RGB_CASE_FAN_MODEL.shots?.[0]?.symmetry).toBe(40);
  });

  it('is contributed by the OpenRGB plugin and matched by the OpenRGB device type', () => {
    const entries = openRgbPlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual(OPENRGB_MODELS.map((spec) => spec.id));
    for (const entry of entries) {
      expect('admitted' in admitEntry('plugin:openrgb', entry)).toBe(true);
    }
    const keyboard = entries.find((entry) => entry.id === RGB_KEYBOARD_MODEL.id);
    if (keyboard === undefined) throw new Error('no keyboard entry');
    const subject = {
      brand: 'Corsair',
      model: 'K70 RGB',
      family: 'light',
      product: OPENRGB_DEVICE_TYPE_PRODUCTS.keyboard,
    } as const;
    expect(identityScore(keyboard.match, subject)?.tier).toBe('hardware');
    expect(identityScore(keyboard.match, { ...subject, product: 'openrgb-mouse' })).toBeNull();
  });

  it('resolves a recorded keyboard controller to the keyboard model through its device type', () => {
    const device = described(RECORDED_KEYBOARD);
    expect(device.details['product']).toBe(OPENRGB_DEVICE_TYPE_PRODUCTS.keyboard);
    const keyboard = (openRgbPlugin.models ?? []).find(
      (entry) => entry.id === RGB_KEYBOARD_MODEL.id,
    );
    if (keyboard === undefined) throw new Error('no keyboard entry');
    expect(
      identityScore(keyboard.match, {
        brand: device.manufacturer,
        model: device.model,
        family: 'light',
        product: OPENRGB_DEVICE_TYPE_PRODUCTS.keyboard,
      })?.tier,
    ).toBe('hardware');
  });

  it('maps each modelled device type to its product and leaves other types without one', () => {
    const products = [0, 1, 2, 3, 5, 6].map(
      (type) => described({ ...RECORDED_KEYBOARD, type }).details['product'],
    );
    expect(products).toStrictEqual([
      'openrgb-motherboard',
      'openrgb-dram',
      'openrgb-gpu',
      'openrgb-cooler',
      'openrgb-keyboard',
      'openrgb-mouse',
    ]);
    expect(described({ ...RECORDED_KEYBOARD, type: 4 }).details).not.toHaveProperty('product');
  });
});
