import type { ReactNode } from 'react';
import { memo, useEffect, useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from 'expo-router';
import { BOARD_COLUMNS, type BoardClass } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { LogTally } from '../../design/log-tally';
import { useIdiom } from '../../design/platform';
import { TileViewport } from '../../design/visibility';
import type { Idiom } from '../../design/tokens';
import { useSizeClass } from '../../design/size-class';
import { useThemeSetting } from '../../design/theme';
import { heavyThud } from '../../platform/haptics';
import { Button } from '../button';
import { ErrorState } from '../error-state';
import { notify } from '../toast-store';
import { useMeasuredWidth } from '../use-measured-width';
import { useStableValue } from '../use-stable-value';
import { boardClassOf, cellOf, frameOf, type Cell } from './board-geometry';
import { frameBoxOf } from './frame-class';
import { RevealedMember, renderWidget } from './widget-scope';
import { RevealRing } from './edit/reveal-ring';
import type { BoardReveal } from './reveal';
import { useBoardReveal } from './use-board-reveal';
import { ADD_TILE, EditCanvas } from './edit/edit-canvas';
import { isShown, type InstanceCheck } from './edit/edit-model';
import { useEditorHandle, widgetActions, type EditorHandle } from './edit/widget-actions';
import { useDocumentKeys } from './edit/keys';
import type { BoardEditor } from './edit/use-board-editor';
import { fittedWidgets } from './fit-sizes';
import { fittedCell, pack, rowsOf, type Placement } from './packer';
import { mountOrder, useBoardStagger } from './stagger';
import { SkeletonBoard } from './skeleton-board';
import type { BoardWidget, WidgetDefinition } from './types';

const log = new Logger('app.widget-board');

const warnedPages = new Set<string>();

export interface WidgetBoardProps {
  readonly editor: BoardEditor;
  readonly catalogue: readonly WidgetDefinition[];
  readonly available: ReadonlySet<string>;
  readonly instanceAvailable?: InstanceCheck;
  readonly reveal?: BoardReveal;
}

function useUnknownWidgets(
  page: string,
  widgets: readonly BoardWidget[],
  catalogue: readonly WidgetDefinition[],
): readonly BoardWidget[] {
  const known = widgets.filter((widget) => catalogue.some((entry) => entry.type === widget.type));
  const unknown = widgets.filter((widget) => !known.includes(widget)).map((widget) => widget.type);
  const count = unknown.length;
  useEffect(() => {
    if (count > 0 && !warnedPages.has(page)) {
      warnedPages.add(page);
      log.warn('board.unknown_widgets', { page, types: unknown.join(',') });
      notify({ message: 'Some widgets were removed', detail: 'They are no longer available.' });
    }
  });
  return known;
}

function useKnownWidgets(
  editor: BoardEditor,
  board: BoardClass,
  catalogue: readonly WidgetDefinition[],
): readonly BoardWidget[] {
  const widgets = useUnknownWidgets(editor.page, editor.arrangement(board), catalogue);
  return fittedWidgets(widgets, catalogue, board);
}

function aspectLookup(
  catalogue: readonly WidgetDefinition[],
): (type: string) => number | undefined {
  return (type) => catalogue.find((entry) => entry.type === type)?.aspect;
}

interface StaticTileProps {
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
  placement,
  cell,
  definition,
  board,
  handle,
  idiom,
  reveal,
}: StaticTileProps): ReactNode {
  const frame = frameOf(cell, placement);
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
    <TileViewport style={frame}>
      <RevealedMember member={reveal?.member ?? null}>
        {renderWidget(definition, props, actions)}
      </RevealedMember>
      {reveal === null ? null : (
        <RevealRing label={`Showing ${definition.title}`} onDone={reveal.onDone} />
      )}
    </TileViewport>
  );
});

function StaticTiles({
  page,
  placements,
  cell,
  catalogue,
  handle,
  board,
  reveal,
}: {
  readonly page: string;
  readonly placements: readonly Placement[];
  readonly cell: Cell;
  readonly catalogue: readonly WidgetDefinition[];
  readonly handle: EditorHandle;
  readonly board: BoardClass;
  readonly reveal: BoardReveal | null;
}): ReactNode {
  const idiom = useIdiom();
  const { height } = useWindowDimensions();
  const mounted = useBoardStagger(page, placements, cell.height + cell.gap, height);
  const order = mountOrder(placements);
  return placements.map((placement) => {
    if ((order.get(placement.widget.key) ?? 0) >= mounted) {
      return null;
    }
    const definition = catalogue.find((entry) => entry.type === placement.widget.type);
    return definition === undefined ? null : (
      <StaticTile
        key={placement.widget.key}
        placement={placement}
        cell={cell}
        definition={definition}
        board={board}
        handle={handle}
        idiom={idiom}
        reveal={reveal?.key === placement.widget.key ? reveal : null}
      />
    );
  });
}

function heightOf(placements: readonly Placement[], cell: Cell): number {
  const rows = rowsOf(placements);
  return rows === 0 ? 0 : rows * cell.height + (rows - 1) * cell.gap;
}

function boxOf(placements: readonly Placement[], cell: Cell): { readonly height: number } {
  return { height: heightOf(placements, cell) };
}

