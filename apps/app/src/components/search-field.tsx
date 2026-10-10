import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { TextInput, View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { Icon } from './icon';
import { IconButton } from './icon-button';
import { Text } from './text';

export interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: () => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly onKey?: (key: string) => void;
  readonly placeholder: string;
  readonly shortcut?: string;
  readonly focusOnMount?: boolean;
  readonly inputRef?: RefObject<TextInput | null>;
  readonly variant?: 'bar' | 'field';
}

function Trailing({
  value,
  shortcut,
  onClear,
}: {
  readonly value: string;
  readonly shortcut: string | undefined;
  readonly onClear: () => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  if (value !== '') {
    return <IconButton icon="close" label="Clear search" onPress={onClear} />;
  }
  if (shortcut === undefined || !pointer) {
    return null;
  }
  return (
    <View className="mr-2 rounded-xs border border-outline px-1.5 py-0.5">
      <Text variant="caption" tone="variant">
        {shortcut}
      </Text>
    </View>
  );
}

function useInputRef(
  external: RefObject<TextInput | null> | undefined,
  focusOnMount: boolean,
): RefObject<TextInput | null> {
  const own = useRef<TextInput>(null);
  const ref = external ?? own;
  useEffect(() => {
    if (focusOnMount) {
      ref.current?.focus();
    }
  }, [focusOnMount, ref]);
  return ref;
}

export function SearchField(props: SearchFieldProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const ref = useInputRef(props.inputRef, props.focusOnMount === true);
  return (
    <View
      className={cn(
        'flex-row items-center gap-2',
        props.variant === 'bar'
          ? 'h-14 rounded-full bg-surface-3 pl-4'
          : 'h-control-h rounded-md bg-surface-3 pl-3',
      )}
    >
      <Icon name="search" size={pointer ? 16 : 24} tone="variant" />
      <TextInput
        ref={ref}
        accessibilityLabel={props.placeholder}
        accessibilityRole="search"
        value={props.value}
        onChangeText={props.onChange}
        onSubmitEditing={props.onSubmit}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onKeyPress={(event) => {
          props.onKey?.(event.nativeEvent.key);
        }}
        placeholder={props.placeholder}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColorClassName="accent-on-surface-faint"
        cursorColorClassName="accent-primary"
        className="min-w-0 flex-1 self-stretch font-sans text-body text-on-surface outline-none"
      />
      <Trailing
        value={props.value}
        shortcut={props.shortcut}
        onClear={() => {
          props.onChange('');
        }}
      />
    </View>
  );
}
