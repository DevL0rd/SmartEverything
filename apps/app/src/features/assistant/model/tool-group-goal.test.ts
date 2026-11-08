import type { ChatTimelineTool } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { activitySummary, activitySummaryLine } from './tool-group-goal';

function tool(
  name: string,
  state: ChatTimelineTool['state'],
  output: string | null = null,
): ChatTimelineTool {
  return {
    callId: `${name}-${state}`,
    name,
    title: name,
    state,
    detail: null,
    input: null,
    output,
    redacted: false,
    image_operation_id: null,
  };
}

const plugin = (): string | null => null;
const base = { stopped: false, thinking: false, thoughtSeconds: null, pluginName: plugin } as const;

describe('activitySummary', () => {
  it('shows the running step title while live', () => {
    const summary = activitySummary({
      ...base,
      live: true,
      tools: [tool('read', 'done'), tool('web_search', 'running')],
    });
    expect(summary).toMatchObject({ tone: 'live', lead: 'Search the web' });
  });

  it('shows Thinking while live with no running tool', () => {
    expect(activitySummary({ ...base, live: true, thinking: true, tools: [] }).lead).toBe(
      'Thinking',
    );
  });

  it('lists distinct verbs in order when done', () => {
    const summary = activitySummary({
      ...base,
      live: false,
      tools: [tool('read', 'done'), tool('web_search', 'done'), tool('read', 'done')],
    });
    expect(summary.tone).toBe('done');
    expect(activitySummaryLine(summary, summary.verbs.length)).toBe(
      'Used 3 tools · read files, search the web',
    );
    expect(activitySummaryLine(summary, 1)).toBe('Used 3 tools · read files');
    expect(activitySummaryLine(summary, 0)).toBe('Used 3 tools');
  });

  it('reports thought time when only reasoning happened', () => {
    const summary = activitySummary({ ...base, live: false, thoughtSeconds: 6.2, tools: [] });
    expect(activitySummaryLine(summary, 0)).toBe('Thought for 6 s');
  });

  it('counts failures', () => {
    const summary = activitySummary({
      ...base,
      live: false,
      tools: [tool('read', 'done'), tool('bash', 'failed')],
    });
    expect(summary.tone).toBe('failed');
    expect(activitySummaryLine(summary, 5)).toBe(
      'Used 2 tools · read files, run commands · 1 failed',
    );
  });

  it('reports a stopped turn', () => {
    const summary = activitySummary({
      ...base,
      live: false,
      tools: [tool('read', 'done'), tool('bash', 'running')],
    });
    expect(summary.tone).toBe('stopped');
    expect(summary.lead).toBe('Stopped after 2 tools');
  });

  it('marks a stopped turn stopped even when every tool finished', () => {
    const summary = activitySummary({
      ...base,
      live: false,
      stopped: true,
      tools: [tool('device_find', 'done')],
    });
    expect(summary).toMatchObject({ tone: 'stopped', lead: 'Stopped after 1 tool' });
  });

  it('names what the app tools did from their names, not their titles', () => {
    const titled = (name: string, title: string): ChatTimelineTool => ({
      ...tool(name, 'done'),
      title,
    });
    const summary = activitySummary({
      ...base,
      live: false,
      tools: [
        titled('device_find', 'Find kitchen lights'),
        titled('scene_find', 'Read evening scene'),
        titled('device_read', 'Read hob light'),
        titled('mcp__smarteverything__device_control', 'Dim hob light'),
        titled('WebSearch', 'Look up bulbs'),
        titled('WebFetch', 'Read product pages'),
      ],
    });
    expect(summary.verbs).toEqual([
      'read devices',
      'read scenes',
      'control devices',
      'search the web',
      'read web pages',
    ]);
  });
});
