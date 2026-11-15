import type { ReactNode, RefObject } from 'react';
import { TextInput, View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { Icon, type IconName } from './icon';
import { IconButton } from './icon-button';
import { Text } from './text';
import { useFocusOnMount } from './use-focus-on-mount';

export interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: () => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly onKey?: (key: string) => void;
  readonly placeholder: string;
  readonly label?: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly icon?: IconName;
  readonly status?: string;
  readonly active?: boolean;
  readonly shortcut?: string;
  readonly focusOnMount?: boolean;
  readonly inputRef?: RefObject<TextInput | null>;
  readonly variant?: 'bar' | 'field';
}

function Trailing({
  value,
  shortcut,
  status,
  onClear,
}: {
  readonly value: string;
  readonly shortcut: string | undefined;
  readonly status: string | undefined;
  readonly onClear: () => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  if (value !== '') {
    return (
      <>
        {status === undefined ? null : (
          <Text
            variant="caption"
            tone="variant"
            className="tabular"
            accessibilityLiveRegion="polite"
          >
            {status}
          </Text>
        )}
        <IconButton icon="close" label="Clear search" onPress={onClear} />
      </>
    );
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

function shapeOf(variant: SearchFieldProps['variant'], active: boolean, wraps: boolean): string {
  const height = wraps ? 'py-1' : '';
  if (variant === 'bar') {
    const bar = wraps ? 'min-h-14' : 'h-14';
    return cn(
      bar,
      height,
      active ? 'rounded-full border-2 border-primary pl-3.5' : 'rounded-full pl-4',
    );
  }
  const field = wraps ? 'min-h-control-h' : 'h-control-h';
  return cn(
    field,
    height,
    active ? 'rounded-md border-2 border-primary pl-2.5' : 'rounded-md pl-3',
  );
}

function SearchInput({
  field,
  wraps,
}: {
  readonly field: SearchFieldProps;
  readonly wraps: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const ref = useFocusOnMount(field.focusOnMount === true, field.inputRef);
  return (
    <TextInput
      ref={ref}
      accessibilityLabel={field.label ?? field.placeholder}
      value={field.value}
      onChangeText={field.onChange}
      onSubmitEditing={field.onSubmit}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
      onKeyPress={(event) => {
        field.onKey?.(event.nativeEvent.key);
      }}
      placeholder={field.placeholder}
      returnKeyType="search"
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColorClassName="accent-on-surface-variant"
      cursorColorClassName="accent-primary"
      className={cn(
        'min-w-0 flex-1 font-sans text-body text-on-surface web:outline-none',
        wraps ? cn('min-w-32 py-0', pointer ? 'h-8' : 'h-11') : 'self-stretch',
      )}
    />
  );
}

export function SearchField(props: SearchFieldProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const wraps = props.leading !== undefined;
  const input = <SearchInput field={props} wraps={wraps} />;
  return (
    <View
      accessibilityRole="search"
      className={cn(
        'flex-row items-center gap-2',
        'web:input-focus-visible:outline-2 web:input-focus-visible:outline-focus web:input-focus-visible:-outline-offset-2',
        'bg-surface-3',
        shapeOf(props.variant, props.active === true, wraps),
      )}
    >
      <Icon
        name={props.icon ?? 'search'}
        size={pointer ? 16 : 24}
        tone={props.active === true ? 'primary' : 'variant'}
      />
      {wraps ? (
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5">
          {props.leading}
          {input}
        </View>
      ) : (
        input
      )}
      <Trailing
        value={props.value}
        shortcut={props.shortcut}
        status={props.status}
        onClear={() => {
          props.onChange('');
        }}
      />
      {props.trailing}
    </View>
  );
}
