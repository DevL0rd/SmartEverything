import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { Text } from '../../../../components/text';
import { useFocusOnMount } from '../../../../components/use-focus-on-mount';
import { cn } from '../../../../design/cn';
import { pinOf } from './locked-model';

export interface PinFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly error: string | null;
  readonly helper: string;
  readonly disabled?: boolean;
}

export function PinField({
  label,
  value,
  onChange,
  onSubmit,
  error,
  helper,
  disabled = false,
}: PinFieldProps): ReactNode {
  const ref = useFocusOnMount(!disabled);
  return (
    <View className="w-full max-w-90 gap-2 self-center">
      <Text variant="footnote" tone="variant" align="center">
        {label}
      </Text>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(text) => {
          onChange(pinOf(text));
        }}
        onSubmitEditing={onSubmit}
        accessibilityLabel={label}
        accessibilityHint={helper}
        editable={!disabled}
        accessibilityState={{ disabled }}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="off"
        textContentType="oneTimeCode"
        secureTextEntry
        returnKeyType="done"
        className={cn(
          'h-14 rounded-md border bg-surface-2 px-4 text-center font-mono text-title-2 tracking-widest text-on-surface web:outline-none',
          error === null ? 'border-outline' : 'border-critical',
          disabled && 'opacity-60',
        )}
      />
      <Text
        variant="footnote"
        tone={error === null ? 'variant' : 'critical'}
        align="center"
        accessibilityLiveRegion="polite"
      >
        {error ?? helper}
      </Text>
    </View>
  );
}
