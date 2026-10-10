import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useContextMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { eventLook } from '../../activity';
import { saveRecording } from '../data/save-clip';
import { recordingTarget, type EventEntry } from '../logic/event-entries';
import { EventThumb } from './event-thumb';
import { subtitleOf } from './event-row';

export interface EventCardProps {
  readonly entry: EventEntry;
  readonly cameraName: string | null;
  readonly thumb: string | null;
  readonly timeZone: string;
  readonly onDelete: () => void;
}

function useCardMenu(entry: EventEntry, onDelete: () => void): readonly MenuItem[] {
  const router = useRouter();
  const target = recordingTarget(entry);
  if (target === null) {
    return [{ label: 'Delete', icon: 'trash', destructive: true, onPress: onDelete }];
  }
  return [
    {
      label: 'Open',
      icon: 'play',
      onPress: (): void => {
        router.navigate(href.clip(entry.deviceId, target));
      },
    },
    {
      label: 'Save clip',
      icon: 'download',
      onPress: (): void => {
        saveRecording(target);
      },
    },
    { label: 'Delete', icon: 'trash', destructive: true, onPress: onDelete },
  ];
}

function PlayGlyph({ shown }: { readonly shown: boolean }): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute inset-x-1 top-1 aspect-video items-center justify-center transition-opacity duration-150',
        shown ? 'opacity-100' : 'opacity-0',
      )}
    >
      <View className="size-12 items-center justify-center rounded-full bg-black/55">
        <Icon name="play" size={24} colour="on-primary" />
      </View>
    </View>
  );
}

export function EventCard(props: EventCardProps): ReactNode {
  const { entry, cameraName, thumb, timeZone } = props;
  const [hovered, setHovered] = useState(false);
  const look = eventLook(entry.kind);
  const target = recordingTarget(entry);
  const menu = useContextMenu(useCardMenu(entry, props.onDelete), cameraName ?? look.label);
  return (
    <View
      className={cn(
        'min-w-0 flex-1 transition-transform duration-150',
        hovered ? '-translate-y-0.5' : 'translate-y-0',
      )}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        role="link"
        label={`${look.label}, ${cameraName ?? ''} ${subtitleOf(entry, timeZone)}`}
        {...(target === null ? { disabled: true } : { href: href.clip(entry.deviceId, target) })}
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        className={cn('gap-2 rounded-lg p-1', hovered && 'elevation-2')}
      >
        <EventThumb uri={thumb} kind={entry.kind} clipMs={entry.clipMs} fill />
        <PlayGlyph shown={hovered ? target !== null : false} />
        <View className="gap-0.5 px-1">
          <Text variant="body-strong" numberOfLines={1}>
            {cameraName ?? look.label}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {subtitleOf(entry, timeZone)}
          </Text>
        </View>
      </Interactive>
      {menu.host}
    </View>
  );
}
