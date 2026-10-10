import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { BOARD_COLUMNS, type BoardClass } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useIdiom } from '../../design/platform';
import { useSizeClass } from '../../design/size-class';
import { useAppliedTheme } from '../../design/theme';
import { heavyThud } from '../../platform/haptics';
import { Button } from '../button';
import { ErrorState } from '../error-state';
import { notify } from '../toast-store';
import { boardClassOf, cellOf, frameOf, type Cell } from './board-geometry';
import { ADD_TILE, EditCanvas } from './edit/edit-canvas';
import { isShown, type InstanceCheck } from './edit/edit-model';
import { useDocumentKeys } from './edit/keys';
import type { BoardEditor } from './edit/use-board-editor';
import { fittedCell, pack, rowsOf, type Placement } from './packer';
import { SkeletonBoard } from './skeleton-board';
import type { BoardWidget, WidgetDefinition } from './types';

const log = new Logger('app.widget-board');

const warnedPages = new Set<string>();

export interface WidgetBoardProps {
  readonly editor: BoardEditor;
  readonly catalogue: readonly WidgetDefinition[];
  readonly available: ReadonlySet<string>;
  readonly instanceAvailable?: InstanceCheck;
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

function aspectLookup(
  catalogue: readonly WidgetDefinition[],
): (type: string) => number | undefined {
  return (type) => catalogue.find((entry) => entry.type === type)?.aspect;
}

function StaticTiles({
  placements,
  cell,
  catalogue,
}: {
  readonly placements: readonly Placement[];
  readonly cell: Cell;
  readonly catalogue: readonly WidgetDefinition[];
}): ReactNode {
  return placements.map((placement) => {
    const definition = catalogue.find((entry) => entry.type === placement.widget.type);
    return definition === undefined ? null : (
      <View key={placement.widget.key} style={frameOf(cell, placement)} className="absolute">
        {definition.render({
          size: placement.widget.size,
          options: placement.widget.options,
          editing: false,
        })}
      </View>
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

function StaticBoard({
  editor,
  placements,
  cell,
  catalogue,
}: {
  readonly editor: BoardEditor;
  readonly placements: readonly Placement[];
  readonly cell: Cell;
  readonly catalogue: readonly WidgetDefinition[];
}): ReactNode {
  const touch = useIdiom() === 'touch';
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
      <StaticTiles placements={placements} cell={cell} catalogue={catalogue} />
    </Pressable>
  );
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
  const { density } = useAppliedTheme().settings;
  const known = useUnknownWidgets(editor.page, editor.arrangement(board), catalogue);
  const visible = known.filter((widget) => isShown(widget, availability));
  const aspectOf = aspectLookup(catalogue);
  const cell = fittedCell(board, visible, {
    cell: cellOf(width, BOARD_COLUMNS[board], idiom, density),
    aspectOf,
  });
  const sizing = { cell, aspectOf };
  if (!editor.editing) {
    return (
      <StaticBoard
        editor={editor}
        placements={pack(board, visible, sizing)}
        cell={cell}
        catalogue={catalogue}
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
    />
  );
}

function Measured(props: WidgetBoardProps & { readonly board: BoardClass }): ReactNode {
  const [width, setWidth] = useState(0);
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
    <View
      accessibilityLabel={`${editor.page} widgets`}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {width === 0 ? null : <Arranged {...props} width={width} active={active} />}
    </View>
  );
}

export function WidgetBoard(props: WidgetBoardProps): ReactNode {
  const board = boardClassOf(useSizeClass().width);
  const { layout, defaults } = props.editor;
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
        <Button label="Reset layout" variant="tonal" onPress={layout.reset} />
      </View>
    );
  }
  return <Measured {...props} board={board} />;
}
