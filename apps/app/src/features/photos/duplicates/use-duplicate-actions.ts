import { useQueryClient } from '@tanstack/react-query';
import type { DuplicateKeepBest, DuplicateStats } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { keepBestDuplicates, markNotDuplicates } from '../../../api/photos';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { photoKeys } from '../data';
import { keepAllConfirmOf, keptLabelOf } from './model';

export interface DuplicateActions {
  readonly busy: boolean;
  readonly keepBest: (sha256: string) => void;
  readonly keepBestInAll: (stats: DuplicateStats) => void;
  readonly notDuplicates: (sha256: string) => void;
}

export function useDuplicateActions(): DuplicateActions {
  const client = useQueryClient();
  const mutation = useMutationState();
  const refresh = (): void => {
    background(
      client.invalidateQueries({ queryKey: photoKeys.duplicates() }),
      'queries.invalidate_failed',
    );
    background(
      client.invalidateQueries({ queryKey: photoKeys.duplicateStats() }),
      'queries.invalidate_failed',
    );
  };
  const keep = (body: DuplicateKeepBest): void => {
    mutation.run(() => keepBestDuplicates(body), {
      failure: 'The copies were not moved',
      label: body.scope === 'all' ? 'duplicates.keep_all' : 'duplicates.keep_group',
      onDone: (result) => {
        refresh();
        notify({ message: keptLabelOf(result), tone: 'positive' });
      },
    });
  };
  return {
    busy: mutation.busy,
    keepBest: (sha256): void => {
      keep({ scope: 'groups', sha256s: [sha256] });
    },
    keepBestInAll: (stats): void => {
      background(
        confirm(keepAllConfirmOf(stats)).then((accepted) => {
          if (accepted) keep({ scope: 'all' });
        }),
        'duplicates.confirm_failed',
      );
    },
    notDuplicates: (sha256): void => {
      mutation.run(() => markNotDuplicates([sha256]), {
        failure: 'The group was not hidden',
        label: 'duplicates.not_duplicates',
        onDone: refresh,
      });
    },
  };
}
