import { describe, expect, it } from 'vitest';
import { MCP_CORE_TOOL_NAMES } from '../src/mcp/names';
import { MCP_ROUTES, MCP_TOOLS, MCP_TOOL_NAMES, isMcpToolName } from '../src/mcp/served';
import {
  PLANNER_EDIT_ACTIONS,
  PLANNER_READ_VIEWS,
  SERVED_PLANNER,
} from '../src/mcp/served-planner';

const DESCRIPTION_MIN = 60;
const DESCRIPTION_MAX = 600;
const LINE_MAX = 60;

function toolNamed(name: string): (typeof MCP_TOOLS)[number] {
  const found = MCP_TOOLS.find((tool) => tool.name === name);
  if (found === undefined) throw new Error(`no tool ${name}`);
  return found;
}

describe('the planner tools', () => {
  it('are one read and one edit tool with unique names', () => {
    expect(SERVED_PLANNER.map((tool) => tool.name)).toEqual(['planner_read', 'planner_edit']);
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
    expect(isMcpToolName('planner_read')).toBe(true);
    expect(isMcpToolName('planner_edit')).toBe(true);
  });

  it('read without changing anything and edit as a control', () => {
    expect(toolNamed('planner_read').access).toBe('read');
    expect(toolNamed('planner_edit').access).toBe('control');
  });

  it('are handled by the hub, not routed through API operations', () => {
    expect(MCP_ROUTES.get('planner_read')).toStrictEqual({ custom: true });
    expect(MCP_ROUTES.get('planner_edit')).toStrictEqual({ custom: true });
  });

  it('stay out of the always-declared set so tool_search finds them', () => {
    const declared: readonly string[] = MCP_CORE_TOOL_NAMES;
    expect(declared).not.toContain('planner_read');
    expect(declared).not.toContain('planner_edit');
  });

  it('keep short whole texts', () => {
    for (const tool of SERVED_PLANNER) {
      expect(tool.description, tool.name).toMatch(/^[A-Z`].*\.$/su);
      expect(tool.description.length, tool.name).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(tool.line.length, tool.name).toBeLessThanOrEqual(LINE_MAX);
      expect(tool.line, tool.name).not.toMatch(/…|\.\.\.|[;:(]/u);
    }
  });

  it('name every view and every action the plan lists, once each', () => {
    expect(PLANNER_READ_VIEWS).toEqual([
      'day',
      'range',
      'tasks',
      'item',
      'alarms',
      'timers',
      'stats',
      'free_slots',
      'google_status',
    ]);
    expect(PLANNER_EDIT_ACTIONS).toEqual([
      'add',
      'update',
      'complete',
      'skip',
      'move',
      'remove',
      'propose',
      'alarm_set',
      'alarm_remove',
      'timer_start',
      'timer_stop',
      'stopwatch',
    ]);
    expect(new Set(PLANNER_READ_VIEWS).size).toBe(PLANNER_READ_VIEWS.length);
    expect(new Set(PLANNER_EDIT_ACTIONS).size).toBe(PLANNER_EDIT_ACTIONS.length);
  });

  it('describe each view and action they accept', () => {
    const read = toolNamed('planner_read').description;
    for (const view of PLANNER_READ_VIEWS) {
      expect(read, view).toContain(view);
    }
    const edit = toolNamed('planner_edit').description;
    expect(edit).toContain('alarm');
    expect(edit).toContain('timer');
    expect(edit).toContain('stopwatch');
    expect(edit).toContain('propose');
  });

  it('take over timers and reminders from schedule_edit', () => {
    const schedule = toolNamed('schedule_edit').description;
    expect(schedule).toContain('planner_edit');
    expect(schedule).not.toMatch(/Use it for timers and reminders/u);
    expect(toolNamed('planner_edit').description).toContain('timers, alarms and reminders');
  });

  it('name only tools that exist', () => {
    for (const tool of SERVED_PLANNER) {
      for (const word of tool.description.match(/[a-z]+(?:_[a-z]+)+/gu) ?? []) {
        if (word.startsWith('planner_') || word === 'person_read') {
          expect(isMcpToolName(word), `${tool.name} names ${word}`).toBe(true);
          expect(word, `${tool.name} names itself`).not.toBe(tool.name);
        }
      }
    }
  });
});
