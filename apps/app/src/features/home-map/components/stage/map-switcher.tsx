import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { atLeast, useSizeClass } from '../../../../design/size-class';
import {
  FloorSwitcher,
  SWITCHER_ROW,
  SwitcherLead,
  floorsShown,
  type StageFloors,
} from './stage-chrome';

type OnLayout = ((event: LayoutChangeEvent) => void) | undefined;

export interface StageMap {
  readonly id: string;
  readonly label: string;
  readonly spoken?: string;
}

export interface StageMaps {
  readonly options: readonly StageMap[];
  readonly value: string;
  readonly onChange: (mapId: string) => void;
}

export function mapsShown(maps: StageMaps | undefined): maps is StageMaps {
  return maps !== undefined && maps.options.length > 1;
}

export function placesShown(maps: StageMaps | undefined, floors: StageFloors | undefined): boolean {
  return mapsShown(maps) || floorsShown(floors);
}

const MAP_ROW = cn('border-outline-variant', SWITCHER_ROW);

function currentLabel(maps: StageMaps): string {
  return maps.options.find((map) => map.id === maps.value)?.label ?? '';
}

function MapRow({
  maps,
  onChosen,
  onClose,
}: {
  readonly maps: StageMaps;
  readonly onChosen: () => void;
  readonly onClose: (() => void) | undefined;
}): ReactNode {
  return (
    <View className={MAP_ROW}>
      <SwitcherLead icon="house" text="Map" />
      <View className="min-w-0 shrink">
        <Segmented
          size="control"
          label="Map"
          value={maps.value}
          onChange={(mapId) => {
            onChosen();
            maps.onChange(mapId);
          }}
          options={maps.options.map((map) => ({
            value: map.id,
            label: map.label,
            spoken: map.spoken ?? map.label,
          }))}
        />
      </View>
      {onClose === undefined ? null : (
        <IconButton icon="close" label="Close the map list" size="control" onPress={onClose} />
      )}
    </View>
  );
}

function MapPill({
  maps,
  onOpen,
}: {
  readonly maps: StageMaps;
  readonly onOpen: () => void;
}): ReactNode {
  const label = currentLabel(maps);
  return (
    <Interactive
      role="button"
      label={`Map ${label}. Switch map`}
      expanded={false}
      onPress={onOpen}
      className={cn('min-h-touch-min gap-2 px-3', MAP_ROW)}
      layerClassName="rounded-full"
    >
      <Icon name="house" size={16} tone="primary" />
      <Text variant="label" numberOfLines={1} className="shrink">
        {label}
      </Text>
      <Icon name="chevronDown" size={16} tone="variant" />
    </Interactive>
  );
}

function CompactMapSwitcher({ maps }: { readonly maps: StageMaps }): ReactNode {
  const [open, setOpen] = useState(false);
  const close = (): void => {
    setOpen(false);
  };
  return open ? (
    <MapRow maps={maps} onChosen={close} onClose={close} />
  ) : (
    <MapPill
      maps={maps}
      onOpen={() => {
        setOpen(true);
      }}
    />
  );
}

export function MapSwitcher({ maps }: { readonly maps: StageMaps | undefined }): ReactNode {
  const { width } = useSizeClass();
  if (!mapsShown(maps)) {
    return null;
  }
  if (atLeast(width, 'medium')) {
    return <MapRow maps={maps} onChosen={() => undefined} onClose={undefined} />;
  }
  return <CompactMapSwitcher maps={maps} />;
}

export function PlaceSwitchers({
  maps,
  floors,
  onLayout,
}: {
  readonly maps: StageMaps | undefined;
  readonly floors: StageFloors | undefined;
  readonly onLayout?: OnLayout;
}): ReactNode {
  if (!placesShown(maps, floors)) {
    return null;
  }
  return (
    <View
      pointerEvents="box-none"
      onLayout={onLayout}
      className="mr-auto max-w-full shrink items-start gap-2"
    >
      <MapSwitcher maps={maps} />
      <FloorSwitcher floors={floors} />
    </View>
  );
}
