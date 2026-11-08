import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '@smarteverything/domain';
import {
  TOOL_GROUPS,
  allowedOf,
  matchingToolGroups,
  stateOf,
  stored,
  toolsLabel,
  withTool,
  withTools,
} from './tools-model';

const everything = MCP_TOOLS.map((tool) => tool.name);
const first = TOOL_GROUPS[0];

describe('tools allowlist', () => {
  it('treats a null allowlist as every tool allowed', () => {
    expect(allowedOf({ tools: null })).toEqual(everything);
    expect(toolsLabel({ tools: null })).toBe('All tools');
  });

  it('is mixed when some but not all tools of a set are allowed', () => {
    const group = first?.tools ?? [];
    const one = group.slice(0, 1).map((tool) => tool.name);
    expect(stateOf(one, group)).toMatchObject({
      on: 1,
      all: group.length === 1,
      mixed: group.length > 1,
    });
    expect(stateOf([], group)).toMatchObject({ on: 0, all: false, mixed: false });
    expect(stateOf(everything, group)).toMatchObject({ all: true, mixed: false });
  });

  it('counts the allowed tools in the summary label', () => {
    const [, ...rest] = everything;
    expect(toolsLabel({ tools: rest })).toBe(
      `${String(rest.length)} of ${String(everything.length)} tools`,
    );
  });

  it('turns a whole set on from the mixed state and back off', () => {
    const group = first?.tools ?? [];
    const names = group.map((tool) => tool.name);
    const partial = withTool(everything, names[0] ?? '', false);
    expect(withTools(partial, group, true)).toEqual(expect.arrayContaining(everything));
    const off = withTools(everything, group, false);
    expect(names.some((name) => off.includes(name))).toBe(false);
  });

  it('stores null once every tool is allowed again', () => {
    const name = everything[0] ?? '';
    const partial = withTool(everything, name, false);
    expect(stored(partial)).toEqual(partial);
    expect(stored(withTool(partial, name, true))).toBeNull();
  });
});

describe('chat tools search', () => {
  const group = TOOL_GROUPS.find((item) => item.tools.length > 1);
  if (group === undefined) throw new Error('Expected a category with more than one tool.');

  it('matches category names and returns the complete category', () => {
    const title = 'Shared production automation and scheduling infrastructure';
    const fixture = { ...group, title };
    expect(matchingToolGroups('SCHEDULING  infrastructure', [fixture])).toEqual([
      { group: fixture, tools: fixture.tools },
    ]);
  });

  it('matches the tool title, name and description without narrowing the full category', () => {
    const [tool, ...rest] = group.tools;
    if (tool === undefined) throw new Error('Expected a category tool.');
    const match = {
      ...tool,
      title: 'Very long holiday setup name',
      description: 'Seeds a tulip bed',
    };
    const fixture = { ...group, tools: [match, ...rest] };
    expect(matchingToolGroups('holiday tulip', [fixture])).toEqual([
      { group: fixture, tools: [match] },
    ]);
    expect(matchingToolGroups(match.name, [fixture])[0]?.tools).toContain(match);
    expect(matchingToolGroups('unsearchable-fixture', [fixture])).toEqual([]);
  });
});
