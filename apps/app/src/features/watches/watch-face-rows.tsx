import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { WatchFace } from '@smarteverything/domain';
import { cn } from '../../design/cn';
import { Grid } from '../../components/grid';
import { Icon } from '../../components/icon';
import { IconWell } from '../../components/icon-well';
import { Interactive } from '../../components/interactive';
import { ListRow } from '../../components/list-row';
import { useContextMenu } from '../../components/menu';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import type { WatchCommand } from './watch-config';

const FOOTER =
  'New faces and firmware updates come from Mi Fitness. Turn on Pause for Mi Fitness first.';

function useFaceMenu(face: WatchFace, command: WatchCommand): ReturnType<typeof useContextMenu> {
  return useContextMenu(
    face.removable && !face.active
      ? [
          {
            label: 'Remove from the watch',
            icon: 'trash',
            destructive: true,
            onPress: (): void => {
              command.run({ type: 'delete_watch_face', id: face.id });
            },
          },
        ]
      : [],
  );
}

function FaceCard({
  face,
  command,
}: {
  readonly face: WatchFace;
  readonly command: WatchCommand;
}): ReactNode {
  const menu = useFaceMenu(face, command);
  return (
    <Interactive
      onPress={() => {
        if (!face.active) {
          command.run({ type: 'set_watch_face', id: face.id });
        }
      }}
      onLongPress={menu.onLongPress}
      onContextMenu={menu.onContextMenu}
      disabled={command.busy}
      selected={face.active}
      checked={face.active}
      label={face.name}
      className={cn(
        'items-center gap-2 rounded-lg px-2 py-3',
        face.active
          ? 'border border-primary bg-primary-container'
          : 'border-hairline border-outline-variant bg-surface-1',
      )}
    >
      <IconWell icon="watch" colour={face.active ? 'primary' : 'on-surface-variant'} size="l" />
      <Text variant="footnote" align="center" numberOfLines={2}>
        {face.name}
      </Text>
      {face.active ? (
        <View className="flex-row items-center gap-1">
          <Icon name="check" size={16} tone="primary" />
          <Text variant="caption" tone="primary">
            On now
          </Text>
        </View>
      ) : null}
      {menu.host}
    </Interactive>
  );
}

function FaceGrid({
  faces,
  command,
  onClose,
}: {
  readonly faces: readonly WatchFace[];
  readonly command: WatchCommand;
  readonly onClose: () => void;
}): ReactNode {
  const ordered = [...faces.filter((face) => face.active), ...faces.filter((face) => !face.active)];
  return (
    <Sheet open onClose={onClose} title="Watch face" wide>
      <View className="gap-4 pb-4">
        <Grid minItemWidth={104} gap="tight">
          {ordered.map((face) => (
            <FaceCard key={face.id} face={face} command={command} />
          ))}
        </Grid>
        <Text variant="footnote" tone="variant">
          {FOOTER}
        </Text>
      </View>
    </Sheet>
  );
}

export function WatchFaces({
  faces,
  command,
}: {
  readonly faces: readonly WatchFace[];
  readonly command: WatchCommand;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (faces.length === 0) {
    return null;
  }
  const current = faces.find((face) => face.active);
  return (
    <>
      <List inset>
        <ListRow
          title="Watch face"
          icon="watch"
          {...(current === undefined ? {} : { value: current.name })}
          chevron
          onPress={() => {
            setOpen(true);
          }}
        />
      </List>
      {open ? (
        <FaceGrid
          faces={faces}
          command={command}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
