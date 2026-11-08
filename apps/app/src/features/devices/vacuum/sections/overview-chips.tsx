import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { roomColourOf, useRoomColours } from '../../../../components/house-map/plan/room-colours';
import { renderColourSlot } from '../../../../components/house-map/render-scene';
import type { RoomChip } from '../model/room-selection';

const CHIP_FRAME = 'min-h-touch-min flex-row items-center gap-2 rounded-full border-hairline px-4';

function chipFrame(selected: boolean): string {
  return cn(
    CHIP_FRAME,
    selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
  );
}

function RoomChipView({
  chip,
  colour,
  disabled,
  onPress,
}: {
  readonly chip: RoomChip;
  readonly colour: string | undefined;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  if (disabled && chip.selected) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${chip.label}, in this clean`}
        className={chipFrame(true)}
      >
        <ChipBody chip={chip} colour={colour} />
      </View>
    );
  }
  return (
    <Interactive
      role="checkbox"
      label={chip.label}
      checked={chip.selected}
      disabled={disabled}
      onPress={onPress}
      className={chipFrame(chip.selected)}
      layerClassName="rounded-full"
    >
      <ChipBody chip={chip} colour={colour} />
    </Interactive>
  );
}

function ChipBody({
  chip,
  colour,
}: {
  readonly chip: RoomChip;
  readonly colour: string | undefined;
}): ReactNode {
  const dot = { backgroundColor: colour };
  return (
    <>
      <View style={dot} className="size-3.5 rounded-full border border-on-surface-variant" />
      {chip.order === null ? null : (
        <View className="size-6 items-center justify-center rounded-full bg-primary">
          <Text variant="caption" tone="onPrimary">
            {String(chip.order)}
          </Text>
        </View>
      )}
      <Text variant="label" tone={chip.selected ? 'primary' : 'default'} numberOfLines={1}>
        {chip.name}
      </Text>
      {chip.now ? (
        <Text variant="label" tone="primary">
          Now
        </Text>
      ) : null}
    </>
  );
}

export function RoomChips({
  chips,
  anySelected,
  disabled,
  onToggle,
  onAll,
}: {
  readonly chips: readonly RoomChip[];
  readonly anySelected: boolean;
  readonly disabled: boolean;
  readonly onToggle: (roomId: number) => void;
  readonly onAll: () => void;
}): ReactNode {
  const colours = useRoomColours();
  if (chips.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap gap-2">
      <Interactive
        role="button"
        label="All rooms"
        selected={!anySelected}
        disabled={disabled}
        onPress={onAll}
        className={chipFrame(!anySelected)}
        layerClassName="rounded-full"
      >
        <Text variant="label" tone={anySelected ? 'default' : 'primary'}>
          All rooms
        </Text>
      </Interactive>
      {chips.map((chip) => (
        <RoomChipView
          key={chip.id}
          chip={chip}
          colour={roomColourOf(colours, renderColourSlot(chip.colour))}
          disabled={disabled}
          onPress={() => {
            onToggle(chip.id);
          }}
        />
      ))}
    </View>
  );
}
