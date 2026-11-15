import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { count } from '../../../format/number';
import { showAllFolders, useHiddenFolders, useShowAllFolders } from './data';

export function hiddenLineOf(hidden: number): string {
  return hidden === 1 ? '1 hidden folder' : `${count(hidden)} hidden folders`;
}

interface ToggleLook {
  readonly icon: 'eye' | 'eyeOff';
  readonly tone: 'primary' | 'variant';
  readonly text: 'primary' | 'default';
  readonly fill: string;
}

const LOOK: Readonly<Record<'on' | 'off', ToggleLook>> = {
  on: { icon: 'eye', tone: 'primary', text: 'primary', fill: 'bg-primary-container' },
  off: { icon: 'eyeOff', tone: 'variant', text: 'default', fill: 'bg-surface-3' },
};

export function ShowAllToggle(): ReactNode {
  const hidden = useHiddenFolders().data?.folders.length ?? 0;
  const on = useShowAllFolders();
  if (hidden === 0 && !on) return null;
  const look = LOOK[on ? 'on' : 'off'];
  return (
    <Interactive
      role="switch"
      checked={on}
      label={`Show all, including ${hiddenLineOf(hidden)}`}
      onPress={() => {
        showAllFolders.set(!on);
      }}
      className={cn(
        'h-control-h flex-row items-center justify-center gap-2 rounded-full px-3',
        look.fill,
      )}
      layerClassName="rounded-full"
    >
      <Icon name={look.icon} size={16} tone={look.tone} />
      <Text variant="footnote" tone={look.text} numberOfLines={1}>
        Show all
      </Text>
    </Interactive>
  );
}

export function ShowAllRow(): ReactNode {
  const hidden = useHiddenFolders().data?.folders.length ?? 0;
  const on = useShowAllFolders();
  if (hidden === 0 && !on) return null;
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink">
        {on ? `Showing ${hiddenLineOf(hidden)}` : `${hiddenLineOf(hidden)} not shown`}
      </Text>
      <ShowAllToggle />
    </View>
  );
}
