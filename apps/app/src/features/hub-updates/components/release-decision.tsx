import type { ReactNode } from 'react';
import {
  API_ENDPOINTS as E,
  type HubUpdateRecoveryResult,
  type HubUpdateRecoveryStatus,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { View } from 'react-native';
import { api } from '../../../api/transport';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { DECISION_COPY, decisionResultLine } from '../model/update-copy';

type Release = NonNullable<HubUpdateRecoveryStatus['release']>;
type Choice = keyof typeof DECISION_COPY;

export const RECOVERY_HOLD_SECONDS = 120;

function ask(choice: Choice, then: () => void): void {
  background(
    confirm(DECISION_COPY[choice]).then((accepted) => {
      if (accepted) then();
    }),
    `hub_update.${choice}_confirm_failed`,
  );
}

function Report({ release }: { readonly release: Release }): ReactNode {
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-start gap-2 rounded-md bg-critical/14 px-3 py-2"
    >
      <Icon name="alert" size={18} tone="critical" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout" selectable className="web:wrap-anywhere">
          {release.reason ?? 'The release stopped without a recorded reason.'}
        </Text>
        {release.failedChecks.map((check) => (
          <Text
            key={check.name}
            variant="footnote"
            tone="variant"
            selectable
            className="web:wrap-anywhere"
          >
            {`${check.name} · ${check.detail}`}
          </Text>
        ))}
        <Text variant="footnote" tone="variant">
          {release.backupKept
            ? 'Nothing was rolled back. The backup of the previous version is kept.'
            : 'Nothing was rolled back. No backup is recorded for this release.'}
        </Text>
      </View>
    </View>
  );
}

type DecisionCall = UseMutationResult<HubUpdateRecoveryResult, Error, string>;

function useDecisionCall(
  call: (runId: string) => Promise<HubUpdateRecoveryResult>,
  refresh: () => Promise<unknown>,
): DecisionCall {
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: call,
    onSettled: async (): Promise<void> => {
      await refresh();
    },
  });
}

function started(call: DecisionCall): boolean {
  return call.isPending || call.data?.status === 'started';
}

function DecisionResult({
  choice,
  call,
}: {
  readonly choice: 'rollback' | 'retry' | 'keep';
  readonly call: DecisionCall;
}): ReactNode {
  if (call.isIdle || call.isPending) return null;
  return (
    <Text
      variant="callout"
      tone={call.data?.status === 'started' ? 'variant' : 'warning'}
      accessibilityLiveRegion="polite"
    >
      {decisionResultLine(choice, call.data)}
    </Text>
  );
}

interface DecisionRowProps {
  readonly release: Release;
  readonly rollback: DecisionCall;
  readonly retry: DecisionCall;
  readonly keep: DecisionCall;
}

function DecisionRow({ release, rollback, retry, keep }: DecisionRowProps): ReactNode {
  const busy = started(rollback) || started(retry) || started(keep);
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Roll back"
        variant="destructive"
        grow
        loading={rollback.isPending}
        disabled={busy || !release.backupKept}
        onPress={(): void => {
          ask('rollback', () => {
            rollback.mutate(release.runId);
          });
        }}
      />
      <Button
        label="Try again"
        variant="tonal"
        grow
        loading={retry.isPending}
        disabled={busy || release.phase === 'unrecoverable'}
        onPress={(): void => {
          ask('retry', () => {
            retry.mutate(release.runId);
          });
        }}
      />
      <Button
        label="Keep"
        variant="outlined"
        grow
        loading={keep.isPending}
        disabled={busy || release.phase === 'unrecoverable'}
        onPress={(): void => {
          ask('keep', () => {
            keep.mutate(release.runId);
          });
        }}
      />
    </View>
  );
}

export function ReleaseDecision({
  release,
  refresh,
}: {
  readonly release: Release;
  readonly refresh: () => Promise<unknown>;
}): ReactNode {
  const rollback = useDecisionCall(
    (runId) => api().call(E.rollbackHubUpdate, { body: { runId } }),
    refresh,
  );
  const retry = useDecisionCall(
    (runId) =>
      api().call(E.recoverHubUpdate, { body: { runId, holdSeconds: RECOVERY_HOLD_SECONDS } }),
    refresh,
  );
  const keep = useDecisionCall(
    (runId) => api().call(E.keepHubUpdate, { body: { runId } }),
    refresh,
  );
  return (
    <View className="gap-3">
      <Report release={release} />
      <DecisionRow release={release} rollback={rollback} retry={retry} keep={keep} />
      {release.phase === 'unrecoverable' ? (
        <Text variant="footnote" tone="variant">
          Restoring the previous version did not finish, so only a roll back can run now.
        </Text>
      ) : null}
      {rollback.isIdle && keep.isIdle ? (
        <DecisionResult choice="retry" call={retry} />
      ) : keep.isIdle ? (
        <DecisionResult choice="rollback" call={rollback} />
      ) : (
        <DecisionResult choice="keep" call={keep} />
      )}
    </View>
  );
}
