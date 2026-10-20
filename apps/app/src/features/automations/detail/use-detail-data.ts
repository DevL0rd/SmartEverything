import { useMemo } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AutomationProgramComparison,
  AutomationRowV3,
  FunctionLookup,
  NodeKind,
} from '@smarteverything/domain';
import type { Manifest } from '@smarteverything/flow/compile/manifest';
import { background, Logger } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { automationKeys } from '../data/keys';
import { useAutomationsSource } from '../data/source';
import { manifestFor, type KindOf } from './detail-model';

const log = new Logger('app.automations');

export function useKindOf(): KindOf {
  const { kinds } = useAutomationsSource();
  return useMemo(() => {
    const byId = new Map<string, NodeKind>(kinds.map((kind) => [kind.id, kind]));
    return (id: string): NodeKind | undefined => byId.get(id);
  }, [kinds]);
}

export function useManifest(row: AutomationRowV3, functions: FunctionLookup): Manifest | null {
  const kindOf = useKindOf();
  return useMemo(
    () => manifestFor(row.definition, kindOf, functions),
    [row.definition, kindOf, functions],
  );
}

export function useComparison(
  automationId: string,
  from: number,
  to: number,
  enabled: boolean,
): UseQueryResult<AutomationProgramComparison> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.compare(automationId, from, to),
    queryFn: () => api.compareRevisions(automationId, from, to),
    enabled,
  });
}

export type RestoreVersion = (revision: number) => void;

export function useRestoreVersion(row: AutomationRowV3): RestoreVersion {
  const { api } = useAutomationsSource();
  const client = useQueryClient();
  return useMemo(() => {
    const restore = async (revision: number): Promise<void> => {
      const accepted = await confirm({
        title: `Restore version ${String(revision)} as your draft?`,
        body:
          row.draft === null
            ? 'The live version stays as it is until you publish.'
            : 'Your current draft is replaced. The live version stays as it is until you publish.',
        confirmLabel: 'Restore as draft',
      });
      if (!accepted) return;
      try {
        const source = await api.getRevision(row.id, revision);
        await api.saveDraft(row.id, {
          program: source.definition,
          layout: source.layout,
          expectedRevision: row.revision,
        });
        await client.invalidateQueries({ queryKey: automationKeys.draft(row.id) });
        notify({ message: `Version ${String(revision)} is now your draft`, tone: 'positive' });
      } catch (error) {
        log.error('automations.restore_failed', error, { revision });
        notify({ message: 'The version wasn’t restored', tone: 'critical', error });
      }
    };
    return (revision) => {
      background(restore(revision), 'automations.restore_failed');
    };
  }, [api, client, row.id, row.revision, row.draft]);
}
