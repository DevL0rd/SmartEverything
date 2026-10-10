import type { ReactNode } from 'react';
import { useRef } from 'react';
import { View } from 'react-native';
import { IconButton } from '../components/icon-button';
import { measureAnchor } from '../components/anchor';
import { modifierLabel } from '../design/platform';
import { openSearch } from './open-search';

export function RailSearch(): ReactNode {
  const frame = useRef<View>(null);
  return (
    <View ref={frame} collapsable={false} className="items-center py-1">
      <IconButton
        icon="search"
        label="Search"
        shortcut={`${modifierLabel()} K`}
        onPress={() => {
          measureAnchor(frame, (rect) => {
            openSearch('', { x: rect.x + rect.width + 8, y: rect.y - 4, width: 0, height: 0 });
          });
        }}
      />
    </View>
  );
}
