import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAccessRequest, ProfileRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { useAccessAnswer, useDriveAccessRequestRows, useViewerId } from '../data';
import { ProfileAvatar } from '../../profiles';
import {
  DECLINE,
  approvalOf,
  pendingRequestsFor,
  requestsTitleOf,
  wantsLineOf,
} from '../requests/access-model';
import { SectionTitle } from './people-section';

export function RequestAnswerButtons({
  request,
  name,
}: {
  readonly request: DriveAccessRequest;
  readonly name: string;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  const answer = useAccessAnswer();
  return (
    <View className="gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label="Approve"
          spoken={`Approve ${name}`}
          icon="check"
          loading={answer.busy}
          disabled={!live}
          onPress={() => {
            answer.run(request.id, approvalOf(request));
          }}
        />
        <Button
          label="Decline"
          spoken={`Decline ${name}`}
          variant="text"
          disabled={!live || answer.busy}
          onPress={() => {
            answer.run(request.id, DECLINE);
          }}
        />
      </View>
      {answer.problem === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {answer.problem}
        </Text>
      )}
    </View>
  );
}

export function RequestCard({
  request,
  requester,
}: {
  readonly request: DriveAccessRequest;
  readonly requester: ProfileRow | null;
}): ReactNode {
  const now = useMinute();
  const name = requester?.name ?? 'A former member';
  return (
    <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-2 p-3">
      <View className="flex-row items-center gap-3">
        {requester === null ? null : <ProfileAvatar profile={requester} />}
        <View className="min-w-0 flex-1">
          <Text variant="callout" numberOfLines={2}>
            {wantsLineOf(request, name)}
          </Text>
          <Text variant="caption" tone="variant">
            {relative(request.createdAt, now)}
          </Text>
        </View>
      </View>
      {request.message === null ? null : (
        <Text variant="footnote" tone="variant">
          {`“${request.message}”`}
        </Text>
      )}
      <RequestAnswerButtons request={request} name={name} />
    </View>
  );
}

export function RequestsSection({ itemId }: { readonly itemId: string }): ReactNode {
  const rows = useDriveAccessRequestRows();
  const profiles = useProfiles();
  const viewerId = useViewerId();
  const pending = pendingRequestsFor(rows, itemId, viewerId);
  if (pending.length === 0) return null;
  return (
    <View className="gap-2">
      <SectionTitle text={requestsTitleOf(pending.length)} />
      <View role="list" aria-label="Access requests" className="gap-2">
        {pending.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            requester={
              profiles.find((profile) => profile.id === request.requesterProfileId) ?? null
            }
          />
        ))}
      </View>
    </View>
  );
}
