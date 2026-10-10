import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import type { BoardClass, BoardWidget } from '@smarteverything/domain';
import { useIdiom } from '../../../design/platform';
import { useMotion } from '../../../design/motion';
import { frameOf, type Cell, type Frame } from '../board-geometry';
import type { Placement } from '../packer';
import type { WidgetDefinition } from '../types';
import { addable, added, placeableSize, sizeOptions, type Availability } from './edit-model';
import { AddTile, EditToolbar } from './edit-toolbar';
import { EditableWidget } from './editable-widget';
import type { BoardEditor } from './use-board-editor';
import { useEditKeys } from './use-edit-keys';
import { useEditSession, type EditSession } from './use-edit-handlers';
import { WidgetGallery } from './widget-gallery';
import { WidgetOptions } from './widget-options';

export const ADD_TILE: BoardWidget = { key: 'board:add', type: 'board-add', size: 'S' };

export interface EditCanvasProps {
  readonly editor: BoardEditor;
  readonly board: BoardClass;
  readonly cell: Cell;
  readonly height: number;
  readonly placements: readonly Placement[];
  readonly visible: readonly BoardWidget[];
  readonly catalogue: readonly WidgetDefinition[];
  readonly availability: Availability;
  readonly active: boolean;
}

function definitionLookup(
  catalogue: readonly WidgetDefinition[],
): (type: string) => WidgetDefinition | undefined {
  return (type) => catalogue.find((entry) => entry.type === type);
}

function useFrames(session: EditSession, placements: readonly Placement[], cell: Cell): void {
  const { frames } = session.drag;
  useEffect(() => {
    const next: Record<string, Frame> = {};
    for (const placement of placements) {
      if (placement.widget.key !== ADD_TILE.key) {
        next[placement.widget.key] = frameOf(cell, placement);
      }
    }
    frames.set(next);
  }, [placements, cell, frames]);
}

function Overlays(props: EditCanvasProps & { readonly session: EditSession }): ReactNode {
  const { session, editor, board, cell, catalogue, availability } = props;
  const lookup = definitionLookup(catalogue);
  const optionsWidget =
    props.visible.find((widget) => widget.key === session.ui.optionsFor) ?? null;
  const optionsDefinition = optionsWidget === null ? null : (lookup(optionsWidget.type) ?? null);
  return (
    <>
      <WidgetGallery
        open={session.ui.galleryOpen}
        onClose={() => {
          session.patch({ galleryOpen: false });
        }}
        definitions={addable(catalogue, availability, editor.arrangement(board), board)}
        board={board}
        cell={cell}
        onAdd={(type) => {
          const definition = lookup(type);
          const size = definition === undefined ? null : placeableSize(definition, board);
          if (size !== null) {
            editor.change(board, (widgets) => added(widgets, type, size), 'step');
          }
          session.patch({ galleryOpen: false });
        }}
      />
      <WidgetOptions
        widget={optionsWidget}
        definition={optionsDefinition}
        onClose={() => {
          session.patch({ optionsFor: null });
        }}
        onChange={session.saveOptions}
      />
    </>
  );
}

function renderOrder(
  placements: readonly Placement[],
  frozen: readonly string[] | null,
): readonly Placement[] {
  if (frozen === null) {
    return placements;
  }
  const rank = (placement: Placement): number => {
    const index = frozen.indexOf(placement.widget.key);
    return index === -1 ? frozen.length : index;
  };
  return [...placements].sort((a, b) => rank(a) - rank(b));
}

function Tiles(props: EditCanvasProps & { readonly session: EditSession }): ReactNode {
  const { session, board, cell, placements, catalogue } = props;
  const touch = useIdiom() === 'touch';
  const { reduced } = useMotion();
  const lookup = definitionLookup(catalogue);
  return renderOrder(placements, session.ui.frozen).map((placement, order) => {
    const frame = frameOf(cell, placement);
    if (placement.widget.key === ADD_TILE.key) {
      return (
        <View key={placement.widget.key} style={frame} className="absolute">
          <AddTile
            onPress={() => {
              session.patch({ galleryOpen: true });
            }}
          />
        </View>
      );
    }
    const definition = lookup(placement.widget.type);
    return definition === undefined ? null : (
      <EditableWidget
        key={placement.widget.key}
        widget={placement.widget}
        definition={definition}
        frame={frame}
        cell={cell}
        order={order}
        sizes={sizeOptions(definition, board, cell)}
        drag={session.drag}
        handlers={session.handlers}
        touch={touch}
        reduced={reduced}
        lifted={session.ui.lifted === placement.widget.key}
        resizing={session.ui.resizing === placement.widget.key}
        picked={session.ui.picked === placement.widget.key}
      />
    );
  });
}

function boxOf(height: number): { readonly height: number } {
  return { height };
}

export function EditCanvas(props: EditCanvasProps): ReactNode {
  const { editor, board, cell, height, visible, catalogue, active } = props;
  const touch = useIdiom() === 'touch';
  const session = useEditSession(
    { editor, board, visible, definitionOf: definitionLookup(catalogue) },
    touch,
  );
  useFrames(session, props.placements, cell);
  useEditKeys(active, editor, session);
  return (
    <View className="gap-4">
      <EditToolbar
        touch={touch}
        canUndo={editor.canUndo}
        onUndo={editor.undo}
        onReset={() => {
          editor.reset(board);
        }}
        onAdd={() => {
          session.patch({ galleryOpen: true });
        }}
      />
      <View style={boxOf(height)} accessibilityLabel={`${editor.page} widgets, editing`}>
        <Tiles {...props} session={session} />
      </View>
      <Overlays {...props} session={session} />
    </View>
  );
}
