import { describe, expect, it } from 'vitest';
import { geminiSchemaOf } from '../src/ai-tools/gemini-schema';

describe('the Gemini tool schema', () => {
  it('drops validation-only keywords and keeps names, types, enums and descriptions', () => {
    expect(
      geminiSchemaOf({
        type: 'object',
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            minLength: 1,
            maxLength: 20,
            pattern: '^a',
            description: 'Words',
          },
          pattern: { type: 'array', minItems: 1, items: { type: 'string', enum: ['a', 'b'] } },
          bag: { type: 'object', additionalProperties: { type: 'number', exclusiveMinimum: 0 } },
        },
        required: ['text'],
      }),
    ).toEqual({
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Words' },
        pattern: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } },
        bag: { type: 'object', additionalProperties: { type: 'number' } },
      },
      required: ['text'],
    });
  });
});
