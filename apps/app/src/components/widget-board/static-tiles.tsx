import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { LogTally } from '../../design/log-tally';
import { useIdiom } from '../../design/platform';
import type { Idiom } from '../../design/tokens';
import { TileViewport } from '../../design/visibility';
import { frameOf, type Cell } from './board-geometry';
import { BoardRowLayers, type BoardRowLayer } from './board-row-layers';
import { frameBoxOf } from './frame-class';
import { RevealedMember, renderWidget } from './widget-scope';
import { RevealRing } from './edit/reveal-ring';
import type { BoardReveal } from './reveal';
import { widgetActions, type EditorHandle } from './edit/widget-actions';
import type { Placement } from './packer';
import { mountOrder, useBoardStagger } from './stagger';
import type { BoardClass, WidgetDefinition } from './types';

const log = new Logger('app.widget-board');

interface StaticTileProps {
  readonly originTop: number;
  readonly placement: Placement;
  readonly cell: Cell;
  readonly definition: WidgetDefinition;
  readonly board: BoardClass;
  readonly handle: EditorHandle;
  readonly idiom: Idiom;
  readonly reveal: BoardReveal | null;
}

const tiles = new LogTally(log, 'board.tiles_summarised', 5000);

const StaticTile = memo(function StaticTile({
  originTop,
  placement,
  cell,
  definition,
  board,
  handle,
  idiom,
  reveal,
}: StaticTileProps): ReactNode {
  const frame = frameOf(cell, placement);
  const position = { ...frame, top: frame.top - originTop };
  const props = {
    size: placement.widget.size,
    options: placement.widget.options,
    editing: false,
    frame: frameBoxOf(frame, cell.pad, idiom),
  };
  const actions = useMemo(
    () => widgetActions(handle, board, placement.widget.key),
    [handle, board, placement.widget.key],
  );
  const widgetType = placement.widget.type;
  useEffect(() => {
    tiles.bump('mounted');
    tiles.bump(`mounted_${widgetType}`);
    return (): void => {
      tiles.bump('unmounted');
    };
  }, [widgetType]);
  return (
    <TileViewport style={position}>
      <RevealedMember member={reveal?.member ?? null}>
        {renderWidget(definition, props, actions)}
      </RevealedMember>
      {reveal === null ? null : (
        <RevealRing label={`Showing ${definition.title}`} onDone={reveal.onDone} />
      )}
    </TileViewport>
  );
});

export function StaticTiles({
  page,
  placements,
  cell,
  catalogue,
  handle,
  board,
  reveal,
  rowLayer,
}: {
  readonly page: string;
  readonly placements: readonly Placement[];
  readonly cell: Cell;
  readonly catalogue: readonly WidgetDefinition[];
  readonly handle: EditorHandle;
  readonly board: BoardClass;
  readonly reveal: BoardReveal | null;
  readonly rowLayer: BoardRowLayer | undefined;
}): ReactNode {
  const idiom = useIdiom();
  const { height } = useWindowDimensions();
  const mounted = useBoardStagger(page, placements, cell.height + cell.gap, height);
  const order = mountOrder(placements);
  const render = (placement: Placement, originTop: number): ReactNode => {
    if ((order.get(placement.widget.key) ?? 0) >= mounted) {
      return null;
    }
    const definition = catalogue.find((entry) => entry.type === placement.widget.type);
    return definition === undefined ? null : (
      <StaticTile
        key={placement.widget.key}
        placement={placement}
        originTop={originTop}
        cell={cell}
        definition={definition}
        board={board}
        handle={handle}
        idiom={idiom}
        reveal={reveal?.key === placement.widget.key ? reveal : null}
      />
    );
  };
  return rowLayer === undefined ? (
    placements.map((placement) => render(placement, 0))
  ) : (
    <BoardRowLayers placements={placements} cell={cell} layer={rowLayer} render={render} />
  );
}
