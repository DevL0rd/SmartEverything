import type { ReactNode } from 'react';
import {
  API_ENDPOINTS as E,
  type SelfUpdateRecoveryResult,
  type SelfUpdateRecoveryStatus,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useMutation } from '@tanstack/react-query';
import { View } from 'react-native';
import { api } from '../../../api/transport';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { Text } from '../../../components/text';
import { clock, shortDate } from '../../../format/time';
import type { useHubUpdateStatus } from '../data/update-queries';
import { PHASE_LABEL, RECOVERY_REFUSAL } from '../model/update-copy';

type Release = NonNullable<SelfUpdateRecoveryStatus['release']>;
const RECOVERY_HOLD_SECONDS = 120;

function ReleaseSummary({ release }: { readonly release: Release }): ReactNode {
  return (
    <View className="gap-1" accessibilityLiveRegion="polite">
      <Text variant="callout">
        {release.interrupted && release.finishedAt === null
          ? 'Update interrupted'
          : PHASE_LABEL[release.phase]}
      </Text>
      <Text variant="footnote" tone="variant">
        {`Last changed · ${shortDate(release.updatedAt)} at ${clock(release.updatedAt)}`}
      </Text>
    </View>
  );
}

function RecoverButton({
  runId,
  refresh,
}: {
  readonly runId: string;
  readonly refresh: () => Promise<unknown>;
}): ReactNode {
  const recovery = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      api().call(E.recoverHubUpdate, { body: { runId, holdSeconds: RECOVERY_HOLD_SECONDS } }),
    onSettled: async (): Promise<void> => {
      await refresh();
    },
  });
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Recover update"
          variant="tonal"
          loading={recovery.isPending}
          disabled={recovery.data?.status === 'started'}
          onPress={(): void => {
            background(
              confirm({
                title: 'Recover this update?',
                body: 'The hub will check the release and may restart to restore the previous version.',
                confirmLabel: 'Recover update',
              }).then((accepted) => {
                if (accepted) recovery.mutate();
              }),
              'hub_update.recovery_confirm_failed',
            );
          }}
        />
      </View>
      <RecoveryMessage result={recovery.data} failed={recovery.isError} />
    </View>
  );
}

function RecoveryMessage({
  result,
  failed,
}: {
  readonly result: SelfUpdateRecoveryResult | undefined;
  readonly failed: boolean;
}): ReactNode {
  if (result === undefined && !failed) return null;
  const started = result?.status === 'started';
  return (
    <Text variant="callout" tone={started ? 'variant' : 'warning'} accessibilityLiveRegion="polite">
      {result?.status === 'refused'
        ? RECOVERY_REFUSAL[result.refusal]
        : started
          ? 'Recovery started. Refresh status to check the result.'
          : 'Couldn’t start recovery. Check the status before trying again.'}
    </Text>
  );
}

export function RecoveryCard({
  status,
}: {
  readonly status: ReturnType<typeof useHubUpdateStatus>;
}): ReactNode {
  const release = status.data?.release ?? null;
  const recoverable =
    release !== null &&
    ((release.interrupted && release.finishedAt === null) || release.phase === 'unrecoverable');
  return (
    <Card title="Latest release" icon="activity">
      <ReleaseState release={release} loading={status.isPending} failed={status.isError} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Refresh status"
          icon="refresh"
          variant="text"
          loading={status.isFetching}
          onPress={(): void => {
            background(status.refetch(), 'hub_update.status_refresh_failed');
          }}
        />
      </View>
      {!recoverable || status.isError ? null : (
        <RecoverButton key={release.runId} runId={release.runId} refresh={status.refetch} />
      )}
    </Card>
  );
}

function ReleaseState({
  release,
  loading,
  failed,
}: {
  readonly release: Release | null;
  readonly loading: boolean;
  readonly failed: boolean;
}): ReactNode {
  return (
    <>
      {release !== null ? <ReleaseSummary release={release} /> : null}
      {release === null && !failed ? (
        <Text variant="callout" tone="variant">
          {loading ? 'Checking release status…' : 'No releases have been recorded yet.'}
        </Text>
      ) : null}
      {failed ? (
        <Text variant="callout" tone="warning" accessibilityLiveRegion="polite">
          Couldn’t check the release. Refresh status when the hub is connected.
        </Text>
      ) : null}
    </>
  );
}