function sameWidget(left: BoardWidget, right: BoardWidget): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function samePlacement(left: Placement, right: Placement | undefined): boolean {
  return (
    right !== undefined &&
    sameWidget(left.widget, right.widget) &&
    left.col === right.col &&
    left.row === right.row &&
    left.cols === right.cols &&
    left.rows === right.rows &&
    left.height === right.height
  );
}

function samePlacements(left: readonly Placement[], right: readonly Placement[]): boolean {
  return (
    left.length === right.length &&
    left.every((placement, index) => samePlacement(placement, right[index]))
  );
}

function sameCell(left: Cell, right: Cell): boolean {
  return Object.entries(left).every(([key, value]) => Object.is(value, Reflect.get(right, key)));
}

function StaticBoard({
  editor,
  board,
  placements: nextPlacements,
  cell: nextCell,
  catalogue,
  reveal,
}: {
  readonly editor: BoardEditor;
  readonly board: BoardClass;
  readonly placements: readonly Placement[];
  readonly cell: Cell;
  readonly catalogue: readonly WidgetDefinition[];
  readonly reveal: BoardReveal | null;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const placements = useStableValue(nextPlacements, samePlacements);
  const cell = useStableValue(nextCell, sameCell);
  const handle = useEditorHandle(editor);
  return (
    <Pressable
      accessible={false}
      disabled={!touch}
      onLongPress={() => {
        heavyThud();
        editor.begin();
      }}
      style={boxOf(placements, cell)}
    >
      <StaticTiles
        page={editor.page}
        placements={placements}
        cell={cell}
        catalogue={catalogue}
        handle={handle}
        board={board}
        reveal={reveal}
      />
    </Pressable>
  );
}

function useArrangedLog(shown: {
  readonly editor: BoardEditor;
  readonly board: BoardClass;
  readonly width: number;
  readonly known: number;
  readonly visible: number;
}): void {
  const { page, editing } = shown.editor;
  const { board, width, known, visible } = shown;
  useEffect(() => {
    log.debug('board.arranged', {
      page,
      board,
      width,
      editing,
      widgets: known,
      visible,
      hidden: known - visible,
    });
  }, [page, board, width, editing, known, visible]);
}

function Arranged(
  props: WidgetBoardProps & {
    readonly board: BoardClass;
    readonly width: number;
    readonly active: boolean;
  },
): ReactNode {
  const { editor, catalogue, board, width, active } = props;
  const availability = { types: props.available, instance: props.instanceAvailable };
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  const known = useKnownWidgets(editor, board, catalogue);
  const visible = known.filter((widget) => isShown(widget, availability));
  useArrangedLog({ editor, board, width, known: known.length, visible: visible.length });
  const aspectOf = aspectLookup(catalogue);
  const cell = fittedCell(board, visible, {
    cell: cellOf(width, BOARD_COLUMNS[board], idiom, density),
    aspectOf,
  });
  const sizing = { cell, aspectOf };
  const reveal = useBoardReveal(visible, props.reveal);
  if (!editor.editing) {
    return (
      <StaticBoard
        editor={editor}
        board={board}
        placements={pack(board, visible, sizing)}
        cell={cell}
        catalogue={catalogue}
        reveal={reveal}
      />
    );
  }
  const placements = pack(board, [...visible, ADD_TILE], sizing);
  return (
    <EditCanvas
      editor={editor}
      board={board}
      cell={cell}
      height={heightOf(placements, cell)}
      placements={placements}
      visible={visible}
      catalogue={catalogue}
      availability={availability}
      active={active}
      reveal={reveal}
    />
  );
}

function Measured(props: WidgetBoardProps & { readonly board: BoardClass }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const active = useIsFocused();
  const { editor } = props;
  useDocumentKeys(active && !editor.editing, (input) => {
    if (input.typing || input.command || input.alt || input.key.toLowerCase() !== 'e') {
      return false;
    }
    editor.begin();
    return true;
  });
  return (
    <View accessibilityLabel={`${editor.page} widgets`} onLayout={onLayout}>
      {width === 0 ? null : <Arranged {...props} width={width} active={active} />}
    </View>
  );
}

export function WidgetBoard(props: WidgetBoardProps): ReactNode {
  const board = boardClassOf(useSizeClass().width);
  const { layout, defaults, page } = props.editor;
  const status = layout.status;
  const reason = layout.status === 'invalid' ? layout.reason : null;
  useEffect(() => {
    if (status === 'invalid') {
      log.warn('board.layout_invalid', { page, board, reason });
    } else {
      log.info('board.layout_status', { page, board, status });
    }
  }, [page, board, status, reason]);
  if (layout.status === 'loading') {
    return (
      <SkeletonBoard
        board={board}
        widgets={defaults[board]}
        aspectOf={aspectLookup(props.catalogue)}
      />
    );
  }
  if (layout.status === 'invalid') {
    return (
      <View className="gap-3">
        <ErrorState error={new Error(layout.reason)} />
        <Button
          label="Reset layout"
          variant="tonal"
          onPress={() => {
            log.info('board.layout_reset_requested', { page, board });
            layout.reset();
          }}
        />
      </View>
    );
  }
  return <Measured {...props} board={board} />;
}
