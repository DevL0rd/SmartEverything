import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { API_ENDPOINTS as E, type HarnessSkillUpdates } from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { List } from '../../../components/section';
import { ActionRow, SwitchRow } from '../../../components/rows';
import { notify } from '../../../components/toast-store';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { api } from '../../../api/transport';
import { SKILL_UPDATES_KEY } from '../../../queries/extension-keys';

import { ExtensionReadStatus, useMemberBanner } from './query-status';
import { background } from '@smarteverything/logging';

function useUpdateSettings(): ReturnType<typeof useScreenQuery<HarnessSkillUpdates>> {
  const sync = useSyncStatus();
  return useScreenQuery({
    queryKey: SKILL_UPDATES_KEY,
    enabled: sync.status === 'live',
    queryFn: () => api().call(E.readAiHarnessSkillUpdates, {}),
  });
}
export function SkillUpdatesScreen(): ReactNode {
  const owner = useIsOwner();
  const mutation = useMutationState();
  const query = useUpdateSettings();
  const banner = useMemberBanner('change how skills and plugins update');
  return (
    <SettingsFrame page="assistant/skills/updates" {...(banner === undefined ? {} : { banner })}>
      <ExtensionReadStatus
        kind="skill"
        loading={query.isFetching ? query.data === undefined : false}
        error={query.error}
        retry={() => {
          background(query.refetch(), 'query.refetch_failed');
        }}
      />
      <UpdateControls query={query} owner={owner} mutation={mutation} />
    </SettingsFrame>
  );
}
function UpdateControls({
  query,
  owner,
  mutation,
}: {
  readonly query: ReturnType<typeof useUpdateSettings>;
  readonly owner: boolean;
  readonly mutation: ReturnType<typeof useMutationState>;
}): ReactNode {
  const client = useQueryClient();
  const update = useMutationState();
  const sync = useSyncStatus();
  const disabled =
    !owner || sync.status !== 'live' || query.data === undefined || mutation.busy || update.busy;
  return (
    <List inset>
      <SwitchRow
        title="Automatic updates"
        subtitle="Keep approved official skills and plugins up to date."
        value={query.data?.automatic ?? true}
        disabled={disabled}
        onChange={(automatic) => {
          mutation.run(() => api().call(E.replaceAiHarnessSkillUpdates, { body: { automatic } }), {
            failure: 'Automatic updates were not changed',
            onDone: (saved) => {
              client.setQueryData(SKILL_UPDATES_KEY, saved);
            },
          });
        }}
      />
      <ActionRow
        title={update.busy ? 'Updating…' : 'Update now'}
        disabled={disabled}
        onPress={() => {
          update.run(() => api().call(E.updateAiHarnessSkills, {}), {
            failure: 'Skills and plugins could not be updated',
            onDone: (result) => {
              notify({
                message:
                  result.updated === 0
                    ? 'Skills and plugins are up to date'
                    : `${String(result.updated)} ${result.updated === 1 ? 'asset updated' : 'assets updated'}`,
              });
            },
          });
        }}
      />
    </List>
  );
}
