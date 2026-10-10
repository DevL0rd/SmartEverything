import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon, isIconName, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { cn } from '../../../design/cn';

const SCENE_ICONS: readonly IconName[] = [
  'sparkles',
  'sun',
  'sunrise',
  'sunset',
  'moon',
  'moonStar',
  'bed',
  'film',
  'tv',
  'music',
  'gamepad',
  'book',
  'focus',
  'coffee',
  'utensils',
  'party',
  'bath',
  'sofa',
  'baby',
  'away',
  'home',
  'car',
  'bulb',
  'lamp',
  'fan',
  'snowflake',
  'heater',
  'leaf',
  'umbrella',
  'shield',
  'lock',
  'power',
  'airVent',
];

export function sceneIcon(icon: string): IconName {
  return isIconName(icon) ? icon : 'sparkles';
}

function IconChoice({
  icon,
  selected,
  onPick,
}: {
  readonly icon: IconName;
  readonly selected: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      label={icon}
      role="radio"
      selected={selected}
      onTone={selected ? 'primary' : 'surface'}
      onPress={onPick}
      className={cn(
        'size-14 items-center justify-center rounded-lg',
        selected ? 'bg-primary' : 'bg-surface-2',
      )}
      layerClassName="rounded-lg"
    >
      <Icon name={icon} size={24} tone={selected ? 'onPrimary' : 'default'} />
    </Interactive>
  );
}

export function IconRow({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (icon: IconName) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const current = sceneIcon(value);
  return (
    <>
      <List inset>
        <ListRow
          title="Icon"
          leading={
            <View className="size-10 items-center justify-center rounded-full bg-primary-container">
              <Icon name={current} size={20} tone="primary" />
            </View>
          }
          chevron
          onPress={() => {
            setOpen(true);
          }}
        />
      </List>
      <Sheet
        open={open}
        title="Choose an icon"
        onClose={() => {
          setOpen(false);
        }}
      >
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap justify-center gap-2">
          {SCENE_ICONS.map((icon) => (
            <IconChoice
              key={icon}
              icon={icon}
              selected={icon === current}
              onPick={() => {
                onChange(icon);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}
