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

function shapeOf(variant: SearchFieldProps['variant'], active: boolean): string {
  if (variant === 'bar')
    return active ? 'h-14 rounded-full border-2 border-primary pl-3.5' : 'h-14 rounded-full pl-4';
  return active
    ? 'h-control-h rounded-md border-2 border-primary pl-2.5'
    : 'h-control-h rounded-md pl-3';
}

export function SearchField(props: SearchFieldProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const ref = useFocusOnMount(props.focusOnMount === true, props.inputRef);
  return (
    <View
      accessibilityRole="search"
      className={cn(
        'flex-row items-center gap-2',
        'web:input-focus-visible:outline-2 web:input-focus-visible:outline-focus web:input-focus-visible:-outline-offset-2',
        'bg-surface-3',
        shapeOf(props.variant, props.active === true),
      )}
    >
      <Icon
        name={props.icon ?? 'search'}
        size={pointer ? 16 : 24}
        tone={props.active === true ? 'primary' : 'variant'}
      />
      <TextInput
        ref={ref}
        accessibilityLabel={props.placeholder}
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
        placeholderTextColorClassName="accent-on-surface-variant"
        cursorColorClassName="accent-primary"
        className="min-w-0 flex-1 self-stretch font-sans text-body text-on-surface web:outline-none"
      />
      <Trailing
        value={props.value}
        shortcut={props.shortcut}
        status={props.status}
        onClear={() => {
          props.onChange('');
        }}
      />
    </View>
  );
}
