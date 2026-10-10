import { MCP_TOOLS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { HubTool } from '../../src/ai-tools/hub-tool';
import { chatCatalogue, chatSet } from '../../src/ai-tools/tool-sets';
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
    expect(listing.annotations.destructiveHint).toBe(true);
    expect(listing.annotations.readOnlyHint).toBe(false);
  });

  it('resolve a served call to the part that runs it', () => {
    expect(partCallOf('log_food', { what: 'water', millilitres: 250 })).toEqual({
      name: 'log_water',
      args: { millilitres: 250 },
    });
    expect(partCallOf('read_phone', { profileId: 'p' })).toEqual({
      name: 'read_phone_context',
      args: { profileId: 'p' },
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
    const read = resourceRead({ uri: 'smarteverything://docs/tools' }, TOOLS);
    const text = z
      .strictObject({ contents: z.array(z.looseObject({ text: z.string() })) })
      .parse(read).contents[0]?.text;
    expect(text?.split('\n')).toHaveLength(TOOLS.length);
    expect(text).toContain('edit_room(action: "create"|"update"|"remove"');
    expect(resourceRead({ uri: 'smarteverything://nothing' }, TOOLS)).toBeNull();
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

  it('declares home tools by name, so the declaration list never changes order', () => {
    const names = chatSet([tool('set_x', false), tool('get_a', false), tool('log_b', true)]).map(
      (spec) => spec.name,
    );
    expect(names).toEqual(['get_a', 'set_x', 'call_tool']);
  });

  it('declares every home tool and lists plugin tools for call_tool', () => {
    const tools = [tool('get_home', false), tool('router_reboot', true)];
    expect(chatSet(tools).map((spec) => spec.name)).toEqual(['get_home', 'call_tool']);
    expect(chatCatalogue(tools)).toBe('router_reboot(): router_reboot.');
    expect(chatSet([tool('get_home', false)]).map((spec) => spec.name)).toEqual(['get_home']);
  });
});
