import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { FlatChoice } from '../../../components/flat-choice';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { FileCrumb, FileLocation, FilePlace } from '../source/types';
import { placeIconOf } from './picker-model';

function Crumb({
  crumb,
  last,
  onGo,
}: {
  readonly crumb: FileCrumb;
  readonly last: boolean;
  readonly onGo: (location: FileLocation) => void;
}): ReactNode {
  return (
    <Interactive
      label={`Go to ${crumb.label}`}
      onPress={() => {
        onGo(crumb.location);
      }}
      className="min-h-touch-min justify-center rounded-sm px-1.5"
    >
      <Text
        variant="callout"
        tone={last ? 'default' : 'variant'}
        className={last ? 'font-sans-semibold' : ''}
        numberOfLines={1}
      >
        {crumb.label}
      </Text>
    </Interactive>
  );
}

function Crumbs({
  crumbs,
  compact,
  onGo,
}: {
  readonly crumbs: readonly FileCrumb[];
  readonly compact: boolean;
  readonly onGo: (location: FileLocation) => void;
}): ReactNode {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
      <View className={cn('flex-row items-center gap-0.5', compact ? 'px-1' : 'px-3')}>
        {crumbs.map((crumb, index) => (
          <View key={crumb.key} className="flex-row items-center">
            {index === 0 ? null : <Icon name="chevronRight" size={16} tone="faint" />}
            <Crumb crumb={crumb} last={index === crumbs.length - 1} onGo={onGo} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Places({
  places,
  place,
  compact,
  onGo,
}: {
  readonly places: readonly FilePlace[];
  readonly place: string;
  readonly compact: boolean;
  readonly onGo: (location: FileLocation) => void;
}): ReactNode {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
      <View className={cn('flex-row items-center', compact ? 'px-0.5' : 'px-2')}>
        {places.map((entry) => (
          <FlatChoice
            key={entry.key}
            label={entry.label}
            spoken={`Go to ${entry.label}`}
            icon={placeIconOf(entry.kind)}
            active={entry.key === place}
            onPress={() => {
              onGo(entry.location);
            }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

export interface PickerBarProps {
  readonly places: readonly FilePlace[];
  readonly crumbs: readonly FileCrumb[];
  readonly place: string;
  readonly hidden: { readonly shown: boolean; readonly onChange: (next: boolean) => void } | null;
  readonly compact: boolean;
  readonly onGo: (location: FileLocation) => void;
}

export function PickerBar({
  places,
  crumbs,
  place,
  hidden,
  compact,
  onGo,
}: PickerBarProps): ReactNode {
  return (
    <View className="gap-1 pb-2">
      {places.length > 1 ? (
        <Places places={places} place={place} compact={compact} onGo={onGo} />
      ) : null}
      <View className={cn('flex-row items-center gap-2', compact ? 'pr-1.5' : 'pr-4')}>
        <View className="min-w-0 flex-1">
          <Crumbs crumbs={crumbs} compact={compact} onGo={onGo} />
        </View>
        {hidden === null ? null : (
          <View className="shrink-0 flex-row items-center gap-2">
            <Text variant="footnote" tone="variant">
              Show hidden
            </Text>
            <Switch value={hidden.shown} onChange={hidden.onChange} label="Show hidden files" />
          </View>
        )}
      </View>
    </View>
  );
}
