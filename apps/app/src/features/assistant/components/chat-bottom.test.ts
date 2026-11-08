import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AI_CHAT_ROW, AI_SUBSCRIPTION_USAGE, type ChatTimelineTool } from '@smarteverything/domain';
import {
  codexSubscriptionWindows,
  projectedSubscriptionWindows,
  weeklyAllowance,
} from '../provider/subscription-usage-values';
import type { ChartPoint } from '../../../components/charts';
import { COLOUR_VARIABLE, PaletteContext } from '../../../design/colour-roles';
import {
  activatedPanel,
  BOTTOM_COLLAPSED,
  bottomActivityOf,
  INITIAL_BOTTOM_VISIBILITY,
  openedBottomReadings,
  toggledBottomArea,
} from './bottom-status-model';

import type * as ReactTypes from 'react';

const real: typeof ReactTypes = await vi.importActual('react');
const { meterHistory, catalogue, claudeProvider, codexProvider, quotaTime } = vi.hoisted(() => ({
  meterHistory: vi.fn(),
  catalogue: vi.fn().mockReturnValue({}),
  claudeProvider: vi.fn().mockReturnValue({}),
  codexProvider: vi.fn().mockReturnValue({}),
  quotaTime: vi.fn<() => number>().mockReturnValue(Date.parse('2026-01-01T00:00:00.000Z')),
}));

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    View: ({
      children,
      nativeID,
      className,
    }: {
      readonly children?: ReactNode;
      readonly nativeID?: string;
      readonly className?: string;
    }): ReactNode => real.createElement('div', { id: nativeID, className }, children),
    ScrollView: ({ children }: { readonly children?: ReactNode }): ReactNode =>
      real.createElement('div', null, children),
    useWindowDimensions: (): { width: number; height: number } => ({ width: 412, height: 844 }),
  };
});

vi.mock('../../../design/cn', () => ({
  cn: (...parts: readonly (string | false | undefined)[]): string =>
    parts.filter(Boolean).join(' '),
}));

vi.mock('../../../components/interactive', () => ({
  Interactive: ({
    label,
    controls,
    children,
  }: {
    readonly label?: string;
    readonly controls?: string;
    readonly children?: ReactNode;
  }): ReactNode =>
    real.createElement(
      'button',
      { 'data-label': label ?? '', 'aria-controls': controls },
      children,
    ),
}));

vi.mock('../../../components/icon', () => ({
  Icon: ({ name }: { readonly name: string }): ReactNode =>
    real.createElement('i', { 'data-icon': name }),
}));

vi.mock('../../../components/charts', () => ({
  ProgressBar: ({ label }: { readonly label: string }): ReactNode =>
    real.createElement('div', { 'aria-label': label, role: 'progressbar' }),
  Sparkline: ({ points }: { readonly points: readonly ChartPoint[] }): ReactNode =>
    real.createElement('div', { 'data-chart-values': points.map((point) => point.v).join(',') }),
}));

vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    real.createElement('span', null, children),
}));

