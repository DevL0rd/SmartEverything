import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BulkProgressShown } from '../../../store/bulk-run';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import type { FileBrowserHandle } from './browser-types';
import { selectionLabelOf } from './selection-model';
import { SelectionActions, SelectionRow } from './selection-row';

function Docked<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { picked, order, commands } = browser;
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
      <View className="flex-row px-3">
        <SelectionActions browser={browser} />
      </View>
      <BulkProgressShown onContainer={false} />
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
