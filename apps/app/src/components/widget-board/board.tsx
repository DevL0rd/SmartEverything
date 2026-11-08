import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { BoardClass } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useIdiom } from '../../design/platform';
import { useSizeClass } from '../../design/size-class';
import { useThemeSetting } from '../../design/theme';
import { heavyThud } from '../../platform/haptics';
import { Button } from '../button';
import { ErrorState } from '../error-state';
import { notify } from '../toast-store';
import { useMeasuredWidth } from '../use-measured-width';
import { useStableValue } from '../use-stable-value';
import { boardClassOf, boardColumnsOf, cellOf, type Cell } from './board-geometry';
import type { BoardRowLayer } from './board-row-layers';
import { StaticTiles } from './static-tiles';
import type { BoardReveal } from './reveal';
import { useBoardReveal } from './use-board-reveal';
import { ADD_TILE, EditCanvas } from './edit/edit-canvas';
import { isShown, type InstanceCheck } from './edit/edit-model';
import { useEditorHandle } from './edit/widget-actions';
import { useDocumentKeys } from './edit/keys';
import type { BoardEditor } from './edit/use-board-editor';
import { fittedWidgets } from './fit-sizes';
import { boardHeightOf, pack, type Placement } from './packer';
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
  readonly rowLayer?: BoardRowLayer;
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

function boxOf(placements: readonly Placement[], cell: Cell): { readonly height: number } {
  return { height: boardHeightOf(placements, cell) };
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
    left.rows === right.rows
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
  rowLayer,
}: {
  readonly editor: BoardEditor;
  readonly board: BoardClass;
  readonly placements: readonly Placement[];
  readonly cell: Cell;
  readonly catalogue: readonly WidgetDefinition[];
  readonly reveal: BoardReveal | null;
  readonly rowLayer: BoardRowLayer | undefined;
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
        rowLayer={rowLayer}
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
  const columns = boardColumnsOf(board, width);
  const cell = cellOf(width, columns, idiom, density);
  const reveal = useBoardReveal(visible, props.reveal);
  const shared = { editor, board, cell, catalogue, reveal };
  if (!editor.editing) {
    return (
      <StaticBoard
        {...shared}
        placements={pack(board, visible, columns)}
        rowLayer={props.rowLayer}
      />
    );
  }
  const placements = pack(board, [...visible, ADD_TILE], columns);
  return (
    <EditCanvas
      {...shared}
      height={boardHeightOf(placements, cell)}
      placements={placements}
      visible={visible}
      availability={availability}
      active={active}
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
    return <SkeletonBoard board={board} widgets={defaults[board]} />;
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
