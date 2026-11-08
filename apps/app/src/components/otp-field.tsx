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
  readonly boxes?: boolean;
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

function lengthOf(format: OtpFieldProps['format']): number {
  return format === 'pairing' ? PAIRING_LENGTH : format.digits;
}

const PAIRING_LENGTH = 9;

function DigitBoxes({
  value,
  count,
  error,
}: {
  readonly value: string;
  readonly count: number;
  readonly error: boolean;
}): ReactNode {
  return (
    <View pointerEvents="none" className="flex-row justify-center gap-3">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={String(index)}
          className={cn(
            'h-14 w-12 items-center justify-center rounded-md border bg-surface-2',
            error
              ? 'border-critical'
              : index === value.length
                ? 'border-primary'
                : 'border-outline',
          )}
        >
          <Text variant="title-2">{index < value.length ? '•' : ''}</Text>
        </View>
      ))}
    </View>
  );
}

function inputClassOf(error: boolean, boxes: boolean): string {
  return cn(
    'h-14 rounded-md border bg-surface-2 px-4 text-center font-mono text-title-2 tracking-widest text-on-surface web:outline-none',
    error ? 'border-critical' : 'border-outline',
    boxes && 'absolute inset-0 opacity-0',
  );
}

export function OtpField({
  label,
  value,
  onChange,
  onSubmit,
  format,
  error = null,
  focusOnMount = false,
  boxes = false,
}: OtpFieldProps): ReactNode {
  const numeric = format !== 'pairing';
  const ref = useFocusOnMount(focusOnMount);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      <View className="relative">
        {boxes ? (
          <DigitBoxes value={value} count={lengthOf(format)} error={error !== null} />
        ) : null}
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
          maxLength={lengthOf(format)}
          secureTextEntry={boxes}
          caretHidden={boxes}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={numeric ? '' : 'ABCD-EFGH'}
          placeholderTextColorClassName="accent-on-surface-faint"
          className={inputClassOf(error !== null, boxes)}
        />
      </View>
      {error === null ? null : (
        <Text variant="footnote" tone="critical">
          {error}
        </Text>
      )}
    </View>
  );
}
