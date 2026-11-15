import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveNotification, ProfileRow } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text, type TextVariant } from '../../../components/text';
import { TONE_ROLE } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { relative } from '../../../format/time';
import { ProfileAvatar } from '../../profiles';
import { RequestAnswerButtons } from '../share/requests-section';
import { offerBodyOf } from '../share/transfer-model';
import { TransferAnswerButtons } from './transfer-card';
import {
  KIND_LOOK,
  sentenceOf,
  sentencePartsOf,
  type NotificationContext,
  type RowAction,
} from './notification-model';

export interface NotificationRowProps {
  readonly row: DriveNotification;
  readonly context: NotificationContext;
  readonly actor: ProfileRow | null;
  readonly item: DriveItem | null;
  readonly location: string | null;
  readonly action: RowAction;
  readonly now: number;
  readonly onOpen: (row: DriveNotification, item: DriveItem | null) => void;
}

function Leading({
  row,
  actor,
}: {
  readonly row: DriveNotification;
  readonly actor: ProfileRow | null;
}): ReactNode {
  const look = KIND_LOOK[row.kind];
  return (
    <View className="w-8 items-center">
      {actor === null ? (
        <IconWell icon={look.icon} colour={TONE_ROLE[look.tone]} size="s" />
      ) : (
        <ProfileAvatar profile={actor} />
      )}
    </View>
  );
}

function Action({
  action,
  context,
}: {
  readonly action: RowAction;
  readonly context: NotificationContext;
}): ReactNode {
  if (action.kind === 'answer-request') {
    const { message } = action.request;
    return (
      <View className="gap-2">
        {message === null ? null : (
          <View className="border-l-2 border-outline-variant pl-3">
            <Text variant="footnote" tone="variant">
              {message}
            </Text>
          </View>
        )}
        <RequestAnswerButtons request={action.request} name={context.actor} />
      </View>
    );
  }
  if (action.kind === 'answer-transfer') {
    return (
      <View className="gap-2">
        <Text variant="footnote" tone="variant">
          {offerBodyOf(action.transfer, context.actor)}
        </Text>
        <TransferAnswerButtons transfer={action.transfer} fromName={context.actor} />
      </View>
    );
  }
  return null;
}

function PendingSentence({
  before,
  after,
  variant,
}: {
  readonly before: string;
  readonly after: string;
  readonly variant: TextVariant;
}): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap items-center gap-x-1">
      {before === '' ? null : <Text variant={variant}>{before}</Text>}
      <View className="h-6 justify-center">
        <Skeleton shape="text" className="w-28" />
      </View>
      {after === '' ? null : <Text variant={variant}>{after}</Text>}
    </View>
  );
}

function Sentence({
  row,
  context,
}: {
  readonly row: DriveNotification;
  readonly context: NotificationContext;
}): ReactNode {
  const variant = row.readAt === null ? 'body-strong' : 'body';
  const parts = sentencePartsOf(row, context);
  if (parts.item.kind === 'pending') {
    return (
      <PendingSentence before={parts.before.trim()} after={parts.after.trim()} variant={variant} />
    );
  }
  return (
    <Text aria-hidden variant={variant} numberOfLines={3}>
      {parts.before}
      {parts.item.kind === 'none' ? null : <Text variant={variant}>{parts.item.name}</Text>}
      {parts.after}
    </Text>
  );
}

function Summary({
  row,
  context,
  location,
  now,
}: {
  readonly row: DriveNotification;
  readonly context: NotificationContext;
  readonly location: string | null;
  readonly now: number;
}): ReactNode {
  const unread = row.readAt === null;
  return (
    <>
      <View className="min-w-0 flex-1 gap-1">
        <Sentence row={row} context={context} />
        <View className="flex-row items-center gap-2">
          {location === null ? null : <Badge icon="folder" label={location} />}
          <Text variant="caption" tone="variant" numberOfLines={1} className="shrink-0">
            {relative(row.updatedAt, now)}
          </Text>
        </View>
      </View>
      <View
        aria-hidden
        className={cn('mt-2 size-2.5 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
      />
    </>
  );
}

export function NotificationRow({
  row,
  context,
  actor,
  item,
  location,
  action,
  now,
  onOpen,
}: NotificationRowProps): ReactNode {
  const sentence = sentenceOf(row, context);
  const unread = row.readAt === null ? 'Unread. ' : '';
  const place = location === null ? '' : `, in ${location}`;
  return (
    <View>
      <Interactive
        role="button"
        label={`${unread}${sentence}${place}, ${relative(row.updatedAt, now)}`}
        onPress={() => {
          onOpen(row, item);
        }}
        className="flex-row items-start gap-3 px-card-pad py-3"
      >
        <Leading row={row} actor={actor} />
        <Summary row={row} context={context} location={location} now={now} />
      </Interactive>
      {action.kind === 'none' ? null : (
        <View className="-mt-1 px-card-pad pb-3">
          <View className="pl-11">
            <Action action={action} context={context} />
          </View>
        </View>
      )}
    </View>
  );
}
