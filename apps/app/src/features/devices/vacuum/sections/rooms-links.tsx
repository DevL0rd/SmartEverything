import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { VacuumMapRoomLink, VacuumStaleRoomLink } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { EDITOR_PATH } from '../../../home-map';
import { LinkCount } from '../components/link-badge';
import { useRoomLinksSummary } from '../data/room-links-value';
import { linkFieldOf, linkNoticeOf } from '../model/room-links';
import { ROBOT_REACH } from '../model/unified-map';

export function RoomsLinkNotice({ deviceId }: { readonly deviceId: string }): ReactNode {
  const notice = linkNoticeOf(useRoomLinksSummary(deviceId));
  if (notice === null) {
    return null;
  }
  return (
    <View
      accessibilityRole="alert"
      className="gap-2 rounded-lg border-hairline border-warning/40 bg-warning/14 p-3"
    >
      <View className="flex-row items-center gap-3">
        <LinkCount notice={notice} />
        <Text variant="body-strong" className="min-w-0 flex-1">
          {notice.title}
        </Text>
      </View>
      <Text variant="footnote">
        Pick the home room of each room below. The room then shows its home name everywhere, on the
        home map too.
      </Text>
    </View>
  );
}

export function RoomsLinkFooter({ deviceId }: { readonly deviceId: string }): ReactNode {
  const summary = useRoomLinksSummary(deviceId);
  if (summary === null || summary.linked === 0 || linkNoticeOf(summary) !== null) {
    return null;
  }
  const text =
    summary.linked === 1
      ? 'The room is linked to your home.'
      : `All ${String(summary.linked)} rooms are linked to your home.`;
  return (
    <View className="min-h-touch-min flex-row items-center gap-3 border-t border-outline-variant pt-2">
      <Icon name="check" size={20} tone="positive" />
      <Text variant="footnote" className="min-w-0 flex-1">
        {text}
      </Text>
    </View>
  );
}

export function RoomLinkField({
  link,
  hasHomeRooms,
  disabled,
  onPress,
}: {
  readonly link: VacuumMapRoomLink;
  readonly hasHomeRooms: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const field = linkFieldOf(link, hasHomeRooms);
  return (
    <Interactive
      role="button"
      label={field.label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 rounded-md border-hairline px-3',
        field.linked ? 'border-outline-variant' : 'border-warning/40 bg-warning/14',
      )}
      layerClassName="rounded-md"
    >
      <Icon name={field.icon} size={20} tone={field.linked ? 'primary' : 'warning'} />
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {field.text}
      </Text>
      <Icon name="chevronDown" size={20} tone="variant" />
    </Interactive>
  );
}

export function RoomLinksUnread({ onRetry }: { readonly onRetry: () => void }): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <Icon name="alert" size={20} tone="warning" />
      <Text variant="footnote" className="min-w-0 flex-1">
        The home rooms of the map did not load.
      </Text>
      <Button label="Try again" variant="text" size="lg" onPress={onRetry} />
    </View>
  );
}

function StaleRow({
  link,
  busy,
  onRemove,
}: {
  readonly link: VacuumStaleRoomLink;
  readonly busy: boolean;
  readonly onRemove: (link: VacuumStaleRoomLink) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3 rounded-lg border-hairline border-dashed border-outline p-3">
      <Icon name="unlink" size={20} tone="variant" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {`${link.mapRoomName} · ${link.homeRoom.name}`}
        </Text>
        <Text variant="footnote" tone="variant">
          No longer on the robot’s map. The link is kept in case it comes back.
        </Text>
      </View>
      <Button
        label="Remove"
        spoken={`Remove the link of ${link.mapRoomName} to ${link.homeRoom.name}`}
        icon="trash"
        variant="tonal"
        size="lg"
        disabled={busy}
        onPress={() => {
          onRemove(link);
        }}
      />
    </View>
  );
}

export function StaleLinks({
  stale,
  busy,
  onRemove,
}: {
  readonly stale: readonly VacuumStaleRoomLink[];
  readonly busy: boolean;
  readonly onRemove: (link: VacuumStaleRoomLink) => void;
}): ReactNode {
  if (stale.length === 0) {
    return null;
  }
  return (
    <View className="gap-2">
      <Text variant="label" tone="variant" accessibilityRole="header">
        Not on the map any more
      </Text>
      {stale.map((link) => (
        <StaleRow key={String(link.mapRoomId)} link={link} busy={busy} onRemove={onRemove} />
      ))}
    </View>
  );
}

interface ReachGroup {
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly tone: 'positive' | 'primary' | 'variant';
  readonly items: readonly string[];
}

export const REACH_GROUPS: readonly ReachGroup[] = [
  {
    key: 'sends',
    title: 'Reaches the robot',
    icon: 'circleCheck',
    tone: 'positive',
    items: ROBOT_REACH.sends,
  },
  {
    key: 'hub',
    title: 'Stays on the hub',
    icon: 'server',
    tone: 'primary',
    items: ROBOT_REACH.hub,
  },
  {
    key: 'never',
    title: 'Never sent to the robot',
    icon: 'ban',
    tone: 'variant',
    items: ROBOT_REACH.never,
  },
];

function ReachRow({ group }: { readonly group: ReachGroup }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${group.title}: ${group.items.join(', ')}`}
      className="flex-row items-start gap-3"
    >
      <View className="size-8 items-center justify-center rounded-md bg-surface-2">
        <Icon name={group.icon} size={20} tone={group.tone} />
      </View>
      <View className="min-w-0 flex-1 gap-1.5">
        <Text variant="label" tone="variant">
          {group.title}
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          {group.items.map((item) => (
            <View key={item} className="rounded-full bg-surface-2 px-2.5 py-1">
              <Text variant="caption">{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function RobotReach({ floorName }: { readonly floorName: string }): ReactNode {
  return (
    <View className="gap-3 border-t border-outline-variant pt-3">
      <View className="flex-row items-center gap-3">
        <Icon name="house" size={20} tone="primary" />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" accessibilityRole="header">
            On your home map
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {`The robot’s rooms are drawn on ${floorName}`}
          </Text>
        </View>
        <Button
          label="Edit"
          spoken="Edit the home map"
          icon="pencil"
          variant="tonal"
          size="lg"
          href={EDITOR_PATH}
        />
      </View>
      {REACH_GROUPS.map((group) => (
        <ReachRow key={group.key} group={group} />
      ))}
    </View>
  );
}
