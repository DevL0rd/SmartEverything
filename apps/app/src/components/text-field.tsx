import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { cn } from '../design/cn';
import { IconButton } from './icon-button';
import { Text } from './text';
import { FIELD_KINDS, type FieldKind } from './field-kinds';
import { useFocusOnMount } from './use-focus-on-mount';

export type { FieldKind };

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: () => void;
  readonly onBlur?: () => void;
  readonly kind?: FieldKind;
  readonly placeholder?: string;
  readonly helper?: string;
  readonly error?: string | null;
  readonly multiline?: boolean;
  readonly disabled?: boolean;
  readonly focusOnMount?: boolean;
}

function Help({
  helper,
  error,
}: {
  readonly helper: string | undefined;
  readonly error: string | null;
}): ReactNode {
  if (error !== null) {
    return (
      <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
        {error}
      </Text>
    );
  }
  return helper === undefined ? null : (
    <Text variant="footnote" tone="variant">
      {helper}
    </Text>
  );
}

function Input(props: TextFieldProps & { readonly revealed: boolean }): ReactNode {
  const kind = props.kind ?? 'text';
  const look = FIELD_KINDS[kind];
  const ref = useFocusOnMount(props.focusOnMount === true);
  return (
    <TextInput
      ref={ref}
      accessibilityLabel={props.label}
      value={props.value}
      onChangeText={props.onChange}
      onSubmitEditing={props.onSubmit}
      onBlur={props.onBlur}
      editable={props.disabled !== true}
      multiline={props.multiline === true}
      placeholder={props.placeholder}
      keyboardType={look.keyboardType}
      autoCapitalize={look.autoCapitalize}
      autoComplete={look.autoComplete}
      autoCorrect={kind === 'text'}
      secureTextEntry={kind === 'password' && !props.revealed}
      placeholderTextColorClassName="accent-on-surface-faint"
      cursorColorClassName="accent-primary"
      selectionColorClassName="accent-primary"
      className={cn(
        'min-w-0 flex-1 self-stretch px-3 text-body text-on-surface outline-none',
        look.mono ? 'font-mono' : 'font-sans',
        props.multiline === true && 'py-2',
      )}
    />
  );
}

export function TextField(props: TextFieldProps): ReactNode {
  const [revealed, setRevealed] = useState(false);
  const error = props.error ?? null;
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {props.label}
      </Text>
      <View
        className={cn(
          'flex-row items-center rounded-md border bg-surface-2',
          props.multiline === true ? 'min-h-24' : 'h-control-h',
          error === null ? 'border-outline' : 'border-critical',
          props.disabled === true && 'opacity-40',
        )}
      >
        <Input {...props} revealed={revealed} />
        {props.kind === 'password' ? (
          <IconButton
            icon={revealed ? 'eyeOff' : 'eye'}
            label={revealed ? 'Hide password' : 'Show password'}
            onPress={() => {
              setRevealed(!revealed);
            }}
          />
        ) : null}
      </View>
      <Help helper={props.helper} error={error} />
    </View>
  );
}
