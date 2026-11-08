import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryClient as CoreQueryClient } from '@tanstack/query-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_LAYOUT,
  NODE_REGISTRY,
  type AutomationProgramDraftView,
} from '@smarteverything/domain';
import * as hubApi from '../../data/api';
import type { RevisionRow } from '../../data/api';
import { AutomationsSourceContext, type AutomationsSource } from '../../data/source';
import { automationKeys } from '../../data/keys';
import { structureAutomation } from '../../data/graph-adapter';
import { automation, note, start } from '../../model/graph/graph-scene-fixtures';
import { useDraftLoad, type DraftLoad } from './use-draft-sync';

const AUTOMATION_ID = '00000000-0000-4000-8000-000000000001';
const PROGRAM = automation([start('a'), note('a')], { triggers: [] });
const STRUCTURE = structureAutomation(PROGRAM, STATIC_KIND_LOOKUP);
if (STRUCTURE.kind !== 'ready') throw new Error('the fixture does not structure');

const VIEW: AutomationProgramDraftView = {
  id: AUTOMATION_ID,
  name: 'Baby crying',
  revision: 7,
  drafted: true,
  program: PROGRAM,
  layout: EMPTY_LAYOUT,
};

const ROW: RevisionRow = {
  automation_id: AUTOMATION_ID,
  revision: 7,
  definition: STRUCTURE.value.tree,
  graph: PROGRAM,
  map: STRUCTURE.value.map,
  layout: EMPTY_LAYOUT,
  plan_hash: 'hash',
  saved_at: '2026-10-19T10:00:00.000Z',
  author: { via: 'assistant', profile_id: '00000000-0000-4000-8000-000000000002' },
};

let root: Root | null = null;

function mount(getRevision: typeof hubApi.getRevision): () => DraftLoad | null {
  const source: AutomationsSource = {
    api: { ...hubApi, getDraft: () => Promise.resolve(VIEW), getRevision },
    automations: {
      snapshot: () => ({ rows: [], rejected: 0, unstructured: [] }),
      subscribe: () => () => undefined,
    },
    kindSource: { snapshot: () => NODE_REGISTRY, subscribe: () => () => undefined },
    trace: { hold: () => () => undefined },
    runChanges: () => () => undefined,
  };
  const client = new QueryClient();
  let latest: DraftLoad | null = null;
  function Probe(): ReactNode {
    latest = useDraftLoad(AUTOMATION_ID).load;
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
  return (): DraftLoad | null => latest;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('loading the editor of a drafted automation', () => {
  it('loads the base revision with one request and does not wait on itself', async () => {
    const getRevision = vi.fn(() => Promise.resolve(ROW));
    const load = mount(getRevision);
    await act(async () => {
      await vi.waitFor(() => {
        expect(load()).not.toBeNull();
      });
    });
    expect(load()?.base.revision).toBe(7);
    expect(getRevision).toHaveBeenCalledTimes(1);
    expect(getRevision).toHaveBeenCalledWith(AUTOMATION_ID, 7, NODE_REGISTRY);
  });

  it('shows that a query fetching its own key through the client never settles', async () => {
    const client = new CoreQueryClient();
    const queryKey = automationKeys.revision(AUTOMATION_ID, 7);
    const settled = vi.fn();
    const observer = client.query({
      queryKey,
      queryFn: () => client.query({ queryKey, queryFn: () => Promise.resolve(ROW) }),
    });
    void observer.then(settled);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(settled).not.toHaveBeenCalled();
  });
});
