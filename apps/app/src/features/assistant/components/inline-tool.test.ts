import type { ChatTimelineTool } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Content {
  readonly children?: ReactNode;
}

interface Pressable extends Content {
  readonly label?: string;
  readonly expanded?: boolean;
}

vi.mock('react-native', () => ({
  View: ({ children }: Content): ReactNode => createElement('div', null, children),
  Text: ({ children }: Content): ReactNode => createElement('span', { role: 'status' }, children),
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: Content): ReactNode => createElement('div', null, children) },
  css: { keyframes: (): object => ({}) },
  cubicBezier: (): string => 'ease',
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: Content): ReactNode => createElement('span', null, children),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({ children, label, expanded }: Pressable): ReactNode =>
    createElement('button', { 'aria-label': label, 'aria-expanded': expanded }, children),
}));
vi.mock('../../../components/disclosure', () => ({
  CollapseRoot: ({ children }: Content): ReactNode => createElement('section', null, children),
  CollapseBody: ({ children }: Content): ReactNode => createElement('ol', null, children),
}));
vi.mock('../../../design/animation-gate', () => ({
  useAnimationGate: (): { readonly moving: boolean } => ({ moving: false }),
}));
vi.mock('../../../design/visibility', () => ({ useScopeVisible: (): boolean => true }));
vi.mock('../../../design/motion', () => ({
  DURATION: { mediumOut: 200 },
  useMotion: (): { readonly reduced: boolean } => ({ reduced: true }),
}));
vi.mock('../../../store/clock', () => ({
  useSecondOf: <T>(select: (now: number) => T): T => select(Date.parse('2026-11-07T10:00:14Z')),
}));
vi.mock('../data/plugin-names', () => ({
  usePluginNames: (): ReadonlyMap<string, string> => new Map(),
}));
vi.mock('./rise', () => ({ Rise: ({ children }: Content): ReactNode => children }));
vi.mock('./thread-motion', () => ({ RISE_MS: { step: 150 }, RISE_PX: { step: 6 } }));
vi.mock('../data/assistant-data', () => ({ useAssistantStatus: (): null => null }));
vi.mock('./web-sources', () => ({ WebSources: (): null => null }));
vi.mock('./tool-file-diffs', () => ({ FileDiffList: (): null => null }));

const { InlineTool, activityLineOf } = await import('./inline-tool');
const { rememberActivityOpen, elapsedLabel, linePieces } = await import('./work-step-list');
const { activitySummary } = await import('../model/tool-group-goal');
const { recordedLineOf } = await import('./recorded-activity');

function tool(id: string, state: ChatTimelineTool['state'], name = 'read'): ChatTimelineTool {
  return {
    callId: id,
    name,
    title: name === 'read' ? 'Read' : 'Search the web',
    state,
    detail: null,
    input: null,
    output: null,
    redacted: false,
    image_operation_id: null,
  };
}

function render(tools: readonly ChatTimelineTool[], live: boolean, openKey = 'm1:g1'): string {
  return renderToStaticMarkup(
    createElement(InlineTool, {
      tools,
      activities: tools.map((action) => ({
        kind: 'tool' as const,
        key: action.callId,
        tool: action,
      })),
      sources: [],
      live,
      active: live,
      stopped: false,
      openKey,
      startedAt: '2026-11-07T10:00:00Z',
    }),
  );
}

const noPlugin = (): null => null;

function lineOf(
  tools: readonly ChatTimelineTool[],
  live: boolean,
  stopped = false,
): ReturnType<typeof activityLineOf> {
  const input = {
    tools,
    live,
    stopped,
    thinking: false,
    thoughtSeconds: null,
    pluginName: noPlugin,
  };
  return activityLineOf(activitySummary(input), tools, noPlugin);
}

describe('activity line', () => {
  it('summarises a finished group with its count and distinct verbs', () => {
    const line = lineOf([tool('a', 'done'), tool('b', 'done', 'web_search')], false);
    expect(line.glyph).toBe('done');
    expect(line.lead).toBe('Used 2 tools');
    expect(line.notes).toEqual([]);
  });

  it('shows a stopped turn with the stop glyph even when its one tool finished', () => {
    const line = lineOf([tool('a', 'done')], false, true);
    expect([line.glyph, line.lead]).toEqual(['stopped', 'Stopped after 1 tool']);
  });

  it('names the single tool of a group of one', () => {
    const line = lineOf([tool('a', 'done')], false);
    expect([line.glyph, line.lead, line.verbs]).toEqual(['done', 'Read', []]);
  });

  it('keeps the failed count as a note that is never clipped', () => {
    const line = lineOf([tool('a', 'done'), tool('b', 'failed')], false);
    expect(line.glyph).toBe('partial');
    expect(line.notes).toEqual(['1 failed']);
  });

  it('spaces its pieces by layout so web cannot trim the gap before a separator', () => {
    const pieces = linePieces({
      glyph: 'partial',
      lead: 'Used 3 tools',
      notes: ['1 failed'],
      verbs: ['read files', 'search the web'],
      label: '',
    });
    expect(pieces).toEqual([
      { text: '· 1 failed', spaced: true },
      { text: '· read files', spaced: true },
      { text: ', search the web', spaced: false },
    ]);
    expect(pieces.every((piece) => !piece.text.startsWith(' '))).toBe(true);
  });

  it('shows the running step while live', () => {
    const line = lineOf([tool('a', 'done'), tool('b', 'running', 'web_search')], true);
    expect([line.glyph, line.lead]).toEqual(['running', 'Search the web']);
  });

  it('formats live seconds and minutes', () => {
    expect([elapsedLabel(14.6), elapsedLabel(134)]).toEqual(['14 s', '2:14']);
  });
});

describe('InlineTool', () => {
  it('is expanded with live seconds while the turn runs', () => {
    const markup = render([tool('a', 'done'), tool('b', 'running')], true);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('14 s');
    expect(markup).toContain('<ol>');
  });

  it('is collapsed after the turn and prints no status words', () => {
    const markup = render([tool('a', 'done'), tool('b', 'done')], false, 'm1:done');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('<ol>');
    expect(markup).not.toMatch(/Succeeded|Working|Finished/);
  });

  it('keeps the toggle the person chose for that message', () => {
    rememberActivityOpen('m2:g1', true);
    const markup = render([tool('a', 'done'), tool('b', 'failed')], false, 'm2:g1');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('<ol>');
  });
});

describe('recorded activity', () => {
  it('uses the same line for rows without a timeline and carries no old history notice', () => {
    const done = recordedLineOf([
      { key: '1', title: 'Read file', state: 'done', detail: null },
      { key: '2', title: 'Edit file', state: 'done', detail: null },
    ]);
    expect([done.glyph, done.lead]).toEqual(['done', 'Used 2 steps']);
    const failed = recordedLineOf([
      { key: '1', title: 'Read camera', state: 'failed', detail: 'No answer' },
      { key: '2', title: 'Read history', state: 'done', detail: null },
    ]);
    expect([failed.glyph, failed.lead]).toEqual(['partial', '1 of 2 steps failed']);
  });
});
