import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '@smarteverything/domain';
import {
  TOOL_GROUPS,
  groupState,
  toolsSummary,
  withGroup,
  withTool,
  type ToolGroup,
} from './tools';

function firstGroup(): ToolGroup {
  const group = TOOL_GROUPS[0];
  if (group === undefined) {
    throw new Error('no groups');
  }
  return group;
}

describe('tool groups', () => {
  it('puts every tool in exactly one group and keeps no empty group', () => {
    const names = TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.name));
    expect(names.toSorted()).toEqual(MCP_TOOLS.map((tool) => tool.name).toSorted());
    expect(TOOL_GROUPS.every((group) => group.tools.length > 0)).toBe(true);
  });

  it('is on when none of its tools is disabled, off when all are, mixed otherwise', () => {
    const group = firstGroup();
    const names = group.tools.map((tool) => tool.name);
    expect(groupState(group, [])).toBe('on');
    expect(groupState(group, ['unrelated'])).toBe('on');
    expect(groupState(group, names)).toBe('off');
    if (names.length > 1) {
      expect(groupState(group, names.slice(0, 1))).toBe('mixed');
    }
  });
});

describe('withTool and withGroup', () => {
  it('disables a tool by adding it and enables it by removing it, once', () => {
    expect(withTool([], 'a', false)).toEqual(['a']);
    expect(withTool(['a'], 'a', false)).toEqual(['a']);
    expect(withTool(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('switches a whole group without touching other disabled tools', () => {
    const group = firstGroup();
    const names = group.tools.map((tool) => tool.name);
    expect(withGroup(['other'], group, false)).toEqual(['other', ...names]);
    expect(withGroup(['other', ...names], group, true)).toEqual(['other']);
  });
});

describe('toolsSummary', () => {
  it('counts the tools that are on, ignoring names that are not tools', () => {
    const total = MCP_TOOLS.length;
    expect(toolsSummary([])).toBe(`All ${String(total)} on`);
    expect(toolsSummary(['not_a_tool'])).toBe(`All ${String(total)} on`);
    const first = MCP_TOOLS[0]?.name ?? '';
    expect(toolsSummary([first])).toBe(`${String(total - 1)} of ${String(total)} on`);
  });
});

describe('tool text', () => {
  it('has a title and a line for every tool', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title.length, tool.name).toBeGreaterThan(0);
      expect(tool.line.length, tool.name).toBeGreaterThan(0);
    }
  });
});
