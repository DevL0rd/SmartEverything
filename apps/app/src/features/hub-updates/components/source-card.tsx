import { useState, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import type { HubUpdateSourceCheck } from '@smarteverything/domain';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { clock, shortDate } from '../../../format/time';
import type { useHubUpdateSource } from '../data/update-queries';
import { sourceBlockedReason, SOURCE_RELATION_LABEL } from '../model/update-copy';
import { SourceReleaseAction, type SavedReleaseChoice } from './source-release-action';
import { SourceSaveAction } from './source-save-action';

const SHORT_COMMIT_LENGTH = 8;

function SourceSummary({ source }: { readonly source: HubUpdateSourceCheck }): ReactNode {
  const { staged, unstaged, untracked, conflicts } = source.pending;
  const available = source.availableUpdate !== undefined || source.offerId !== undefined;
  const relation =
    source.availableUpdate === 'running_behind'
      ? 'The configured branch is newer than the running hub'
      : SOURCE_RELATION_LABEL[source.relation];
  const blocked = sourceBlockedReason(source);
  return (
    <View className="gap-1">
      <Text variant="callout">{`${source.remote} / ${source.branch}`}</Text>
      <Text
        variant="label"
        tone={available ? 'primary' : 'variant'}
        accessibilityLiveRegion="polite"
      >
        {source.tipIsRunning ? 'This remote snapshot is already running' : relation}
      </Text>
      <Text variant="footnote" tone="variant">
        {`Local ${source.head.slice(0, SHORT_COMMIT_LENGTH)} · Remote ${source.tip.slice(0, SHORT_COMMIT_LENGTH)}`}
      </Text>
      <Text variant="footnote" tone="variant">
        {staged + unstaged + untracked + conflicts === 0
          ? 'No pending changes'
          : `Pending changes · ${String(staged)} staged · ${String(unstaged)} unstaged · ${String(untracked)} untracked`}
      </Text>
      {blocked !== null || conflicts > 0 ? (
        <Text variant="footnote" tone="warning">
          {blocked ?? `Resolve ${String(conflicts)} conflicting files before updating.`}
        </Text>
      ) : null}
    </View>
  );
}

export function SourceCard({
  releaseInProgress,
  check,
}: {
  readonly releaseInProgress: boolean;
  readonly check: ReturnType<typeof useHubUpdateSource>;
}): ReactNode {
  return (
    <Card title="Git source" icon="server">
      {check.data === undefined ? (
        <Text variant="callout" tone="variant">
          Compare the hub’s source with its configured remote branch.
        </Text>
      ) : (
        <>
          <SourceSummary source={check.data} />
          <Text variant="footnote" tone="variant">
            {`Last checked · ${shortDate(check.dataUpdatedAt)} at ${clock(check.dataUpdatedAt)}`}
          </Text>
        </>
      )}
      {check.isError ? (
        <Text variant="callout" tone="warning" accessibilityLiveRegion="polite">
          Couldn’t check the remote branch. Check the hub’s Git source settings and try again.
        </Text>
      ) : null}
      {check.data?.offerId === undefined ? null : (
        <SourceActions
          key={check.data.offerId}
          offerId={check.data.offerId}
          source={check.data}
          disabled={check.isFetching || check.isError}
          releaseInProgress={releaseInProgress}
        />
      )}
    </Card>
  );
}

function SourceActions({
  offerId,
  source,
  disabled,
  releaseInProgress,
}: {
  readonly offerId: string;
  readonly source: HubUpdateSourceCheck;
  readonly disabled: boolean;
  readonly releaseInProgress: boolean;
}): ReactNode {
  const { staged, unstaged, untracked } = source.pending;
  const [saved, setSaved] = useState<SavedReleaseChoice | null>(null);
  return (
    <View className="gap-2">
      <SourceReleaseAction
        offerId={offerId}
        source={source}
        saved={saved}
        disabled={disabled || releaseInProgress}
      />
      {saved === null ? null : (
        <Text variant="callout" accessibilityLiveRegion="polite">
          {`Changes saved to ${saved.branch}. Your current checkout still includes them.`}
        </Text>
      )}
      {saved === null && staged + unstaged + untracked > 0 ? (
        <SourceSaveAction
          offerId={offerId}
          disabled={disabled}
          onSaved={(receipt, savedRequestId) => {
            setSaved({ branch: receipt.branch, savedRequestId, requestId: randomUUID() });
          }}
        />
      ) : null}
    </View>
  );
}
