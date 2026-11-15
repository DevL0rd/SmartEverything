import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FileBrowserHandle } from './browser-types';
import { Crumbs } from './crumbs';
import type { DragSession } from './drop-zone';
import { KindChips } from './kind-chips';
import { PlacesBar } from './places-bar';
import { BrowserViewControls, browserChipsShown, useBrowserControlsInShell } from './view-sort';

export interface ToolbarProps<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
}

export function Toolbar<O>({ browser, session }: ToolbarProps<O>): ReactNode {
  const crumbs = browser.listing.crumbs.length > 1;
  const chips = browserChipsShown(browser);
  const inShell = useBrowserControlsInShell(browser);
  if (!browser.abilities.list) return null;
  if (!crumbs && !chips) return null;
  return (
    <View className="gap-2">
      {crumbs ? (
        <View className="flex-row items-center">
          <Crumbs browser={browser} session={session} />
        </View>
      ) : null}
      {chips ? (
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-2">
            <PlacesBar browser={browser} />
            <KindChips browser={browser} />
          </View>
          {inShell ? null : <BrowserViewControls browser={browser} />}
        </View>
      ) : null}
    </View>
  );
}
