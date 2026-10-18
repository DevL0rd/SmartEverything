import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { Icon, type IconName } from '../../icon';
import { Interactive } from '../../interactive';
import { Text } from '../../text';

const POINTER_PREVIEW = 176;
const TOUCH_PREVIEW = 300;
const TOUCH_ROW_INSET = 56;

export function usePreviewWidth(): number {
  const idiom = useIdiom();
  const { width } = useWindowDimensions();
  return idiom === 'touch' ? Math.min(TOUCH_PREVIEW, width - TOUCH_ROW_INSET) : POINTER_PREVIEW;
}

export function GroupTitle({ title }: { readonly title: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" accessibilityRole="header">
      {title}
    </Text>
  );
}

export interface PreviewRowProps {
  readonly title: string;
  readonly subtitle: string;
  readonly icon?: IconName;
  readonly onPress: () => void;
  readonly selected?: boolean;
  readonly tag?: string | undefined;
  readonly chevron?: boolean;
  readonly preview: ReactNode;
}

export function PreviewRow({
  title,
  subtitle,
  icon,
  onPress,
  selected,
  tag,
  chevron = false,
  preview,
}: PreviewRowProps): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <Interactive
      label={`${title}, ${subtitle}`}
      onPress={onPress}
      role={selected === undefined ? undefined : 'radio'}
      checked={selected}
      className={cn(
        'gap-3 rounded-lg border-2 bg-surface-2 p-3',
        selected === true ? 'border-primary' : 'border-transparent',
      )}
      layerClassName="rounded-lg"
    >
      <View className="flex-row items-center gap-3">
        {icon === undefined ? null : <Icon name={icon} size={24} tone="variant" />}
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        {tag === undefined ? null : (
          <View className="rounded-xs border border-outline px-1.5 py-0.5">
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {tag}
            </Text>
          </View>
        )}
        {chevron ? <Icon name="chevronRight" size={20} tone="faint" /> : null}
        {touch ? null : preview}
      </View>
      {touch ? preview : null}
    </Interactive>
  );
}
