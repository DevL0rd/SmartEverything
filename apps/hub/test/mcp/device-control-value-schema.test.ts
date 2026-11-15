import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SE_TOOLS } from '../../src/ai-tools/se-tools';
import { geminiDeclarationOf } from '../../src/ai-tools/tool-adapters';
import { DEVICE_CONTROL } from '../../src/extensions/mcp/tools/changes';

const DECLARED_VALUE = z.object({
  parametersJsonSchema: z.object({
    properties: z.object({
      value: z.object({ anyOf: z.array(z.object({ type: z.string() })) }),
    }),
  }),
});

function declaredTypes(): readonly string[] {
  const tool = SE_TOOLS.find((candidate) => candidate.name === 'device_control');
  if (tool === undefined) throw new Error('device_control is not an SE tool');
  return DECLARED_VALUE.parse(
    geminiDeclarationOf(tool),
  ).parametersJsonSchema.properties.value.anyOf.map((member) => member.type);
}

describe('the device_control value schema', () => {
  it('declares the JSON types a capability value takes so a model sends false, not "false"', () => {
    expect(declaredTypes()).toEqual(['boolean', 'number', 'string', 'object', 'null']);
  });

  it('accepts every documented value form and refuses an array', () => {
    for (const value of [false, 30, 'warm', '#ff0000', { r: 255, g: 0, b: 0 }, null]) {
      expect(DEVICE_CONTROL.safeParse({ deviceIds: ['Lamp'], value }).success).toBe(true);
    }
    expect(DEVICE_CONTROL.safeParse({ deviceIds: ['Lamp'], value: [true] }).success).toBe(false);
  });

  it('accepts action arguments of every scalar type', () => {
    for (const value of [
      { direction: 'left' },
      { text: 'Dinner is ready', loud: true, volume: 40 },
    ]) {
      expect(
        DEVICE_CONTROL.safeParse({ deviceIds: ['Cam'], capability: 'ptz', value }).data?.value,
      ).toEqual(value);
    }
    expect(
      DEVICE_CONTROL.safeParse({ deviceIds: ['Cam'], value: { direction: ['left'] } }).success,
    ).toBe(false);
  });
});
