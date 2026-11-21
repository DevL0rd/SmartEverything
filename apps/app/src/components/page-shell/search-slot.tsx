import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { View, type TextInput } from 'react-native';
import { useIsFocused } from 'expo-router';
import { keyPressOf, type KeyPress } from '../../design/keyboard';
import { isNative, useIdiom } from '../../design/platform';
import { useSizeClass } from '../../design/size-class';
import { SearchField } from '../search-field';

export interface ShellSearchConfig {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly label?: string;
  readonly onSubmit?: () => void;
  readonly onFocus?: () => void;
  readonly onKey?: (key: string) => void;
  readonly status?: string;
  readonly tokens?: ReactNode;
  readonly trailing?: ReactNode;
  readonly options?: ReactNode;
  readonly panel?: ReactNode;
  readonly inputRef?: RefObject<TextInput | null>;
  readonly focusOnMount?: boolean;
}

export type EscapeStep = 'clear' | 'blur';

export function searchShortcutOf(press: KeyPress): boolean {
  if (press.alt) return false;
  if (press.command) return !press.shift && press.key.toLowerCase() === 'f';
  return press.key === '/' && !press.typing;
}

export function escapeStepOf(value: string): EscapeStep {
  return value === '' ? 'blur' : 'clear';
}

export function searchPanelShown(search: ShellSearchConfig | undefined): boolean {
  return search?.panel !== undefined && search.panel !== null;
}

function useSearchShortcut(inputRef: RefObject<TextInput | null>): void {
  const pointer = useIdiom() === 'pointer';
  const focused = useIsFocused();
  useEffect(() => {
    if (!pointer || !focused || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !searchShortcutOf(keyPressOf(event))) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [pointer, focused, inputRef]);
}

export type SearchOptionsPlace = 'inside' | 'below';

export function searchOptionsPlaceOf(pointer: boolean, compact: boolean): SearchOptionsPlace {
  return pointer && !compact ? 'inside' : 'below';
}

function trailingOf(search: ShellSearchConfig, place: SearchOptionsPlace): ReactNode {
  if (place === 'below' || search.options === undefined) return search.trailing;
  return (
    <>
      {search.trailing}
      <View className="mr-1">{search.options}</View>
    </>
  );
}

function ShellSearchField({
  search,
  trailing,
}: {
  readonly search: ShellSearchConfig;
  readonly trailing: ReactNode;
}): ReactNode {
  const ownRef = useRef<TextInput>(null);
  const inputRef = search.inputRef ?? ownRef;
  const pointer = useIdiom() === 'pointer';
  useSearchShortcut(inputRef);
  const onKey = (key: string): void => {
    search.onKey?.(key);
    if (key !== 'Escape') return;
    if (escapeStepOf(search.value) === 'clear') search.onChange('');
    else inputRef.current?.blur();
  };
  return (
    <SearchField
      inputRef={inputRef}
      value={search.value}
      onChange={search.onChange}
      placeholder={search.placeholder}
      onKey={onKey}
      {...(pointer ? { shortcut: '/' } : {})}
      {...(search.focusOnMount === true ? { focusOnMount: true } : {})}
      {...(search.label === undefined ? {} : { label: search.label })}
      {...(search.onSubmit === undefined ? {} : { onSubmit: search.onSubmit })}
      {...(search.onFocus === undefined ? {} : { onFocus: search.onFocus })}
      {...(search.status === undefined ? {} : { status: search.status })}
      {...(search.tokens === undefined ? {} : { leading: search.tokens })}
      {...(trailing === undefined ? {} : { trailing })}
    />
  );
}

export function ShellSearch({ search }: { readonly search: ShellSearchConfig }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const sizeClass = useSizeClass();
  const place = searchOptionsPlaceOf(pointer, sizeClass.width === 'compact');
  const field = <ShellSearchField search={search} trailing={trailingOf(search, place)} />;
  if (place === 'inside' || search.options === undefined) return field;
  return (
    <View className="gap-2">
      {field}
      {search.options}
    </View>
  );
}
