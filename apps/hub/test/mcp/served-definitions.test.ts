import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  REMOVES,
  WRITES,
  defineTool,
  type Tool,
  type ToolAnnotations,
} from '../../src/extensions/mcp/tools/registry';
import { servedTool } from '../../src/extensions/mcp/tools/served';

const ROUTE = {
  key: 'action',
  branches: {
    create: { part: 'create_room', line: 'Add a room' },
    update: { part: 'update_room', line: 'Rename or move one room' },
    remove: { part: 'remove_room', line: 'Remove one room' },
  },
} as const;

const NAME = z.string().min(1).max(60);
const ROOM = z.uuid();

function part(
  name: 'create_room' | 'update_room' | 'remove_room',
  input: z.ZodObject,
  annotations: ToolAnnotations,
): Tool {
  return defineTool({
    name,
    input,
    annotations,
    run: () => ({ structured: { ran: name } }),
  });
}

function room(
  overrides: {
    readonly create?: z.ZodObject;
    readonly update?: z.ZodObject;
    readonly remove?: z.ZodObject;
  } = {},
): Tool {
  const parts = new Map(
    [
      part(
        'create_room',
        overrides.create ?? z.strictObject({ name: NAME, position: z.number().int().default(0) }),
        WRITES,
      ),
      part(
        'update_room',
        overrides.update ??
          z.strictObject({
            roomId: ROOM,
            name: NAME.optional(),
            position: z.number().int().optional(),
          }),
        WRITES,
      ),
      part('remove_room', overrides.remove ?? z.strictObject({ roomId: ROOM }), REMOVES),
    ].map((tool) => [tool.name, tool]),
  );
  return servedTool('room_edit', ROUTE, parts, new Map());
}

function properties(tool: Tool): Record<string, unknown> {
  return z
    .looseObject({ properties: z.record(z.string(), z.unknown()) })
    .parse(tool.listing.inputSchema).properties;
}

describe('a routed tool built from the Zod input of each of its parts', () => {
  it('lists the key as the only required field and describes each value with its own fields', () => {
    const { inputSchema } = room().listing;
    expect(inputSchema).toMatchObject({ required: ['action'], additionalProperties: false });
    expect(properties(room())['action']).toMatchObject({
      type: 'string',
      enum: ['create', 'update', 'remove'],
    });
    const text = z.looseObject({ description: z.string() }).parse(properties(room())['action']);
    expect(text.description).toContain('(fields: name (required), position)');
    expect(text.description).toContain('(fields: roomId (required), name, position)');
    expect(text.description).toContain('(fields: roomId (required))');
  });

  it('writes a field that every part declares the same way once', () => {
    expect(properties(room())['roomId']).toMatchObject({ type: 'string', format: 'uuid' });
    expect(JSON.stringify(room().listing.inputSchema).match(/"name"/gu)).toHaveLength(1);
  });

  it('keeps a default every part agrees on and drops one the parts disagree on', () => {
    const agreed = room({
      create: z.strictObject({ name: NAME, position: z.number().int().default(0) }),
      update: z.strictObject({ roomId: ROOM, position: z.number().int().default(0) }),
    });
    expect(properties(agreed)['position']).toMatchObject({ default: 0 });
    expect(properties(room())['position']).not.toHaveProperty('default');
  });

  it('offers every shape of a field two parts declare differently and says which value takes which', () => {
    const tool = room({
      create: z.strictObject({ name: NAME, position: z.number().int().default(0) }),
      update: z.strictObject({
        roomId: ROOM,
        name: NAME.optional(),
        position: z.number().int().min(1).optional(),
      }),
    });
    const position = z
      .looseObject({ anyOf: z.array(z.looseObject({ minimum: z.number().optional() })) })
      .parse(properties(tool)['position']);
    expect(position.anyOf).toHaveLength(2);
    expect(JSON.stringify(position)).not.toContain('"default"');
  });

  it('keeps the description of a field that only one of the parts explains', () => {
    const tool = room({
      remove: z.strictObject({ roomId: ROOM.describe('The room to remove') }),
    });
    expect(properties(tool)['roomId']).toMatchObject({ description: 'The room to remove' });
  });

  it('gives each value its own schema and annotations in the variants', () => {
    const tool = room();
    const create = tool.variants?.get('create');
    const remove = tool.variants?.get('remove');
    expect(create).toMatchObject({
      selector: { action: 'create' },
      inputSchema: {
        properties: { action: { const: 'create' } },
        required: ['action', 'name'],
      },
      annotations: { destructiveHint: false },
    });
    expect(remove).toMatchObject({
      selector: { action: 'remove' },
      inputSchema: { required: ['action', 'roomId'] },
      annotations: { destructiveHint: true, idempotentHint: true },
    });
  });

  it('is destructive at the top when any value is, so a client warns before a remove', () => {
    expect(room().listing.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('refuses a part whose own field has the selector name, so the selector cannot be overwritten', () => {
    const clash = { create: z.strictObject({ action: z.string(), name: NAME }) };
    expect(() => room(clash)).toThrow('collides with the action selector');
  });

  it('rejects a part that has no object input rather than guess its fields', () => {
    const bare: Tool = {
      name: 'create_room',
      listing: room().listing,
      check: () => null,
      call: () => Promise.resolve({ structured: {} }),
    };
    expect(() => servedTool('room_edit', ROUTE, new Map([[bare.name, bare]]), new Map())).toThrow();
  });
});
