import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOMATION_RUN_ID,
  type AutomationRunSummary,
  type StoredAutomationRow,
} from '@smarteverything/domain';

const seen = vi.hoisted(() => {
  const labels: string[] = [];
  const runs: unknown[] = [];
  return { rows: 0, labels, runs };
});

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
  Text: (): null => null,
}));

vi.mock('../../../components/interactive', () => ({
  Interactive: ({ label }: { readonly label: string }): null => {
    seen.rows += 1;
    seen.labels.push(label);
    return null;
  },
}));

vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/badge', () => ({ Badge: (): null => null }));
vi.mock('./runs-chart', () => ({ RunsChart: (): null => null }));
vi.mock('./run-filters', () => ({ RunFilters: (): null => null }));

vi.mock('../data/use-runs', () => ({
  useRuns: (): unknown => ({ isError: false, error: null, data: seen.runs, refetch: () => null }),
  useDecisions: (): unknown => ({
    isError: false,
    error: null,
    data: [],
    refetch: () => null,
  }),
}));

const { ScreenPause, ScreenPausedContext } = await import('../../../design/screen-pause');
const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { emptyState, makeTable } = await import('../../../store/state');
const { StoreContext } = await import('../../../store/store-runtime');
const { buttonTrigger, setPower, storedAutomationRow } =
  await import('../../../test-support/automation-rows');
const { RunsScreen } = await import('./runs-screen');

type Store = InstanceType<typeof EntityStore>;

const ROWS = 3;
const RUNS = 12;

let root: Root | null = null;

function automation(index: number, name: string, lastRunAt: string | null): StoredAutomationRow {
  return {
    ...storedAutomationRow({
      index,
      name,
      triggers: [buttonTrigger(`button-${String(index)}`)],
      nodes: [setPower(`lamp-${String(index)}`, true)],
    }),
    last_run_at: lastRunAt,
  };
}

function withRows(store: Store, rows: readonly StoredAutomationRow[]): void {
  store.update((state) => ({
    ...state,
    tables: {
      ...state.tables,
      automations: makeTable(
        Object.fromEntries(rows.map((row) => [row.id, row])),
        rows.map((row) => row.id),
        state.tables.automations.version + 1,
      ),
    },
  }));
}

function runOf(index: number, automationId: string): AutomationRunSummary {
  const at = new Date(Date.parse('2026-11-20T08:00:00.000Z') + index * 60_000).toISOString();
  return {
    id: AUTOMATION_RUN_ID.parse(`90000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
    automation_id: automationId,
    revision: 1,
    owner_profile_id: null,
    control_key: null,
    parent_run_id: null,
    status: 'succeeded',
    mode: 'live',
    plan_hash: 'hash',
    current_node: null,
    started_by: null,
    steps: 3,
    commands: 0,
    iterations: 0,
    active_paths: [],
    wake_at: null,
    error: null,
    created_at: at,
    started_at: at,
    finished_at: at,
  };
}

function names(lastRunAt: string | null, renamed?: string): StoredAutomationRow[] {
  return Array.from({ length: ROWS }, (_, index) =>
    automation(
      index + 1,
      index === 0 && renamed !== undefined ? renamed : `Automation ${String(index + 1)}`,
      lastRunAt,
    ),
  );
}

function mount(store: Store, automationId: string | null): void {
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(
      createElement(
        StoreContext,
        { value: { store, ledger: new CommandLedger(store) } },
        createElement(
          ScreenPausedContext,
          { value: new ScreenPause(null) },
          createElement(RunsScreen, { automationId, timeZone: 'UTC', onOpenRun: () => undefined }),
        ),
      ),
    );
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function seeded(): Store {
  const store = new EntityStore();
  store.update(() => emptyState());
  const rows = names(null);
  withRows(store, rows);
  seen.runs = Array.from({ length: RUNS }, (_, index) =>
    runOf(index, rows[index % ROWS]?.id ?? 'missing'),
  );
  return store;
}

beforeEach(() => {
  seen.rows = 0;
  seen.labels = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    callback();
    return 1;
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('the runs list render budget', () => {
  it('renders no run row when an automation changes without a rename', async () => {
    const store = seeded();
    mount(store, null);
    expect(seen.rows).toBe(RUNS);
    for (let tick = 0; tick < 5; tick += 1) {
      withRows(store, names(`2026-11-20T09:00:0${String(tick)}.000Z`));
      await settle();
    }
    expect(seen.rows).toBe(RUNS);
  });

  it('renders only the renamed automation rows with the new name', async () => {
    const store = seeded();
    mount(store, null);
    seen.labels = [];
    withRows(store, names(null, 'Porch light'));
    await settle();
    expect(seen.rows).toBe(RUNS + RUNS / ROWS);
    expect(seen.labels).toHaveLength(RUNS / ROWS);
    expect(seen.labels.every((label) => label.startsWith('Porch light, '))).toBe(true);
  });

  it('names a run of a removed automation', async () => {
    const store = seeded();
    mount(store, null);
    seen.labels = [];
    withRows(store, names(null).slice(1));
    await settle();
    expect(seen.labels).toHaveLength(RUNS / ROWS);
    expect(seen.labels.every((label) => label.startsWith('A removed automation, '))).toBe(true);
  });
});
