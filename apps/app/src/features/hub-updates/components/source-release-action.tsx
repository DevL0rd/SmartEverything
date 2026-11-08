import type { ReactNode } from 'react';
import type {
  HubUpdateAcceptance,
  HubUpdateSourceCheck,
  HubUpdateSourceStart,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { Text } from '../../../components/text';
import { useStartHubUpdateSource } from '../data/update-queries';
import { sourceReleaseRequest, SOURCE_START_REFUSAL } from '../model/update-copy';

function StartMessage({
  result,
  failed,
}: {
  readonly result: HubUpdateAcceptance | undefined;
  readonly failed: boolean;
}): ReactNode {
  if (result === undefined && !failed) return null;
  const started = result?.status === 'started';
  return (
    <Text variant="callout" tone={started ? 'variant' : 'warning'} accessibilityLiveRegion="polite">
      {result?.status === 'refused'
        ? SOURCE_START_REFUSAL[result.refusal]
        : started
          ? 'Release started. Follow it under Latest release.'
          : 'Couldn’t confirm that the release started. Check the latest release or retry this request.'}
    </Text>
  );
}

export interface SavedReleaseChoice {
  readonly branch: string;
  readonly savedRequestId: string;
  readonly requestId: string;
}

type Start = ReturnType<typeof useStartHubUpdateSource>;

interface ReleaseChoice {
  readonly label: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly confirmLabel: string;
  readonly request: HubUpdateSourceStart;
}

function confirmRelease(choice: ReleaseChoice, branch: string, start: Start): void {
  const context = choice.detail === undefined ? branch : `${branch}\n\n${choice.detail}`;
  background(
    confirm({
      title: choice.title,
      body: `${context}\n\nThe hub may restart during the release.`,
      confirmLabel: choice.confirmLabel,
    }).then((accepted) => {
      if (accepted) start.mutate(choice.request);
    }),
    'hub_update.source_release_confirm_failed',
  );
}

function savedChoice(offerId: string, saved: SavedReleaseChoice): ReleaseChoice {
  return {
    label: 'Release without saved changes',
    title: 'Release without your pending changes?',
    detail: `Your changes will remain in your checkout and on ${saved.branch}. This release will use the remote snapshot alone.`,
    confirmLabel: 'Release without changes',
    request: {
      offerId,
      requestId: saved.requestId,
      savedRequestId: saved.savedRequestId,
      includePending: false,
    },
  };
}

function releaseUnavailable(start: Start, attempted: boolean): boolean {
  return start.data?.status === 'started' || (!attempted && (start.isPending || start.isError));
}

function ReleaseButton({
  choice,
  branch,
  start,
  disabled,
  primary = false,
}: {
  readonly choice: ReleaseChoice;
  readonly branch: string;
  readonly start: Start;
  readonly disabled: boolean;
  readonly primary?: boolean;
}): ReactNode {
  const attempted = start.variables?.requestId === choice.request.requestId;
  return (
    <Button
      label={start.isError && attempted ? 'Retry release request' : choice.label}
      variant={primary ? 'filled' : 'tonal'}
      icon="download"
      loading={attempted ? start.isPending : false}
      disabled={disabled || releaseUnavailable(start, attempted)}
      onPress={(): void => {
        confirmRelease(choice, branch, start);
      }}
    />
  );
}

export function SourceReleaseAction({
  offerId,
  source,
  saved,
  disabled,
}: {
  readonly offerId: string;
  readonly source: HubUpdateSourceCheck;
  readonly saved: SavedReleaseChoice | null;
  readonly disabled: boolean;
}): ReactNode {
  const start = useStartHubUpdateSource();
  const request = sourceReleaseRequest(source, offerId);
  const branch = `${source.remote} / ${source.branch}`;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <ReleaseButton
          primary
          branch={branch}
          start={start}
          disabled={disabled}
          choice={{
            label: saved === null ? 'Release remote snapshot' : 'Release with pending changes',
            title: 'Release remote snapshot?',
            detail: request.includePending
              ? 'Your pending changes will be included in the release. Your files and branch will stay as they are.'
              : undefined,
            confirmLabel: request.includePending
              ? 'Include changes and release'
              : 'Release snapshot',
            request,
          }}
        />
        {saved === null ? null : (
          <ReleaseButton
            branch={branch}
            start={start}
            choice={savedChoice(offerId, saved)}
            disabled={disabled}
          />
        )}
      </View>
      <StartMessage result={start.data} failed={start.isError} />
    </View>
  );
}
