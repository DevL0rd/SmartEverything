import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveNotification, ProfileRow } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { TONE_ROLE } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { relative } from '../../../format/time';
import { ProfileAvatar } from '../../profiles';
import { RequestAnswerButtons } from '../share/requests-section';
import { TransferAnswerButtons } from './transfer-card';
import {
  KIND_LOOK,
  sentenceOf,
  type NotificationContext,
  type RowAction,
} from './notification-model';

export interface NotificationRowProps {
  readonly row: DriveNotification;
  readonly context: NotificationContext;
  readonly actor: ProfileRow | null;
  readonly item: DriveItem | null;
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
  if (actor === null) return <IconWell icon={look.icon} colour={TONE_ROLE[look.tone]} size="m" />;
  return <ProfileAvatar profile={actor} />;
}

function Action({
  action,
  context,
}: {
  readonly action: RowAction;
  readonly context: NotificationContext;
}): ReactNode {
  if (action.kind === 'answer-request') {
    return <RequestAnswerButtons request={action.request} name={context.actor} />;
  }
  if (action.kind === 'answer-transfer') {
    return <TransferAnswerButtons transfer={action.transfer} fromName={context.actor} />;
  }
  return null;
}

function Summary({
  row,
  sentence,
  name,
  folder,
  now,
}: {
  readonly row: DriveNotification;
  readonly sentence: string;
  readonly name: string | null;
  readonly folder: boolean;
  readonly now: number;
}): ReactNode {
  const unread = row.readAt === null;
  return (
    <>
      <View className="min-w-0 flex-1 gap-1">
        <Text variant={unread ? 'body-strong' : 'body'} numberOfLines={3}>
          {sentence}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          {name === null ? null : <Badge icon={folder ? 'folder' : 'fileText'} label={name} />}
          <Text variant="caption" tone="variant">
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
  action,
  now,
  onOpen,
}: NotificationRowProps): ReactNode {
  const sentence = sentenceOf(row, context);
  const unread = row.readAt === null ? 'Unread. ' : '';
  return (
    <View className="gap-2 px-card-pad py-3">
      <Interactive
        role="button"
        label={`${unread}${sentence}, ${relative(row.updatedAt, now)}`}
        onPress={() => {
          onOpen(row, item);
        }}
        className="flex-row items-start gap-3 rounded-md"
      >
        <Leading row={row} actor={actor} />
        <Summary
          row={row}
          sentence={sentence}
          name={context.item ?? item?.name ?? null}
          folder={item?.kind === 'folder'}
          now={now}
        />
      </Interactive>
      {action.kind === 'none' ? null : (
        <View className="pl-11">
          <Action action={action} context={context} />
        </View>
      )}
    </View>
  );
}
