import { MCP_TOOLS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { HubTool } from '../../src/ai-tools/hub-tool';
import { chatCatalogue, chatSet, toolIndex } from '../../src/ai-tools/tool-sets';
import { TOOLS, partCallOf, toolNamed } from '../../src/extensions/mcp/tools';
import { resourceRead } from '../../src/extensions/mcp/resources';

const LISTING = z.looseObject({
  name: z.string(),
  inputSchema: z.looseObject({
    properties: z.record(z.string(), z.looseObject({ enum: z.array(z.string()).optional() })),
    required: z.array(z.string()).optional(),
  }),
  annotations: z.looseObject({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
});

function served(name: string): NonNullable<ReturnType<typeof toolNamed>> {
  const tool = toolNamed(name);
  if (tool === undefined) {
    throw new Error(`no tool ${name}`);
  }
  return tool;
}

describe('the served MCP tools', () => {
  it('serve exactly the catalogue, in its order', () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual(MCP_TOOLS.map((tool) => tool.name));
  });

  it('describe a routed tool by its key, with one value per part', () => {
    const listing = LISTING.parse(served('edit_room').listing);
    expect(listing.inputSchema.required).toEqual(['action']);
    expect(listing.inputSchema.properties['action']?.enum).toEqual(['create', 'update', 'remove']);
    expect(listing.inputSchema.properties).toHaveProperty('roomId');
    expect(listing.annotations.destructiveHint).toBe(false);
    expect(listing.annotations.readOnlyHint).toBe(false);
    expect(served('edit_room').variants?.get('remove')).toMatchObject({
      annotations: { destructiveHint: true },
    });
  });

  it('resolve a served call to the part that runs it', () => {
    expect(partCallOf('log_food', { action: 'water', millilitres: 250 })).toEqual({
      name: 'log_water',
      args: { millilitres: 250 },
    });
    expect(partCallOf('read_phone', { view: 'context', profileId: 'p' })).toEqual({
      name: 'read_phone_context',
      args: { profileId: 'p' },
    });
    expect(
      partCallOf('read_phone', { view: 'detail', deviceId: 'd', sections: 'power,sound' }),
    ).toEqual({
      name: 'read_phone_detail',
      args: { deviceId: 'd', sections: 'power,sound' },
    });
    expect(partCallOf('set_power', { on: true })).toEqual({
      name: 'set_power',
      args: { on: true },
    });
    expect(() => partCallOf('edit_room', { action: 'paint' })).toThrow(
      'action must be one of: create, update, remove',
    );
  });

  it('publish every tool as a catalogue line in the docs resource', () => {
    const read = resourceRead('smarteverything://docs/tools', TOOLS);
    const text = z
      .strictObject({ contents: z.array(z.looseObject({ text: z.string() })) })
      .parse(read).contents[0]?.text;
    expect(text?.split('\n')).toHaveLength(TOOLS.length);
    expect(text).toContain('edit_room(action: "create"|"update"|"remove"');
    expect(resourceRead('smarteverything://nothing', TOOLS)).toBeNull();
  });
});

describe('the chat tool set', () => {
  const tool = (name: string, plugin: boolean): HubTool => ({
    name,
    title: name,
    description: `${name}.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    origin: plugin ? { kind: 'plugin', pluginId: 'router' } : { kind: 'se' },
    humanOnly: false,
  });

  it('always declares the common tools and the three discovery tools, in an order that does not depend on input order', () => {
    const tools = [tool('get_home', false), tool('edit_room', false), tool('log_b', true)];
    const names = chatSet(tools).map((spec) => spec.name);
    expect(names).toEqual(['call_tool', 'get_home', 'search_tools', 'tool_details']);
    expect(chatSet([...tools].reverse()).map((spec) => spec.name)).toEqual(names);
  });

  it('keeps discovery declared when the enabled list holds no discovery tool', () => {
    expect(chatSet([]).map((spec) => spec.name)).toEqual([
      'call_tool',
      'search_tools',
      'tool_details',
    ]);
  });

  it('lists plugin tools by title and every other tool by area, never as raw schemas', () => {
    const tools = [
      tool('get_home', false),
      tool('edit_room', false),
      tool('router_reboot', true),
      tool('search_tools', false),
    ];
    expect(chatCatalogue(tools)).toBe('router_reboot: router_reboot');
    expect(toolIndex(tools)).toBe('edit_room (home)');
  });
});
