import { useMemo } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Layout } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import type { RevisionRow } from '../../data/api';
import { automationKeys } from '../../data/keys';
import { useAutomationsSource } from '../../data/source';
import { DocumentStore } from '../../model/editor/document-store';

export interface PinnedProgram {
  readonly query: UseQueryResult<RevisionRow>;
  readonly program: Program | null;
  readonly layout: Layout | null;
  readonly store: DocumentStore | null;
}

export function usePinnedProgram(
  pin: { readonly automationId: string; readonly revision: number } | null,
): PinnedProgram {
  const { api } = useAutomationsSource();
  const automationId = pin?.automationId ?? '';
  const revision = pin?.revision ?? 0;
  const query = useScreenQuery({
    queryKey: automationKeys.revision(automationId, revision),
    queryFn: () => api.getRevision(automationId, revision),
    enabled: pin !== null,
    staleTime: Infinity,
  });
  const row = query.data;
  const store = useMemo(
    () => (row === undefined ? null : new DocumentStore(row.definition, row.layout)),
    [row],
  );
  return { query, program: row?.definition ?? null, layout: row?.layout ?? null, store };
}
