import type { ReactNode } from 'react';
import { View } from 'react-native';
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
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  const keyboard = useKeyboardRow(id);
  return (
    <View nativeID={keyboard.nativeID} className={cn(keyboard.highlighted && 'bg-surface-2')}>
      {children}
    </View>
  );
}

export function ShortcutHint({ keys }: { readonly keys: string }): ReactNode {
  return (
    <View className="rounded-xs border border-outline px-1.5 py-0.5">
      <Text variant="caption" tone="variant">
        {keys}
      </Text>
    </View>
  );
}
