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
}

function Dots({ value, error }: { readonly value: string; readonly error: boolean }): ReactNode {
  return (
    <View pointerEvents="none" className="h-4 flex-row items-center justify-center gap-2.5">
      {Array.from(value, (_, index) => (
        <View
          key={String(index)}
          className={cn('size-2.5 rounded-full', error ? 'bg-critical' : 'bg-primary')}
        />
      ))}
    </View>
  );
}

export function PinField({
  label,
  value,
  onChange,
  onSubmit,
  error,
  helper,
}: PinFieldProps): ReactNode {
  const ref = useFocusOnMount(true);
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
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="off"
        textContentType="oneTimeCode"
        secureTextEntry
        returnKeyType="done"
        className={cn(
          'h-14 rounded-md border bg-surface-2 px-4 text-center font-mono text-title-2 tracking-widest text-on-surface web:outline-none',
          error === null ? 'border-outline' : 'border-critical',
        )}
      />
      <Dots value={value} error={error !== null} />
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
