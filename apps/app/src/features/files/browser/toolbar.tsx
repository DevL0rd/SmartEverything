import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FileBrowserHandle } from './browser-types';
import { Crumbs } from './crumbs';
import type { DragSession } from './drop-zone';
import { KindChips } from './kind-chips';
import { PlacesBar } from './places-bar';
import { ViewSort } from './view-sort';

export interface ToolbarProps<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
  readonly wide: boolean;
}

export function Toolbar<O>({ browser, session, wide }: ToolbarProps<O>): ReactNode {
  if (!browser.abilities.list) return null;
  if (wide) {
    return (
      <View className="gap-2">
        <View className="flex-row items-center gap-3">
          <Crumbs browser={browser} session={session} />
          <ViewSort browser={browser} />
        </View>
        <PlacesBar browser={browser} />
        <KindChips browser={browser} />
      </View>
    );
  }
  return (
    <View className="gap-2">
      {browser.listing.crumbs.length > 1 ? (
        <View className="flex-row items-center">
          <Crumbs browser={browser} session={session} />
        </View>
      ) : null}
      <PlacesBar browser={browser} />
      <KindChips browser={browser} />
      <View className="flex-row justify-end">
        <ViewSort browser={browser} />
      </View>
    </View>
  );
}
