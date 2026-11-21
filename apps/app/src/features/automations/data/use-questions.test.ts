import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AutomationQuestion, AutomationRunSummary } from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';
import { emptyState, makeTable } from '../../../store/state';
import { runOf } from '../list/list-fixtures';
import * as hubApi from './api';
import { AutomationsSourceContext } from './source-context';
import { hubSource, type AutomationsSource } from './source';
import { useQuestions } from './use-questions';

let root: Root | null = null;

function withRuns(store: EntityStore, runs: readonly AutomationRunSummary[]): void {
  store.update((state) => ({
    ...state,
    tables: {
      ...state.tables,
      automation_runs: makeTable(
        Object.fromEntries(runs.map((run) => [run.id, run])),
        runs.map((run) => run.id),
        state.tables.automation_runs.version + 1,
      ),
    },
  }));
}

function run(
  index: number,
  status: AutomationRunSummary['status'],
  steps = 0,
): AutomationRunSummary {
  return { ...runOf(index, 1, status, '2026-10-18T11:00:00.000Z'), steps };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(store: EntityStore): Promise<Mock<() => Promise<AutomationQuestion[]>>> {
  const listQuestions = vi.fn((): Promise<AutomationQuestion[]> => Promise.resolve([]));
  const source: AutomationsSource = {
    ...hubSource(store),
    api: { ...hubApi, listQuestions },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Probe(): ReactNode {
    useQuestions();
    return null;
  }
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
        QueryClientProvider,
        { client },
        createElement(AutomationsSourceContext, { value: source }, createElement(Probe)),
      ),
    );
  });
  await settle();
  return listQuestions;
}

async function change(store: EntityStore, runs: readonly AutomationRunSummary[]): Promise<void> {
  withRuns(store, runs);
  await vi.waitFor(() => {
    expect(store.get().tables.automation_runs.rows).toEqual(runs);
  });
  await settle();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(async () => {
  act(() => {
    root?.unmount();
  });
  root = null;
  await settle();
  vi.unstubAllGlobals();
});

describe('useQuestions refreshes', () => {
  it('does not ask the Hub again for run progress or runs that never wait', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    const listQuestions = await mount(store);
    expect(listQuestions).toHaveBeenCalledTimes(1);
    for (let step = 1; step <= 20; step += 1) {
      await change(store, [run(1, 'running', step), run(2, step > 10 ? 'succeeded' : 'running')]);
    }
    expect(listQuestions).toHaveBeenCalledTimes(1);
  });

  it('asks again when a run starts waiting, stops waiting and finishes after waiting', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withRuns(store, [run(1, 'running')]);
    const listQuestions = await mount(store);
    expect(listQuestions).toHaveBeenCalledTimes(1);
    await change(store, [run(1, 'waiting', 1)]);
    expect(listQuestions).toHaveBeenCalledTimes(2);
    await change(store, [run(1, 'waiting', 2)]);
    expect(listQuestions).toHaveBeenCalledTimes(2);
    await change(store, [run(1, 'running', 3)]);
    expect(listQuestions).toHaveBeenCalledTimes(3);
    await change(store, [run(1, 'running', 4)]);
    expect(listQuestions).toHaveBeenCalledTimes(3);
    await change(store, [run(1, 'succeeded', 4)]);
    expect(listQuestions).toHaveBeenCalledTimes(4);
  });

  it('keeps a refresh in flight instead of cancelling it for the next wait change', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    const listQuestions = await mount(store);
    const pending: ((value: AutomationQuestion[]) => void)[] = [];
    listQuestions.mockImplementation(
      () =>
        new Promise<AutomationQuestion[]>((resolve) => {
          pending.push(resolve);
        }),
    );
    await change(store, [run(1, 'waiting')]);
    await change(store, [run(1, 'waiting'), run(2, 'waiting')]);
    expect(listQuestions).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.forEach((resolve) => {
        resolve([]);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});
