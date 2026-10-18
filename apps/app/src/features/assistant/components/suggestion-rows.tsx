import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { useKeyboardRow } from '../../../components/keyboard-list';
import { ListRow } from '../../../components/list-row';
import type { ReasonAction } from '../../../components/reason-line';
import { Text } from '../../../components/text';

export function SuggestionGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View role="group" accessibilityLabel={label}>
      <View aria-hidden>
        <Text variant="caption" tone="variant" className="px-4 pb-0.5 pt-2 font-sans-semibold">
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function SuggestionRow({
  id,
  icon,
  title,
  subtitle,
  detail,
  onChoose,
}: {
  readonly id: string;
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle: string;
  readonly detail?: string | undefined;
  readonly onChoose: (id: string) => void;
}): ReactNode {
  const keyboard = useKeyboardRow(id);
  return (
    <Pressable
      role="option"
      aria-selected={keyboard.highlighted}
      nativeID={keyboard.nativeID}
      onPointerEnter={keyboard.highlight}
      onPress={(): void => {
        onChoose(id);
      }}
    >
      <ListRow
        icon={icon}
        title={title}
        subtitle={subtitle}
        {...(keyboard.highlighted && detail !== undefined ? { caption: detail } : {})}
        selected={keyboard.highlighted}
      />
    </Pressable>
  );
}

export function SuggestionReason({
  icon,
  text,
  action,
}: {
  readonly icon: IconName;
  readonly text: string;
  readonly action?: ReasonAction | null;
}): ReactNode {
  return (
    <ListRow
      icon={icon}
      title={text}
      trailing={
        action === undefined || action === null ? undefined : (
          <Button label={action.label} variant="text" onPress={action.onPress} />
        )
      }
    />
  );
}
