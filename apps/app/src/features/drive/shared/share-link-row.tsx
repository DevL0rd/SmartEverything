import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot, DriveShare, ProfileRow } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { joinParts } from '../../../format/text';
import { useDriveItem } from '../../nas/data';
import {
  LOADING_ITEM,
  MISSING_ITEM,
  accessLabelOf,
  endedLabelOf,
  linkEndLabel,
  linkItemOf,
  opensLabelOf,
  personLabelOf,
  linkSubtitleOf,
  type GroupEdge,
  type LinkDensity,
  type LinkItem,
} from './shared-model';

export interface LinkRowContext {
  readonly roots: readonly DriveRoot[];
  readonly profiles: readonly ProfileRow[];
  readonly viewerId: string | null;
  readonly now: number;
  readonly live: boolean;
  readonly density: LinkDensity;
  readonly onRevoke: (share: DriveShare, title: string) => void;
}

const EDGE: Readonly<Record<GroupEdge, string>> = {
  only: 'rounded-lg border-y',
  first: 'rounded-t-lg border-t',
  middle: 'border-t',
  last: 'rounded-b-lg border-y',
};

export function GroupFrame({
  edge,
  children,
}: {
  readonly edge: GroupEdge;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn('overflow-hidden border-x border-outline-variant bg-surface-1', EDGE[edge])}
    >
      {children}
    </View>
  );
}

function useLinkItem(itemId: string, roots: readonly DriveRoot[]): LinkItem {
  const query = useDriveItem(itemId, null);
  if (query.data !== undefined) return linkItemOf(query.data, roots);
  return query.isError ? MISSING_ITEM : LOADING_ITEM;
}

function Column({
  width,
  text,
  end,
}: {
  readonly width: string;
  readonly text: string;
  readonly end?: boolean;
}): ReactNode {
  return (
    <View className={cn('shrink-0', width)}>
      <Text
        variant="callout"
        tone="variant"
        numberOfLines={1}
        align={end === true ? 'end' : 'start'}
        className="tabular"
      >
        {text}
      </Text>
    </View>
  );
}

function WideTrailing({
  share,
  by,
  title,
  context,
}: {
  readonly share: DriveShare;
  readonly by: string;
  readonly title: string;
  readonly context: LinkRowContext;
}): ReactNode {
  const wide = context.density === 'wide';
  return (
    <View className="flex-row items-center gap-4">
      {share.hasPassword ? <Icon name="lock" size={16} tone="variant" /> : null}
      <View className="w-36 shrink-0">
        <Badge label={accessLabelOf(share.permission)} />
      </View>
      <Column width="w-40" text={opensLabelOf(share)} end />
      {wide ? <Column width="w-28" text={by} /> : null}
      {wide ? <Column width="w-36" text={linkEndLabel(share, context.now)} /> : null}
      <Button
        label="Revoke"
        spoken={`Revoke the link to ${title}`}
        variant="destructive"
        disabled={!context.live}
        onPress={() => {
          context.onRevoke(share, title);
        }}
      />
    </View>
  );
}

function RowTrailing({
  share,
  by,
  title,
  context,
}: {
  readonly share: DriveShare;
  readonly by: string;
  readonly title: string;
  readonly context: LinkRowContext;
}): ReactNode {
  if (context.density !== 'compact') {
    return <WideTrailing share={share} by={by} title={title} context={context} />;
  }
  return (
    <IconButton
      icon="unlink"
      label={`Revoke the link to ${title}`}
      tone="critical"
      disabled={!context.live}
      onPress={() => {
        context.onRevoke(share, title);
      }}
    />
  );
}

export function ShareLinkRow({
  share,
  edge,
  context,
}: {
  readonly share: DriveShare;
  readonly edge: GroupEdge;
  readonly context: LinkRowContext;
}): ReactNode {
  const item = useLinkItem(share.itemId, context.roots);
  const by = personLabelOf(share.createdBy, context.viewerId, context.profiles);
  const end = linkEndLabel(share, context.now);
  const subtitle = linkSubtitleOf(share, { by, end, place: item.place }, context.density);
  return (
    <GroupFrame edge={edge}>
      <ListRow
        title={item.title}
        icon={item.icon}
        {...(subtitle === undefined ? {} : { subtitle })}
        contextMenu={[
          {
            label: 'Revoke link',
            icon: 'unlink',
            destructive: true,
            disabled: !context.live,
            onPress: (): void => {
              context.onRevoke(share, item.title);
            },
          },
        ]}
        trailing={<RowTrailing share={share} by={by} title={item.title} context={context} />}
      />
    </GroupFrame>
  );
}

export function EndedLinkRow({
  share,
  edge,
  context,
}: {
  readonly share: DriveShare;
  readonly edge: GroupEdge;
  readonly context: LinkRowContext;
}): ReactNode {
  const item = useLinkItem(share.itemId, context.roots);
  const by = personLabelOf(share.createdBy, context.viewerId, context.profiles);
  return (
    <GroupFrame edge={edge}>
      <ListRow
        title={item.title}
        icon={item.icon}
        iconTone="faint"
        subtitle={joinParts([opensLabelOf(share), endedLabelOf(share), `by ${by}`])}
      />
    </GroupFrame>
  );
}
