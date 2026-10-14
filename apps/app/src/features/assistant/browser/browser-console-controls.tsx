import { useBrowserFocusRestore } from './browser-action-scope';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { type TextInput, View } from 'react-native';
import { rememberBrowserFocus } from '../../../platform/browser-focus';
import { SearchField } from '../../../components/search-field';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Icon } from '../../../components/icon';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { SelectPicker } from '../../../components/select-picker';
import { useRequestedBrowserAction } from './browser-requested-action';
import { CONSOLE_LEVELS, type ConsoleFilter } from './browser-console-model';
export function BrowserConsoleFilters({
  query,
  setQuery,
  level,
  setLevel,
  inputRef,
}: {
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly level: ConsoleFilter;
  readonly setLevel: (value: ConsoleFilter) => void;
  readonly inputRef: RefObject<TextInput | null>;
}): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  useBrowserFocusRestore('console-level');
  const open = (): void => {
    rememberBrowserFocus('console-level');
    measureAnchor(ref, setAnchor);
  };
  useRequestedBrowserAction({ 'console-level': open });
  return (
    <View className="flex-row items-center gap-2 border-b border-outline-variant px-3 py-2">
      <View className="min-w-0 flex-1">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search console"
          inputRef={inputRef}
        />
      </View>
      <View ref={ref} collapsable={false}>
        <LevelButton level={level} open={open} />
      </View>
      <SelectPicker
        label="Console level"
        options={CONSOLE_LEVELS}
        value={level}
        anchor={anchor}
        onPick={setLevel}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </View>
  );
}

function LevelButton({
  level,
  open,
}: {
  readonly level: ConsoleFilter;
  readonly open: () => void;
}): ReactNode {
  return (
    <Interactive
      label="Console level"
      onPress={open}
      className="min-h-touch-min flex-row items-center gap-1 rounded-sm bg-surface-2 px-2"
      layerClassName="rounded-sm"
    >
      <Text variant="caption">
        {CONSOLE_LEVELS.find((option) => option.value === level)?.label}
      </Text>
      <Icon name="chevronDown" size={16} />
    </Interactive>
  );
}
