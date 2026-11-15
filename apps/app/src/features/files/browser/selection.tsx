import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { SelectionAction } from '../../../components/files/selection-bar';
import { HScroller } from '../../../components/h-scroller';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import type { FileBrowserHandle } from './browser-types';
import type { MenuSpec } from './menu-specs';
import { selectionLabelOf } from './selection-model';
import { SelectionRow } from './selection-row';

function actionsOf<O>(
  browser: FileBrowserHandle<O>,
  specs: readonly MenuSpec[],
): readonly SelectionAction[] {
  return specs.map((spec) => ({
    label: spec.label,
    icon: spec.icon,
    variant: spec.destructive ? 'destructive' : 'tonal',
    onPress: (): void => {
      browser.commands.menu(spec.id, browser.picked);
    },
  }));
}

function ActionButtons({ actions }: { readonly actions: readonly SelectionAction[] }): ReactNode {
  return actions.map((action) => (
    <Button
      key={action.label}
      label={action.label}
      variant={action.variant}
      {...(action.icon === undefined ? {} : { icon: action.icon })}
      {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
    />
  ));
}

function Danger({ actions }: { readonly actions: readonly SelectionAction[] }): ReactNode {
  if (actions.length === 0) return null;
  return (
    <View className="flex-row items-center gap-2 border-l border-outline-variant pl-2">
      <ActionButtons actions={actions} />
    </View>
  );
}

function Docked<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { picked, barActions, order, commands } = browser;
  return (
    <View className="gap-1 border-t border-outline-variant bg-surface-1 py-2">
      <View className="flex-row items-center gap-2 px-2">
        <IconButton icon="close" label="Clear the selection" onPress={commands.clearSelection} />
        <Text variant="body-strong" className="min-w-0 flex-1" numberOfLines={1}>
          {selectionLabelOf(picked.length)}
        </Text>
        {picked.length < order.length ? (
          <Button label="Select all" variant="text" onPress={commands.selectAll} />
        ) : null}
      </View>
      <HScroller label="Actions for the selected items" fade fadeSurface="card">
        <View className="flex-row items-center gap-2 px-3">
          <ActionButtons actions={actionsOf(browser, barActions.actions)} />
          <Danger actions={actionsOf(browser, barActions.danger)} />
        </View>
      </HScroller>
    </View>
  );
}

export function BrowserSelection<O>({
  browser,
  docked,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly docked: boolean;
}): ReactNode {
  if (browser.picked.length === 0) return null;
  return docked ? <Docked browser={browser} /> : <SelectionRow browser={browser} />;
}
