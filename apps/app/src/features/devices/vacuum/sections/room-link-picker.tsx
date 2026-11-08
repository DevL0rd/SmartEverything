import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { VacuumHomeRoom } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { DialogFrame } from '../../../../components/dialog-frame';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { roomIconOf } from '../../../../components/room-icon';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { atLeast, useSizeClass } from '../../../../design/size-class';
import { holderLine, type LinkChoices, type PickerRow } from '../model/room-links';

export type LinkChoice =
  | { readonly kind: 'room'; readonly row: PickerRow }
  | { readonly kind: 'suggestion'; readonly room: VacuumHomeRoom }
  | { readonly kind: 'create' }
  | { readonly kind: 'unlink' };

interface ChoiceRowProps {
  readonly icon: IconName;
  readonly title: string;
  readonly line: string | null;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
  readonly dim?: boolean;
  readonly className?: string;
  readonly trailing?: ReactNode;
}

function ChoiceRow(props: ChoiceRowProps): ReactNode {
  const { icon, title, line, label, onPress, selected = false, dim = false, className } = props;
  return (
    <Interactive
      role="button"
      label={label}
      selected={selected}
      onPress={onPress}
      className={cn('min-h-touch-min flex-row items-center gap-3 px-2 py-2', className)}
      layerClassName="rounded-md"
    >
      <View
        className={cn(
          'size-10 items-center justify-center rounded-md bg-surface-2',
          dim && 'opacity-60',
        )}
      >
        <Icon name={icon} size={20} tone="variant" />
      </View>
      <View className={cn('min-w-0 flex-1 gap-0.5', dim && 'opacity-60')}>
        <Text variant="body-strong" numberOfLines={2}>
          {title}
        </Text>
        {line === null ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {line}
          </Text>
        )}
      </View>
      {props.trailing}
    </Interactive>
  );
}

function HomeRoomRow({
  row,
  onChoose,
}: {
  readonly row: PickerRow;
  readonly onChoose: () => void;
}): ReactNode {
  const holder = row.usedBy;
  const name = row.room.name;
  const label =
    holder === null
      ? `${name}${row.current ? ', linked now' : ''}`
      : `${name}, ${holderLine(name, holder).toLowerCase()}. Move`;
  const trailing =
    holder === null ? (
      row.current ? (
        <Icon name="check" size={20} tone="primary" />
      ) : null
    ) : (
      <Text variant="label" tone="primary">
        Move
      </Text>
    );
  return (
    <ChoiceRow
      icon={roomIconOf(name)}
      title={name}
      line={holder === null ? null : holderLine(name, holder)}
      label={label}
      selected={row.current}
      dim={holder !== null}
      trailing={trailing}
      onPress={onChoose}
    />
  );
}

function Suggestion({
  room,
  onChoose,
}: {
  readonly room: VacuumHomeRoom;
  readonly onChoose: () => void;
}): ReactNode {
  return (
    <ChoiceRow
      icon="sparkles"
      title={room.name}
      line="Suggested by name. Tap to link"
      label={`Link to the suggested room ${room.name}`}
      className="rounded-md border-hairline border-dashed border-primary"
      trailing={<Icon name="link" size={20} tone="primary" />}
      onPress={onChoose}
    />
  );
}

function ChoiceList({
  choices,
  onChoose,
}: {
  readonly choices: LinkChoices;
  readonly onChoose: (choice: LinkChoice) => void;
}): ReactNode {
  const { room, suggestion, rows } = choices;
  const pick =
    (choice: LinkChoice): (() => void) =>
    (): void => {
      onChoose(choice);
    };
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" className="pb-2">
        The map room takes the name of the home room you pick.
      </Text>
      {suggestion === null ? null : (
        <Suggestion room={suggestion} onChoose={pick({ kind: 'suggestion', room: suggestion })} />
      )}
      {rows.map((row) => (
        <HomeRoomRow key={row.room.id} row={row} onChoose={pick({ kind: 'room', row })} />
      ))}
      <ChoiceRow
        icon="plus"
        title={`Create room “${room.mapRoomName}”`}
        line="Adds it to your home with the robot’s name"
        label={`Create room ${room.mapRoomName}`}
        className="border-t border-outline-variant"
        onPress={pick({ kind: 'create' })}
      />
      {room.homeRoom === null ? null : (
        <ChoiceRow
          icon="unlink"
          title="Unlink"
          line={`Back to the robot’s name “${room.mapRoomName}”`}
          label={`Unlink ${room.mapRoomName} from ${room.homeRoom.name}`}
          onPress={pick({ kind: 'unlink' })}
        />
      )}
    </View>
  );
}

function NoHomeRooms({
  name,
  onCreate,
}: {
  readonly name: string;
  readonly onCreate: () => void;
}): ReactNode {
  return (
    <View className="items-center gap-3 px-2 py-4">
      <Icon name="home" size={32} tone="variant" />
      <Text variant="title-3" align="center">
        No rooms in your home yet
      </Text>
      <Text variant="footnote" tone="variant" align="center" className="max-w-reading">
        Create the first one here. Rooms are shared by all your devices.
      </Text>
      <Button label={`Create room “${name}”`} icon="plus" size="lg" grow onPress={onCreate} />
    </View>
  );
}

export function RoomLinkPicker({
  choices,
  hasHomeRooms,
  onChoose,
  onClose,
}: {
  readonly choices: LinkChoices | null;
  readonly hasHomeRooms: boolean;
  readonly onChoose: (choices: LinkChoices, choice: LinkChoice) => void;
  readonly onClose: () => void;
}): ReactNode {
  const { width } = useSizeClass();
  const title = choices === null ? 'Home room' : `Home room for “${choices.room.mapRoomName}”`;
  const choose = (choice: LinkChoice): void => {
    if (choices !== null) {
      onChoose(choices, choice);
    }
  };
  const body =
    choices === null ? null : hasHomeRooms ? (
      <ChoiceList choices={choices} onChoose={choose} />
    ) : (
      <NoHomeRooms
        name={choices.room.mapRoomName}
        onCreate={() => {
          choose({ kind: 'create' });
        }}
      />
    );
  if (atLeast(width, 'medium')) {
    return (
      <DialogFrame
        open={choices !== null}
        onClose={onClose}
        label={title}
        title={title}
        kind="inspector"
      >
        {body}
      </DialogFrame>
    );
  }
  return (
    <Sheet open={choices !== null} onClose={onClose} title={title} detents={['half', 'full']}>
      {body}
    </Sheet>
  );
}
