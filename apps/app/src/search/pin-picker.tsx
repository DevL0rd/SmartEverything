import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { NavPinTarget } from '@smarteverything/domain';
import { navEditor } from '../app-shell/nav-edit-state';
import { useNavPins } from '../app-shell/nav-layout';
import { SearchField } from '../components/search-field';
import { Sheet } from '../components/sheet';
import { useValue } from '../design/external-store';
import { ResultList } from './result-list';
import { useSearchPanel } from './search-panel';

function close(): void {
  navEditor.set(null);
}

function Picker(): ReactNode {
  const [query, setQuery] = useState('');
  const pins = useNavPins();
  const pick = (target: NavPinTarget): void => {
    pins.pin(target);
    close();
  };
  const panel = useSearchPanel({
    query,
    onQuery: setQuery,
    look: 'page',
    onDone: close,
    onEscape: close,
    pick,
  });
  return (
    <Sheet open onClose={close} title="Add a pin" detents={['full']} scroll={false}>
      <View className="min-h-0 flex-1 gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search for something to pin"
          focusOnMount
          {...(panel.submit === null ? {} : { onSubmit: panel.submit })}
        />
        <ResultList model={panel.model} contentClassName="pb-safe-offset-6" />
      </View>
    </Sheet>
  );
}

export function PinPickerHost(): ReactNode {
  return useValue(navEditor)?.kind === 'picker' ? <Picker /> : null;
}
