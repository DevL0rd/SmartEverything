import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { usePanelFrame } from '../../../../components/adaptive-panel';
import { Button } from '../../../../components/button';
import { Icon, type IconName } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { useKeyboardRow } from '../../../../components/keyboard-list';
import type { ReasonAction } from '../../../../components/reason-line';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';

export function PanelHead({
  title,
  onBack,
  onClose,
}: {
  readonly title: string;
  readonly onBack: (() => void) | null;
  readonly onClose: () => void;
}): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  if (sheet && onBack === null) return null;
  return (
    <View className="min-h-touch-min flex-row items-center gap-1 pl-1 pr-1">
      {onBack === null ? (
        <View className="w-4" />
      ) : (
        <IconButton icon="chevronLeft" label="Back to model list" onPress={onBack} />
      )}
      <Text variant="title-3" accessibilityRole="header" numberOfLines={1} className="flex-1">
        {title}
      </Text>
      {sheet ? null : <IconButton icon="close" label="Close" onPress={onClose} shortcut="Esc" />}
    </View>
  );
}

export function PanelNote({
  icon,
  text,
  action,
}: {
  readonly icon: IconName;
  readonly text: string;
  readonly action?: ReasonAction;
}): ReactNode {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 border-b border-outline-variant px-4 py-2"
    >
      <Icon name={icon} size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {text}
      </Text>
      {action === undefined ? null : (
        <Button label={action.label} variant="tonal" onPress={action.onPress} />
      )}
    </View>
  );
}

export function KeyedRow({
  id,
  className,
  children,
}: {
  readonly id: string;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const keyboard = useKeyboardRow(id);
  return (
    <View
      nativeID={keyboard.nativeID}
      className={cn(className, keyboard.highlighted && 'bg-surface-2')}
    >
      {children}
    </View>
  );
}

export function usePanelFill(): string {
  return usePanelFrame().presentation === 'sheet' ? '' : 'min-h-0 flex-1';
}

export function PanelScroll({ children }: { readonly children: ReactNode }): ReactNode {
  const fill = usePanelFill();
  if (fill === '') return <View>{children}</View>;
  return <ScrollView className={fill}>{children}</ScrollView>;
}

export function PanelCard({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="overflow-hidden rounded-lg border border-outline">{children}</View>;
}

export function PanelSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2 px-4 pt-4">
      <Text variant="caption" tone="variant" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}
