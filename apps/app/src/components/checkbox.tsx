import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface CheckboxProps {
  readonly checked: boolean | 'mixed';
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly description?: string;
  readonly caption?: string;
  readonly disabled?: boolean;
  readonly icon?: IconName;
  readonly className?: string;
}

function CheckboxMark({
  checked,
  disabled,
}: Pick<CheckboxProps, 'checked' | 'disabled'>): ReactNode {
  return (
    <View
      className={cn(
        'size-5 shrink-0 items-center justify-center rounded-xs border-2',
        checked === false ? 'border-on-surface-variant' : 'border-primary bg-primary',
        disabled === true && 'opacity-40',
      )}
    >
      {checked === false ? null : (
        <Icon name={checked === 'mixed' ? 'minus' : 'check'} size={16} tone="onPrimary" />
      )}
    </View>
  );
}

function CheckboxCopy({
  label,
  description,
  caption,
  disabled,
  detailsId,
}: Pick<CheckboxProps, 'label' | 'description' | 'caption' | 'disabled'> & {
  readonly detailsId: string;
}): ReactNode {
  if (description === undefined && caption === undefined) {
    return <Text className="shrink">{label}</Text>;
  }
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="body-strong" tone={disabled === true ? 'variant' : 'default'}>
        {label}
      </Text>
      <View nativeID={detailsId} className="gap-0.5">
        {description === undefined ? null : (
          <Text variant="callout" tone="variant">
            {description}
          </Text>
        )}
        {caption === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {caption}
          </Text>
        )}
      </View>
    </View>
  );
}

export function Checkbox(props: CheckboxProps): ReactNode {
  const {
    checked,
    onChange,
    label,
    description,
    caption,
    disabled = false,
    icon,
    className,
  } = props;
  const detailsId = useId();
  const details = [description, caption].filter((text) => text !== undefined).join(' ');
  const hasDetails = details !== '';
  return (
    <Interactive
      {...(hasDetails && !isNative() ? { 'aria-describedby': detailsId } : {})}
      role="checkbox"
      label={label}
      hint={hasDetails ? details : undefined}
      selected={checked === true}
      checked={checked}
      disabled={disabled}
      onPress={() => {
        selectionTick();
        onChange(checked !== true);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 rounded-sm',
        hasDetails && disabled && 'opacity-100',
        className,
      )}
      layerClassName="rounded-sm"
      focusInset
    >
      <CheckboxMark checked={checked} disabled={hasDetails ? disabled : false} />
      {icon === undefined ? null : <Icon name={icon} size={20} />}
      <CheckboxCopy {...props} detailsId={detailsId} />
    </Interactive>
  );
}
