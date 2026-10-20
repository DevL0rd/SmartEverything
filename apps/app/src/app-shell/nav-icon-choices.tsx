import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NAV_ICONS, type NavIcon } from '@smarteverything/domain';
import { Icon, type IconName } from '../components/icon';
import { Interactive } from '../components/interactive';
import { Text } from '../components/text';
import { cn } from '../design/cn';

function navIconLabel(icon: NavIcon): string {
  const spaced = icon.replaceAll(/([A-Z])/gu, ' $1').toLowerCase();
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

export function NavIconChoices({
  value,
  onChoose,
}: {
  readonly value: IconName | null;
  readonly onChoose: (icon: NavIcon) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
      {NAV_ICONS.map((icon) => (
        <Interactive
          key={icon}
          role="radio"
          label={navIconLabel(icon)}
          checked={icon === value}
          onPress={() => {
            onChoose(icon);
          }}
          className={cn(
            'h-10 flex-row items-center gap-2 rounded-full border-hairline px-3',
            icon === value
              ? 'border-primary bg-primary-container'
              : 'border-outline-variant bg-surface-1',
          )}
          layerClassName="rounded-full"
        >
          <Icon name={icon} size={20} tone={icon === value ? 'primary' : 'variant'} />
          <Text variant="label" tone={icon === value ? 'primary' : 'default'}>
            {navIconLabel(icon)}
          </Text>
        </Interactive>
      ))}
    </View>
  );
}
