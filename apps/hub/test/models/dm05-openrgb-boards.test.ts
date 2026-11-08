import { MODEL_SPEC } from '@smarteverything/domain';
import { checkAuthoring } from '@smarteverything/models';
import { describe, expect, it } from 'vitest';
import {
  OPENRGB_BOARD_MODELS,
  RGB_GPU_MODEL,
  RGB_MOTHERBOARD_MODEL,
} from '../../src/plugins/builtin/openrgb/models-2';

describe('the OpenRGB graphics card and motherboard models', () => {
  it.each(OPENRGB_BOARD_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it('lights the three fan rings and spins the three rotors from a reported speed', () => {
    const channels = RGB_GPU_MODEL.channels ?? [];
    const rings = channels.filter(
      (channel) => channel.target.endsWith('Ring') && channel.source === 'colour',
    );
    const spins = channels.filter((channel) => channel.property === 'rotate');
    expect(rings).toHaveLength(3);
    expect(spins.map((channel) => channel.source)).toStrictEqual(['speed', 'speed', 'speed']);
  });

  it('glows the motherboard zones with the device colour', () => {
    const tinted = (RGB_MOTHERBOARD_MODEL.channels ?? [])
      .filter((channel) => channel.source === 'colour')
      .map((channel) => channel.target);
    expect(tinted).toEqual(expect.arrayContaining(['shroudGlow', 'chipsetGlow', 'edgeGlow']));
    expect(RGB_MOTHERBOARD_MODEL.states?.['off']).toStrictEqual({ power: false });
  });
});
