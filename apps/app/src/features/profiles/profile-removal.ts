import type { UseMutationOptions } from '@tanstack/react-query';
import type { ProfileRow } from '@smarteverything/domain';
import { deleteProfile } from '../../api/people';
import { notify } from '../../components/toast-store';

export function profileRemovalOptions(
  profile: Pick<ProfileRow, 'id' | 'name'>,
  removed: () => void,
): UseMutationOptions {
  return {
    mutationFn: (): Promise<unknown> => deleteProfile(profile.id),
    onSuccess: (): void => {
      removed();
    },
    onError: (error): void => {
      notify({ message: `${profile.name} was not removed`, error, tone: 'critical' });
    },
  };
}