vi.mock('../data/chat-activity', () => ({ useChatActivity: vi.fn(() => ACTIVITY) }));
vi.mock('../data/assistant-data', () => ({ useAssistantStatus: vi.fn() }));
vi.mock('../data/chat-store', () => ({ useFooterFacts: vi.fn() }));
vi.mock('../data/harness', () => ({ useHarnessCatalogue: catalogue }));
vi.mock('../provider/provider-data', () => ({ useChatProvider: claudeProvider }));
vi.mock('../provider/codex-provider-data', () => ({ useCodexProvider: codexProvider }));
vi.mock('../../../store/selectors', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIsOwner: vi.fn().mockReturnValue(true),
  useDevice: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../store/clock', () => ({
  useMinuteOf: <T>(select: (now: number) => T): T => select(quotaTime()),
}));
vi.mock('../data/context-usage', () => ({
  useContextUsage: vi.fn().mockReturnValue({ percent: null, label: 'Context' }),
}));
vi.mock('../data/chat-meter-trends', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useChatMeterHistory: meterHistory,
}));
vi.mock('../data/chat-usage-history', () => ({
  useChatUsageHistory: (): { cost: readonly never[]; helpers: readonly never[] } => ({
    cost: [],
    helpers: [],
  }),
}));
vi.mock('../details/use-harness-failure', () => ({
  useFailureHandlers: vi.fn().mockReturnValue(vi.fn().mockReturnValue(null)),
  useHarnessFailure: vi.fn().mockReturnValue(null),
}));
vi.mock('../chats/use-execution-line', () => ({
  useExecutionLine: vi.fn().mockReturnValue({ text: '', warning: false, cancel: null }),
}));
vi.mock('../chats/compact-chat-button', () => ({
  CompactChatButton: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../design/size-class', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSizeClass: vi.fn().mockReturnValue({ height: 'medium' }),
}));
vi.mock('../../region', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMoney: vi.fn().mockReturnValue({ cost: String }),
}));

const { ChatFooterStrip } = await import('../chats/chat-footer-strip');
const { ChatBottomArea } = await import('./chat-bottom-area');
const { useChatActivity } = await import('../data/chat-activity');

let calls = 0;

function call(name: string, input: unknown, output: unknown): ChatTimelineTool {
  calls += 1;
  return {
    callId: `${name}-${String(calls)}`,
    name,
    title: name,
    state: 'done',
    detail: null,
    input: JSON.stringify(input),
    output: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(output) }] }),
    redacted: false,
    image_operation_id: null,
  };
}

const ID_A = 'a1b2c3d4-0000-4000-8000-000000000001';
const ID_B = 'a1b2c3d4-0000-4000-8000-000000000002';
const MOMENT = '2026-01-01T00:00:00.000Z';
const RESET = '2026-01-08T00:00:00.000Z';

const SUBSCRIPTION = AI_SUBSCRIPTION_USAGE.parse({
  runtime: 'claude',
  reported_at: MOMENT,
  status: 'reported',
  windows: [
    {
      id: 'five_hour',
      label: '5 hour window',
      used_percent: 90,
      resets_at: null,
      window_duration_mins: 300,
    },
    {
      id: 'seven_day',
      label: '7 day window',
      used_percent: 25,
      resets_at: RESET,
      window_duration_mins: 10080,
    },
  ],
});

const CODEX_SUBSCRIPTION = AI_SUBSCRIPTION_USAGE.parse({
  ...SUBSCRIPTION,
  runtime: 'codex',
  windows: SUBSCRIPTION.windows.map((window) => {
    const slot = window.id === 'five_hour' ? 'primary' : 'secondary';
    return { ...window, id: JSON.stringify(['codex', slot]), label: `Codex · ${slot}` };
  }),
});

const chat = AI_CHAT_ROW.parse({
  id: ID_A,
  profile_id: ID_B,
  kind: 'chat',
  title: 'Bottom bar',
  icon: null,
  parent_id: null,
  helper_name: null,
  source_key: null,
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: ID_B,
    model_route_id: ID_B,
    model: 'deepseek/deepseek-v4',
  },
  tools: null,
  pinned: false,
  memory: true,
  archived_at: null,
  cost_micros: 0,
  last_message_at: null,
  created_at: MOMENT,
  updated_at: MOMENT,
});

