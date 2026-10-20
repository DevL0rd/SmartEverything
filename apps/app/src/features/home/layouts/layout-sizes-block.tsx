import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useHomeLayoutSizes } from '../data/layout-sizes';
import { layoutSizeRows } from '../model/layout-sizes';
import { LayoutSizeCard } from './layout-size-card';
import { undoLayoutChange, type LayoutSizeContext } from './layout-size-actions';

export function LayoutSizesBlock(): ReactNode {
  const { state, defaults, current, save } = useHomeLayoutSizes();
  if (state.status === 'loading') {
    return null;
  }
  if (state.status === 'invalid') {
    return <ErrorState error={state.reason} retry={state.reset} retryLabel="Reset Home layout" />;
  }
  const context: LayoutSizeContext = { layout: state.layout, defaults, save };
  const rows = layoutSizeRows(state.layout, defaults, current);
  const widest = Math.max(...rows.map((row) => row.count));
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant" className="px-4">
        Home keeps a separate arrangement for each screen size, so a folded and an unfolded phone
        can look different. Nothing here changes until you confirm.
      </Text>
      {rows.map((row) => (
        <LayoutSizeCard key={row.board} row={row} widest={widest} context={context} />
      ))}
      {state.layout?.previous === undefined ? null : (
        <List footer="Restores every size to how it was before your last copy or reset.">
          <ListRow
            title="Undo last copy or reset"
            icon="undo"
            onPress={() => {
              undoLayoutChange(context);
            }}
          />
        </List>
      )}
    </View>
  );
}
