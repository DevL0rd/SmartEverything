import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { View, type TextInput } from 'react-native';
import { SearchField } from '../components/search-field';
import { useValue } from '../design/external-store';
import { modifierLabel } from '../design/platform';
import { registerInlineSearch, showInlineResults } from './open-search';
import { searchOverlay } from './overlay-state';

export function SidebarSearch({
  inputRef,
}: {
  readonly inputRef: RefObject<TextInput | null>;
}): ReactNode {
  const frame = useRef<View>(null);
  const overlay = useValue(searchOverlay);
  const query = overlay.field ? '' : overlay.query;
  useEffect(() => registerInlineSearch({ input: inputRef, frame }), [inputRef]);
  return (
    <View ref={frame} collapsable={false}>
      <SearchField
        inputRef={inputRef}
        value={query}
        onChange={showInlineResults}
        onFocus={() => {
          showInlineResults(query);
        }}
        placeholder="Search your home"
        shortcut={`${modifierLabel()} K`}
      />
    </View>
  );
}