const ACTIVITY = bottomActivityOf({
  chat,
  tools: [
    call(
      'create_goal',
      {},
      {
        goal: {
          id: 'g1',
          revision: 1,
          objective: 'Ship the bottom bar',
          phase: 'active',
          roundsStarted: 1,
          maxGoalRounds: 8,
        },
      },
    ),
    call(
      'todo_write',
      {
        todos: [
          { content: 'Read the brief', status: 'completed' },
          { content: 'Build the rows', status: 'in_progress' },
          { content: 'Write the test', status: 'pending' },
        ],
      },
      { ok: true },
    ),
    call(
      'shell_execute',
      { command: 'pnpm test', description: 'Run the tests', run_in_background: true },
      {},
    ),
  ],
  session: {
    work: [
      { id: 'job-1', kind: 'shell', reason: 'Started a background command' },
      { id: 'helper-1', kind: 'child', reason: 'A helper is working' },
      { id: 'helper-1', kind: 'child', reason: 'The same native child is working' },
      { id: 'helper-1', kind: 'turn', reason: 'The child turn is running' },
    ],
  },
});

function markupOf(node: ReactNode): string {
  return renderToStaticMarkup(real.createElement(PaletteContext, { value: COLOUR_VARIABLE }, node));
}

describe('the bottom area under the chat bar', () => {
  it('prefers the checklist a reply saved over one read from the tool that lost its input', () => {
    const activity = bottomActivityOf({
      chat,
      tools: [
        call(
          'todo_write',
          { todos: [{ content: 'Build the rows', status: 'in_progress' }] },
          { ok: true },
        ),
      ],
      session: { work: [] },
      todos: { items: [{ content: 'Build the rows', status: 'completed' }], done: 1 },
    });
    expect(activity.done).toBe(1);
    expect(activity.current).toBeNull();
    expect(activity.indicators.map((indicator) => indicator.text)).toContain('1/1');
  });

  it('shows compact controls with the activity and details closed on entry', () => {
    const markup = markupOf(
      real.createElement(ChatFooterStrip, {
        chat,
        blocked: false,
        working: false,
      }),
    );
    expect(markup.match(/data-label="Goal, Working,/gu)).toHaveLength(1);
    expect(markup.match(/data-label="Tasks,/gu)).toHaveLength(1);
    expect(markup.match(/data-label="Background jobs,/gu)).toHaveLength(1);
    expect(markup).not.toContain('data-label="Chat details"');
    expect(markup).toMatch(
      /data-label="Context unavailable[^"]*" aria-controls="chat-context-reading"/u,
    );
    expect(markup).toContain('data-label="Cost unavailable" aria-controls="chat-billing-reading"');
    expect(markup.indexOf('data-label="Show chat activity"')).toBeGreaterThan(
      markup.indexOf('data-label="Background jobs,'),
    );
    expect(markup).not.toContain('Now: Build the rows');
  });

  it('hides the summaries and details together when the group closes', () => {
    const markup = markupOf(
      real.createElement(ChatBottomArea, {
        activity: ACTIVITY,
        expanded: false,
        open: { ...BOTTOM_COLLAPSED, goal: true },
        onPanel: vi.fn(),
      }),
    );
    expect(markup).not.toContain('Ship the bottom bar');
  });

  it('loads measured history only when expanded and leaves a single reading unplotted', () => {
    meterHistory.mockClear();
    meterHistory.mockReturnValueOnce({
      data: { context: [{ t: Date.parse(MOMENT), v: 0 }], cache: [], subscription: [] },
      isError: false,
      isLoading: false,
    });
    const props = {
      activity: ACTIVITY,
      open: BOTTOM_COLLAPSED,
      onPanel: vi.fn(),
      paneWidth: 412,
      usage: {
        chat,
        context: { label: 'Context', percent: 0, capacity: null },
        billing: 'unknown' as const,
        weekly: null,
        blocked: false,
        total: 'Unavailable',
        shown: true,
        recorded: false,
      },
    };
    markupOf(real.createElement(ChatBottomArea, { ...props, expanded: false }));
    expect(meterHistory).not.toHaveBeenCalled();
    const expanded = markupOf(real.createElement(ChatBottomArea, { ...props, expanded: true }));
    expect(meterHistory).toHaveBeenCalledExactlyOnceWith(chat.id);
    expect(expanded).toContain('Waiting for more readings');
    expect(expanded).toContain('>Cost<');
    expect(expanded).not.toContain('>Usage<');
  });

  it.each(['claude', 'codex', 'dsh'] as const)(
    'shows the verified weekly allowance in the compact %s footer',
    (kind) => {
      const selected = AI_CHAT_ROW.parse({
        ...chat,
        engine: kind === 'dsh' ? chat.engine : { kind, device_id: ID_B, model: 'test-model' },
      });
      if (kind === 'dsh') {
        catalogue.mockReturnValueOnce({
          data: {
            routes: [
              {
                id: ID_B,
                billing: 'subscription-only',
                supplier: { kind: 'server' },
                auth: { provider: 'anthropic' },
                usage: SUBSCRIPTION,
              },
            ],
          },
        });
      } else {
        const provider = kind === 'claude' ? claudeProvider : codexProvider;
        provider.mockReturnValueOnce({
          data: { subscription_usage: kind === 'codex' ? CODEX_SUBSCRIPTION : SUBSCRIPTION },
        });
      }
      const markup = markupOf(
        real.createElement(ChatFooterStrip, { chat: selected, blocked: false, working: false }),
      );
      expect(markup).toContain('>75% left<');
      expect(markup).not.toContain('>10% left<');
      expect(markup).not.toContain('role="progressbar"');
    },
  );

  it('drops the weekly percentage at reset and does not substitute the short window', () => {
    const selected = AI_CHAT_ROW.parse({
      ...chat,
      engine: { kind: 'claude', device_id: ID_B, model: 'test-model' },
    });
    quotaTime.mockReturnValueOnce(Date.parse(RESET));
    claudeProvider.mockReturnValueOnce({ data: { subscription_usage: SUBSCRIPTION } });
    const markup = markupOf(
      real.createElement(ChatFooterStrip, { chat: selected, blocked: false, working: false }),
    );
    expect(markup).not.toContain('% left');
  });

  it('preserves known weekly usage when the provider supplies no reset time', () => {
    const window = projectedSubscriptionWindows(SUBSCRIPTION).find(({ id }) => id === 'seven_day');
    expect(window).toBeDefined();
    if (window === undefined) return;
    expect(weeklyAllowance({ ...window, resetAt: null }, Date.parse(RESET))).toEqual({
      text: '75% left',
      resetAt: null,
    });
  });

  it('preserves top-level native Codex usage beside a distinct keyed bucket', () => {
    const windows = codexSubscriptionWindows({
      rateLimits: {
        limitId: 'codex',
        secondary: { usedPercent: 25, windowDurationMins: 10080 },
      },
      rateLimitsByLimitId: {
        model: { primary: { usedPercent: 90, windowDurationMins: 300 } },
      },
    });
    expect(windows.map(({ id, percent }) => [id, percent])).toEqual([
      [JSON.stringify(['model', 'primary']), 90],
      [JSON.stringify(['codex', 'secondary']), 25],
    ]);
  });

  it('uses the duration reported by the native Codex snapshot to label its windows', () => {
    expect(projectedSubscriptionWindows(CODEX_SUBSCRIPTION).map((window) => window.label)).toEqual([
      'Codex · 5 hour window',
      'Codex · 7 day window',
    ]);
  });

  it.each([true, false])(
    'plots current-cycle weekly allowance and respects metered visibility (%s)',
    (shown) => {
      const start = Date.parse(MOMENT);
      const resetAt = Date.parse(RESET);
      meterHistory.mockReturnValueOnce({
        isLoading: false,
        isError: false,
        data: {
          context: [],
          cache: [],
          subscription: [
            { t: start - 1, v: 90, resetAt: start },
            { t: start, v: 20, resetAt },
            { t: start + 1, v: 25, resetAt },
          ],
        },
      });
      const markup = markupOf(
        real.createElement(ChatBottomArea, {
          activity: ACTIVITY,
          open: BOTTOM_COLLAPSED,
          onPanel: vi.fn(),
          paneWidth: 412,
          expanded: true,
          usage: {
            chat,
            context: { label: 'Context', percent: 0, capacity: null },
            billing: 'subscription-only',
            weekly: { text: '75% left', resetAt },
            selected: 'billing',
            blocked: false,
            total: '$1.25',
            shown,
            recorded: true,
          },
        }),
      );
      expect(markup).toContain('>Usage<');
      expect(markup).not.toContain('>Cost<');
      expect(markup).toContain('>75% left<');
      expect(markup).toContain('>Resets ');
      expect(markup).toContain('data-chart-values="80,75"');
      expect(markup).toMatch(/id="chat-billing-reading" class="[^"]*border-primary"/u);
      expect(markup.includes('Metered spend $1.25')).toBe(shown);
    },
  );

  it('keeps the idle activity shortcuts visible', () => {
    vi.mocked(useChatActivity).mockReturnValueOnce(
      bottomActivityOf({ chat, tools: [], session: undefined }),
    );
    const markup = markupOf(
      real.createElement(ChatFooterStrip, { chat, blocked: false, working: false }),
    );
    expect(markup).toContain('data-label="Goal, none set"');
    expect(markup).toContain('data-label="Tasks, none"');
    expect(markup).toContain('data-label="Background jobs, none running"');
  });

  it('counts a helper when no shell job is running', () => {
    const activity = bottomActivityOf({
      chat,
      tools: [],
      session: { work: [{ id: 'helper-1', kind: 'child', reason: 'A helper is working' }] },
    });
    expect(activity.running).toBe(1);
    expect(activity.indicators.map((indicator) => indicator.panel)).toEqual(['jobs']);
  });
});

describe('the area state', () => {
  it('opens readings with activity collapsed and preserves already open activity', () => {
    const reading = openedBottomReadings(INITIAL_BOTTOM_VISIBILITY, false);
    expect(reading).toEqual({ expanded: true, open: BOTTOM_COLLAPSED });
    const activity = activatedPanel(reading, 'goal');
    expect(openedBottomReadings(activity, false)).toBe(activity);
    expect(openedBottomReadings(activity, true)).toEqual(reading);
  });

  it('opens the area without widget bodies at compact heights', () => {
    const area = toggledBottomArea(INITIAL_BOTTOM_VISIBILITY, true);
    expect(area).toEqual({ expanded: true, open: BOTTOM_COLLAPSED });
    expect(activatedPanel(area, 'tasks', 2).open).toEqual({
      goal: true,
      tasks: true,
      jobs: false,
    });
  });

  it('opens all widget bodies from the chevron at regular heights', () => {
    expect(toggledBottomArea(INITIAL_BOTTOM_VISIBILITY, false)).toEqual({
      expanded: true,
      open: { goal: true, tasks: true, jobs: true },
    });
  });

  it('each panel opens and closes on its own', () => {
    const tasks = activatedPanel(INITIAL_BOTTOM_VISIBILITY, 'tasks');
    expect(tasks).toEqual({ expanded: true, open: { goal: false, tasks: true, jobs: false } });
    expect(activatedPanel(tasks, 'jobs').open).toEqual({ goal: false, tasks: true, jobs: true });
    expect(activatedPanel(tasks, 'tasks').open).toEqual(BOTTOM_COLLAPSED);
  });

  it('toggles only the expandable panels sharing the selected row', () => {
    const tasks = activatedPanel(INITIAL_BOTTOM_VISIBILITY, 'tasks', 2);
    expect(tasks.open).toEqual({ goal: true, tasks: true, jobs: false });
    expect(activatedPanel(tasks, 'goal', 2).open).toEqual(BOTTOM_COLLAPSED);
  });

  it('reopens a hidden panel rather than toggling it closed when its indicator is pressed', () => {
    const tasks = activatedPanel(INITIAL_BOTTOM_VISIBILITY, 'tasks');
    expect(activatedPanel({ ...tasks, expanded: false }, 'tasks')).toEqual(tasks);
  });
});
