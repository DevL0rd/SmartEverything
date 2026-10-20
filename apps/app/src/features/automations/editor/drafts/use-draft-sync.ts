import { useEffect, useMemo, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  AutomationProgramComparison,
  AutomationProgramDraftView,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useValue } from '../../../../design/external-store';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { automationKeys } from '../../data/keys';
import type { RevisionRow } from '../../data/api';
import { useAutomationsSource } from '../../data/source';
import { useDraftSyncSource } from '../../data/use-draft-sync-source';
import type { DocumentStore } from '../../model/editor/document-store';
import { DraftSyncModel, type DraftBase, type SyncPorts, type SyncState } from './draft-sync-model';

export interface DraftLoad {
  readonly ports: SyncPorts;
  readonly base: DraftBase;
  readonly remoteRevision: number;
  readonly view: AutomationProgramDraftView;
}

export function useDraftLoad(automationId: string): {
  readonly load: DraftLoad | null;
  readonly query: UseQueryResult;
} {
  const source = useDraftSyncSource(automationId);
  const { api } = useAutomationsSource();
  const view = source.draft.data;
  const drafted = view?.drafted === true;
  const baseRow = useScreenQuery({
    queryKey: automationKeys.revision(automationId, view?.revision ?? 0),
    queryFn: () => source.revision(view?.revision ?? 0),
    enabled: drafted,
    staleTime: Infinity,
  });
  const { save, discard, publish, revision } = source;
  const ports = useMemo(
    (): SyncPorts => ({
      save,
      discard,
      publish,
      revision,
      latest: async (): Promise<RevisionRow> => {
        const all = await api.listRevisions(automationId);
        return revision(Math.max(...all.map((entry) => entry.revision)));
      },
    }),
    [api, automationId, save, discard, publish, revision],
  );
  if (view === undefined) return { load: null, query: source.draft };
  if (!drafted) {
    const base = { program: view.program, layout: view.layout, revision: view.revision };
    return { load: { ports, base, remoteRevision: view.revision, view }, query: source.draft };
  }
  if (baseRow.data === undefined) return { load: null, query: baseRow };
  const base = {
    program: baseRow.data.definition,
    layout: baseRow.data.layout,
    revision: baseRow.data.revision,
  };
  return { load: { ports, base, remoteRevision: view.revision, view }, query: source.draft };
}

export interface DraftSync {
  readonly model: DraftSyncModel;
  readonly state: SyncState;
}

export function useDraftSync(store: DocumentStore, load: DraftLoad, online: boolean): DraftSync {
  const [model] = useState(() => new DraftSyncModel(store, load.ports, load.base, online));
  useEffect(() => model.attach(), [model]);
  useEffect(() => {
    model.setOnline(online);
  }, [model, online]);
  useEffect(() => {
    background(model.noteRemote(load.remoteRevision), 'automations.note_remote');
  }, [model, load.remoteRevision]);
  return { model, state: useValue(model.state) };
}

export interface Comparisons {
  readonly theirs: UseQueryResult<AutomationProgramComparison>;
  readonly mine: UseQueryResult<AutomationProgramComparison>;
}

export function useComparisons(
  automationId: string,
  base: number,
  theirs: number,
  enabled: boolean,
): Comparisons {
  const { api } = useAutomationsSource();
  return {
    theirs: useScreenQuery({
      queryKey: automationKeys.compare(automationId, base, theirs),
      queryFn: () => api.compareRevisions(automationId, base, theirs),
      enabled,
    }),
    mine: useScreenQuery({
      queryKey: [...automationKeys.compare(automationId, base, 'draft'), theirs],
      queryFn: () => api.compareRevisions(automationId, base, 'draft'),
      enabled,
      staleTime: 0,
    }),
  };
}

export function useDraftChanges(
  automationId: string,
  current: number,
  enabled: boolean,
): UseQueryResult<AutomationProgramComparison> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: [...automationKeys.compare(automationId, current, 'draft'), 'publish'],
    queryFn: () => api.compareRevisions(automationId, current, 'draft'),
    enabled,
    staleTime: 0,
  });
}
