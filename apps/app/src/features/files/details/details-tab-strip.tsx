import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { DetailsTabItem } from './details-model';
import { rememberTab } from './tab-memory';

const TAB_FRAME = 'h-11 min-w-11 items-center justify-center rounded-t-sm px-2';

function TabFace({
  tab,
  selected,
  labelled,
}: {
  readonly tab: DetailsTabItem;
  readonly selected: boolean;
  readonly labelled: boolean;
}): ReactNode {
  const tone = selected ? 'primary' : 'variant';
  return (
    <View className="flex-row items-center gap-1.5">
      {labelled ? null : <Icon name={tab.icon} size={18} tone={tone} />}
      {labelled || selected ? (
        <Text variant="caption" tone={tone} numberOfLines={1}>
          {tab.label}
        </Text>
      ) : null}
    </View>
  );
}

function DetailsTab({
  tab,
  selected,
  labelled,
}: {
  readonly tab: DetailsTabItem;
  readonly selected: boolean;
  readonly labelled: boolean;
}): ReactNode {
  return (
    <Interactive
      role="tab"
      label={tab.label}
      selected={selected}
      onPress={() => {
        rememberTab(tab.key);
      }}
      focusInset
      className={cn(TAB_FRAME, 'grow basis-auto')}
    >
      <TabFace tab={tab} selected={selected} labelled={labelled} />
      {selected ? (
        <View className="absolute inset-x-2 bottom-0 h-0.75 rounded-t-full bg-primary" />
      ) : null}
    </Interactive>
  );
}

function widthOf(event: LayoutChangeEvent): number {
  return event.nativeEvent.layout.width;
}

function Measure({
  tabs,
  onNeed,
}: {
  readonly tabs: readonly DetailsTabItem[];
  readonly onNeed: (key: string, width: number) => void;
}): ReactNode {
  return (
    <View aria-hidden pointerEvents="none" className="absolute left-0 top-0 flex-row opacity-0">
      {tabs.map((tab) => (
        <View
          key={tab.key}
          className={cn(TAB_FRAME, 'shrink-0')}
          onLayout={(event) => {
            onNeed(tab.key, widthOf(event));
          }}
        >
          <TabFace tab={tab} selected={false} labelled />
        </View>
      ))}
    </View>
  );
}

function useNeed(tabs: readonly DetailsTabItem[]): {
  readonly need: number | null;
  readonly onNeed: (key: string, width: number) => void;
} {
  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(new Map());
  const known = tabs.flatMap((tab) => {
    const width = widths.get(tab.key);
    return width === undefined ? [] : [width];
  });
  const need = known.length === tabs.length ? known.reduce((sum, width) => sum + width, 0) : null;
  return {
    need,
    onNeed: (key, width): void => {
      setWidths((now) => (now.get(key) === width ? now : new Map(now).set(key, width)));
    },
  };
}

export function DetailsTabStrip({
  label,
  tabs,
  active,
}: {
  readonly label: string;
  readonly tabs: readonly DetailsTabItem[];
  readonly active: string;
}): ReactNode {
  const [room, setRoom] = useState<number | null>(null);
  const { need, onNeed } = useNeed(tabs);
  const labelled = room === null || need === null || need <= room;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className="overflow-hidden border-b border-outline-variant px-2"
    >
      <Measure tabs={tabs} onNeed={onNeed} />
      <View
        className="flex-row"
        onLayout={(event) => {
          setRoom(widthOf(event));
        }}
      >
        {tabs.map((tab) => (
          <DetailsTab key={tab.key} tab={tab} selected={tab.key === active} labelled={labelled} />
        ))}
      </View>
    </View>
  );
}
