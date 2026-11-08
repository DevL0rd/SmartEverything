import type { ReactNode } from 'react';
import { copyText } from '../../../../components/copy-button';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';

const HIT = 8;

export function CardAction({
  icon,
  label,
  onPress,
  selected,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      hitSlop={HIT}
      className="size-7.5 items-center justify-center"
      layerClassName="rounded-full"
      {...(selected === undefined ? {} : { selected })}
    >
      <Icon name={icon} size={16} tone={selected === true ? 'variant' : 'faint'} />
    </Interactive>
  );
}

export function CardCopy({
  value,
  what,
}: {
  readonly value: string;
  readonly what: string;
}): ReactNode {
  return (
    <CardAction
      icon="copy"
      label={`Copy ${what}`}
      onPress={() => {
        copyText(value, what);
      }}
    />
  );
}
