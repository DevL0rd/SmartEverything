import { useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import { useIdiom } from '../../../design/platform';
import { useComposerAccessoryLayout } from './composer-accessory-layout';
import { cn } from '../../../design/cn';
export function CompactPickerControl({
  anchorRef,
  label,
  value,
  icon,
  onPress,
  unrestricted = false,
  pending = false,
}: {
  readonly anchorRef: RefObject<View | null>;
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly unrestricted?: boolean;
  readonly pending?: boolean;
}): ReactNode {
  const [hovered, setHovered] = useState(false);
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      ref={anchorRef}
      collapsable={false}
      className="min-w-0 shrink"
      onPointerEnter={(): void => {
        setHovered(true);
      }}
      onPointerLeave={(): void => {
        setHovered(false);
      }}
    >
      <Interactive
        label={label}
        onPress={onPress}
        className="min-h-touch-min max-w-48 min-w-touch-min justify-center"
        layerClassName="rounded-full"
      >
        <PickerFace icon={pending ? 'clock' : icon} value={value} unrestricted={unrestricted} />
      </Interactive>
      {hovered && pointer ? <Tooltip text={label} placement="above" /> : null}
    </View>
  );
}

function PickerFace({
  icon,
  value,
  unrestricted,
}: {
  readonly icon: IconName;
  readonly value: string;
  readonly unrestricted: boolean;
}): ReactNode {
  const tone = unrestricted ? 'warning' : 'variant';
  const { compact } = useComposerAccessoryLayout();
  return (
    <View
      className={cn(
        'h-8 min-w-0 flex-row items-center gap-1 rounded-full border-hairline px-2',
        unrestricted ? 'border-warning/40 bg-warning/14' : 'border-outline-variant bg-surface-1',
      )}
    >
      <Icon name={icon} size={16} tone={tone} />
      {value === '' ? null : (
        <Text
          variant="caption"
          tone={unrestricted ? 'warning' : 'default'}
          numberOfLines={1}
          className="min-w-0 shrink"
        >
          {value}
        </Text>
      )}
      {compact ? null : <Icon name="chevronUp" size={16} tone={tone} />}
    </View>
  );
}
