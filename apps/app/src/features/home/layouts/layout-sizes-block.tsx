import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ErrorState } from '../../../components/error-state';
import { Grid } from '../../../components/grid';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useHomeLayoutSizes } from '../data/layout-sizes';
import { layoutSizeRows } from '../model/layout-sizes';
import { LayoutSizeCard } from './layout-size-card';
import { undoLayoutChange, type LayoutSizeContext } from './layout-size-actions';

const LAYOUT_CARD_MIN_WIDTH = 384;

export function LayoutSizesBlock(): ReactNode {
  const { state, defaults, current, save } = useHomeLayoutSizes();
  if (state.status === 'loading') {
    return null;
  }
  if (state.status === 'invalid') {
    return (
      <View className="w-full max-w-reading">
        <ErrorState error={state.reason} retry={state.reset} retryLabel="Reset Home layout" />
      </View>
    );
  }
  const context: LayoutSizeContext = { layout: state.layout, defaults, save };
  const rows = layoutSizeRows(state.layout, defaults, current);
  const widest = Math.max(...rows.map((row) => row.count));
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant" className="max-w-reading px-4">
        Home keeps a separate arrangement for each screen size, so a folded and an unfolded phone
        can look different. Nothing here changes until you confirm.
      </Text>
      <Grid
        minItemWidth={LAYOUT_CARD_MIN_WIDTH}
        maxColumns={rows.length}
        cellClassName="max-w-reading"
        stretchLastRow={false}
      >
        {rows.map((row) => (
          <LayoutSizeCard key={row.board} row={row} widest={widest} context={context} />
        ))}
      </Grid>
      {state.layout?.previous === undefined ? null : (
        <List
          footer="Restores every size to how it was before your last copy or reset."
          className="max-w-reading"
        >
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
