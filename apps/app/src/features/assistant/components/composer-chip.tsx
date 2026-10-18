import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { ComposerClass } from '../model/ai-layout';
import { useComposerClass } from './composer-accessory-layout';

const LABEL_WIDTH: Readonly<Record<ComposerClass, string>> = {
  regular: 'max-w-50',
  compact: 'max-w-50',
  tight: 'max-w-30',
};

const REMOVE_HIT = 6;

export interface ComposerChipProps {
  readonly leading: ReactNode;
  readonly label: string;
  readonly meta?: string;
  readonly failed?: boolean;
  readonly retry?: (() => void) | null;
  readonly removeLabel: string;
  readonly onRemove: () => void;
  readonly children?: ReactNode;
}

function ChipAction({
  label,
  onPress,
  children,
  className,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
  readonly className: string;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      className={className}
      layerClassName="rounded-full"
      hitSlop={REMOVE_HIT}
    >
      {children}
    </Interactive>
  );
}

function ChipLabel({
  label,
  meta,
  failed,
}: {
  readonly label: string;
  readonly meta: string | undefined;
  readonly failed: boolean;
}): ReactNode {
  const composerClass = useComposerClass();
  return (
    <>
      <Text
        variant="footnote"
        numberOfLines={1}
        className={cn('min-w-0 shrink', LABEL_WIDTH[composerClass])}
      >
        {label}
      </Text>
      {meta === undefined || meta === '' ? null : (
        <Text variant="caption" tone={failed ? 'critical' : 'variant'} className="tabular">
          {meta}
        </Text>
      )}
    </>
  );
}

export function ComposerChip({
  leading,
  label,
  meta,
  failed = false,
  retry = null,
  removeLabel,
  onRemove,
  children,
}: ComposerChipProps): ReactNode {
  return (
    <View
      className={cn(
        'min-h-9 max-w-full flex-row items-center gap-1.5 overflow-hidden rounded-full border-hairline bg-surface-1 pl-2.5 elevation-1',
        failed ? 'border-critical' : 'border-outline-variant',
      )}
    >
      {leading}
      <ChipLabel label={label} meta={meta} failed={failed} />
      {retry === null ? null : (
        <ChipAction
          label={`Retry ${label}`}
          onPress={retry}
          className="min-h-9 justify-center px-1"
        >
          <Text variant="caption" tone="primary">
            Retry
          </Text>
        </ChipAction>
      )}
      <ChipAction
        label={removeLabel}
        onPress={onRemove}
        className="size-9 items-center justify-center rounded-full"
      >
        <Icon name="close" size={16} />
      </ChipAction>
      {children}
    </View>
  );
}
