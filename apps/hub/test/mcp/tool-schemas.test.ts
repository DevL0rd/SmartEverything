import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { portableSchemaOf, referenceTarget } from '../../src/ai-tools/portable-schema';
import { harnessToolSchema } from '../../src/harness/tool-schema';
import { TOOLS } from '../../src/extensions/mcp/tools';

const DETAILS_BYTES_MAX = 30_000;

const NODE = z.looseObject({
  $ref: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  anyOf: z.unknown().optional(),
  oneOf: z.unknown().optional(),
  allOf: z.unknown().optional(),
  type: z.string().optional(),
});

function bytes(value: unknown): number {
  return JSON.stringify(value).length;
}

function references(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(references);
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    key === '$ref' && typeof entry === 'string' ? [entry] : references(entry),
  );
}

describe('the schema every served tool declares', () => {
  it('is a plain object at the root, which every provider accepts', () => {
    for (const tool of TOOLS) {
      const root = NODE.parse(tool.listing.inputSchema);
      expect(root.type, tool.name).toBe('object');
      expect([root.anyOf, root.oneOf, root.allOf], tool.name).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
    }
  });

  it('resolves every reference inside itself', () => {
    for (const tool of TOOLS) {
      for (const reference of references(tool.listing.inputSchema)) {
        expect(() => referenceTarget(tool.listing.inputSchema, reference), tool.name).not.toThrow();
      }
    }
  });

  it('can be declared to the native harness without constraint prose', () => {
    for (const tool of TOOLS) {
      const schema = harnessToolSchema(tool.listing.inputSchema);
      expect(schema.type, tool.name).toBe('object');
      expect(JSON.stringify(schema), tool.name).not.toContain('Hub validates');
    }
  });

  it('can be declared to OpenAI and Gemini with every reference written out', () => {
    for (const tool of TOOLS) {
      const schema = portableSchemaOf(tool.listing.inputSchema);
      expect(schema['type'], tool.name).toBe('object');
      expect(references(schema), tool.name).toEqual([]);
      expect(JSON.stringify(schema), tool.name).not.toContain('$defs');
    }
  });

  it('leaves a recursive step open instead of refusing the whole tool', () => {
    const tree = {
      type: 'object',
      properties: { node: { $ref: '#/$defs/node', description: 'The root' } },
      $defs: {
        node: {
          type: 'object',
          properties: { label: { type: 'string' }, child: { $ref: '#/$defs/node' } },
        },
      },
    };
    expect(portableSchemaOf(tree)).toEqual({
      type: 'object',
      properties: {
        node: {
          type: 'object',
          description: 'The root',
          properties: { label: { type: 'string' }, child: {} },
        },
      },
    });
  });

  it('is small enough to read whole through tool_read, with any one variant beside it', () => {
    for (const tool of TOOLS) {
      const largest = Math.max(0, ...[...(tool.variants?.values() ?? [])].map(bytes));
      expect(bytes(tool.listing) + largest, tool.name).toBeLessThan(DETAILS_BYTES_MAX * 2);
      expect(bytes(tool.listing), tool.name).toBeLessThan(DETAILS_BYTES_MAX);
    }
  });
});

const MARKS = z.object({
  annotations: z.looseObject({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
});

describe('the annotations of a routed tool', () => {
  it('are read-only at the top only when every value is, and destructive when any is', () => {
    for (const tool of TOOLS) {
      const marks = [...(tool.variants?.values() ?? [])].map((variant) => MARKS.parse(variant));
      if (marks.length > 0) {
        expect(tool.listing.annotations.readOnlyHint, tool.name).toBe(
          marks.every((mark) => mark.annotations.readOnlyHint),
        );
        expect(tool.listing.annotations.destructiveHint, tool.name).toBe(
          marks.some((mark) => mark.annotations.destructiveHint),
        );
      }
    }
  });

  it('say what the whole tool does, and each value says what it does itself', () => {
    const tool = TOOLS.find((candidate) => candidate.name === 'chat_edit');
    expect(tool?.listing.annotations.destructiveHint).toBe(true);
    expect(tool?.variants?.get('delete')).toMatchObject({
      annotations: { destructiveHint: true },
    });
    expect(tool?.variants?.get('update')).toMatchObject({
      annotations: { destructiveHint: false },
    });
  });

  it('describe operation_call as the mixture of everything it can reach', () => {
    const tool = TOOLS.find((candidate) => candidate.name === 'operation_call');
    expect(tool?.listing.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
  });
});
