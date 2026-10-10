import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { cn } from '../design/cn';
import { Text } from './text';
import { useFocusOnMount } from './use-focus-on-mount';

export interface OtpFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: () => void;
  readonly format: 'pairing' | { readonly digits: number };
  readonly error?: string | null;
  readonly focusOnMount?: boolean;
}

function normalise(raw: string, format: OtpFieldProps['format']): string {
  if (format === 'pairing') {
    const letters = raw
      .toUpperCase()
      .replaceAll(/[^A-Z0-9]/g, '')
      .slice(0, 8);
    return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
  }
  return raw.replaceAll(/\D/g, '').slice(0, format.digits);
}

export function OtpField({
  label,
  value,
  onChange,
  onSubmit,
  format,
  error = null,
  focusOnMount = false,
}: OtpFieldProps): ReactNode {
  const numeric = format !== 'pairing';
  const ref = useFocusOnMount(focusOnMount);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(raw) => {
          onChange(normalise(raw, format));
        }}
        onSubmitEditing={onSubmit}
        ref={ref}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        keyboardType={numeric ? 'number-pad' : 'default'}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={numeric ? '' : 'ABCD-EFGH'}
        placeholderTextColorClassName="accent-on-surface-faint"
        className={cn(
          'h-14 rounded-md border bg-surface-2 px-4 text-center font-mono text-title-2 tracking-widest text-on-surface outline-none',
          error === null ? 'border-outline' : 'border-critical',
        )}
      />
      {error === null ? null : (
        <Text variant="footnote" tone="critical">
          {error}
        </Text>
      )}
    </View>
  );
}
