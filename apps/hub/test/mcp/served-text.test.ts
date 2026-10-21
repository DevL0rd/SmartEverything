import { MCP_PART_NAMES, MCP_ROUTES, MCP_TOOL_NAMES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TOOLS, toolNamed } from '../../src/extensions/mcp/tools';
import { serverInstructions } from '../../src/extensions/mcp/instructions';
import { TOOL_GUIDE } from '../../src/ai-tools/tool-guide';

const TOOL_NAMES: ReadonlySet<string> = new Set(MCP_TOOL_NAMES);

const SELECTOR_VALUES: ReadonlySet<string> = new Set(
  [...MCP_ROUTES.values()].flatMap((route) =>
    'branches' in route ? Object.keys(route.branches) : [],
  ),
);

const INTERNAL_PART_NAMES: readonly string[] = MCP_PART_NAMES.filter(
  (name) => !TOOL_NAMES.has(name) && !SELECTOR_VALUES.has(name),
);

const NODE = z.looseObject({});

function descriptionsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(descriptionsIn);
  const node = NODE.safeParse(value);
  if (!node.success) return [];
  return Object.entries(node.data).flatMap(([key, child]) =>
    key === 'description' && typeof child === 'string' ? [child] : descriptionsIn(child),
  );
}

function words(text: string): string[] {
  return text.match(/\b[a-z]+(?:_[a-z]+)+\b/gu) ?? [];
}

describe('the text a model reads about the tools', () => {
  it('never names an internal part that is not a tool of its own', () => {
    for (const tool of TOOLS) {
      const texts = [tool.listing.description, ...descriptionsIn(tool.listing.inputSchema)];
      const named = texts.flatMap(words).filter((word) => INTERNAL_PART_NAMES.includes(word));
      expect(named, tool.name).toStrictEqual([]);
    }
  });

  it('names no tool that does not exist in the guide and the server instructions', () => {
    const everything = [TOOL_GUIDE, serverInstructions(MCP_TOOL_NAMES)];
    const named = everything.flatMap(words).filter((word) => INTERNAL_PART_NAMES.includes(word));
    expect(named).toStrictEqual([]);
  });

  it('describes each branch of a routed tool in its own words when the route gives them', () => {
    const logs = toolNamed('signal_read');
    const keyed = z
      .looseObject({
        inputSchema: z.looseObject({
          properties: z.looseObject({ view: z.looseObject({ description: z.string() }) }),
        }),
      })
      .parse(logs?.listing);
    expect(keyed.inputSchema.properties.view.description).toContain(
      'values: The newest values of one signal',
    );
    expect(keyed.inputSchema.properties.view.description).not.toContain('never poll');
  });

  it('keeps every description in plain words, without protocol terms', () => {
    const jargon = /\b(authoritative|initiating|lease|fingerprint|reconcile|bounded)\b/iu;
    for (const tool of TOOLS) {
      expect(tool.listing.description, tool.name).not.toMatch(jargon);
    }
  });
});
