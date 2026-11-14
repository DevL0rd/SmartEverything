import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { tokenIconOf, tokenKey, type SearchToken } from './tokens';

export const SEARCH_HINT = "Search by place, date or what's in the photo";

export interface TokenFieldProps {
  readonly tokens: readonly SearchToken[];
  readonly value: string;
  readonly inputRef: RefObject<TextInput | null>;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onKey: (key: string) => void;
  readonly onRemove: (token: SearchToken) => void;
  readonly onClear: () => void;
  readonly unused: ReadonlySet<string>;
  readonly onFocus: () => void;
}

export const UNUSED_NOTE = 'Not used on this tab';

function TokenChip({
  token,
  unused,
  onRemove,
}: {
  readonly token: SearchToken;
  readonly unused: boolean;
  readonly onRemove: (token: SearchToken) => void;
}): ReactNode {
  const tone = unused ? 'variant' : 'primary';
  return (
    <Interactive
      role="button"
      label={unused ? `Remove ${token.label}, ${UNUSED_NOTE}` : `Remove ${token.label}`}
      onPress={() => {
        onRemove(token);
      }}
      className={cn(
        'h-8 max-w-full flex-row items-center gap-1.5 rounded-full pl-2.5 pr-2',
        unused ? 'border border-dashed border-outline bg-surface-2' : 'bg-primary-container',
      )}
      layerClassName="rounded-full"
    >
      <Icon name={tokenIconOf(token)} size={16} tone={tone} />
      <Text
        variant="label"
        tone={unused ? 'variant' : 'default'}
        className={cn('shrink', !unused && 'text-on-primary-container')}
        numberOfLines={1}
      >
        {token.label}
      </Text>
      <Icon name="close" size={16} tone={tone} />
    </Interactive>
  );
}

function FieldInput({
  tokens,
  value,
  inputRef,
  onChange,
  onSubmit,
  onKey,
  onFocus,
}: Pick<TokenFieldProps, 'tokens' | 'value' | 'inputRef' | 'onChange' | 'onSubmit' | 'onKey'> & {
  readonly onFocus: (focused: boolean) => void;
}): ReactNode {
  return (
    <TextInput
      ref={inputRef}
      accessibilityLabel={SEARCH_HINT}
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      onFocus={() => {
        onFocus(true);
      }}
      onBlur={() => {
        onFocus(false);
      }}
      onKeyPress={(event) => {
        onKey(event.nativeEvent.key);
      }}
      placeholder={tokens.length === 0 ? SEARCH_HINT : 'Add a filter'}
      returnKeyType="search"
      submitBehavior="submit"
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColorClassName="accent-on-surface-variant"
      cursorColorClassName="accent-primary"
      className="h-8 min-w-32 flex-1 font-sans text-body text-on-surface web:outline-none"
    />
  );
}

export function TokenField({
  tokens,
  value,
  inputRef,
  onChange,
  onSubmit,
  onKey,
  onRemove,
  onClear,
  unused,
  onFocus,
}: TokenFieldProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [focused, setFocused] = useState(false);
  const filled = tokens.length > 0 || value !== '';
  return (
    <View
      accessibilityRole="search"
      className={cn(
        'min-h-control-h flex-row items-center gap-2 rounded-md bg-surface-3 py-1.5 pl-3 pr-1',
        focused ? 'border-2 border-primary' : 'border-2 border-transparent',
      )}
    >
      <Icon name="search" size={pointer ? 16 : 24} tone="variant" />
      <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5">
        {tokens.map((token) => (
          <TokenChip
            key={tokenKey(token)}
            token={token}
            unused={unused.has(tokenKey(token))}
            onRemove={onRemove}
          />
        ))}
        <FieldInput
          tokens={tokens}
          value={value}
          inputRef={inputRef}
          onChange={onChange}
          onSubmit={onSubmit}
          onKey={onKey}
          onFocus={(next) => {
            setFocused(next);
            if (next) onFocus();
          }}
        />
      </View>
      {filled ? <IconButton icon="close" label="Clear search" onPress={onClear} /> : null}
    </View>
  );
}
