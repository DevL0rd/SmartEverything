import type { ReactNode } from 'react';
import { Fragment, useEffect } from 'react';
import { View } from 'react-native';
import type { BoardClass, BoardWidget } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useIdiom } from '../../../design/platform';
import { useMotion } from '../../../design/motion';
import { frameOf, type Cell, type Frame } from '../board-geometry';
import type { Placement } from '../packer';
import type { BoardReveal } from '../reveal';
import type { WidgetDefinition } from '../types';
import { addable, added, sizeOptions, type Availability } from './edit-model';
import { AddTile, EditToolbar } from './edit-toolbar';
import { EditableWidget } from './editable-widget';
import type { BoardEditor } from './use-board-editor';
import { useEditKeys } from './use-edit-keys';
import { useEditSession, type EditSession } from './use-edit-handlers';
import type { GalleryAdd } from './gallery-model';
import { RevealRing } from './reveal-ring';
import { WidgetGallery } from './widget-gallery';
import { WidgetOptions } from './widget-options';

const log = new Logger('app.widget-board');

export const ADD_TILE: BoardWidget = { key: 'board:add', type: 'board-add', size: 'M' };

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
  readonly reveal: BoardReveal | null;
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

function place(
  session: EditSession,
  editor: BoardEditor,
  board: BoardClass,
  { type, size, options }: GalleryAdd,
): void {
  const next = added(editor.arrangement(board), type, size, options);
  log.info('edit.widget_added', {
    page: editor.page,
    board,
    type,
    size,
    widgets: next.length,
    withOptions: options !== undefined,
  });
  editor.change(board, () => next, 'step');
  session.patch({ galleryOpen: false, revealed: next.at(-1)?.key ?? null });
}

function Overlays(props: EditCanvasProps & { readonly session: EditSession }): ReactNode {
  const { session, editor, board, cell, catalogue, availability } = props;
  const optionsWidget =
    props.visible.find((widget) => widget.key === session.ui.optionsFor) ?? null;
  const optionsDefinition =
    optionsWidget === null ? null : (definitionLookup(catalogue)(optionsWidget.type) ?? null);
  return (
    <>
      <WidgetGallery
        open={session.ui.galleryOpen}
        onClose={() => {
          session.patch({ galleryOpen: false });
        }}
        definitions={addable(catalogue, availability, board)}
        placed={editor.arrangement(board)}
        board={board}
        cell={cell}
        onAdd={(request) => {
          place(session, editor, board, request);
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

function RevealOverlay({
  frame,
  label,
  onDone,
}: {
  readonly frame: Frame;
  readonly label: string;
  readonly onDone: () => void;
}): ReactNode {
  return (
    <View style={frame} pointerEvents="none" className="absolute">
      <RevealRing label={label} onDone={onDone} />
    </View>
  );
}

function useRevealed(
  session: EditSession,
  reveal: BoardReveal | null,
): { readonly key: string | null; readonly done: () => void } {
  return {
    key: session.ui.revealed ?? reveal?.key ?? null,
    done: (): void => {
      if (session.ui.revealed === null) {
        reveal?.onDone();
      } else {
        session.patch({ revealed: null });
      }
    },
  };
}

function Tiles(props: EditCanvasProps & { readonly session: EditSession }): ReactNode {
  const { session, board, cell, placements, catalogue } = props;
  const revealed = useRevealed(session, props.reveal);
  const touch = useIdiom() === 'touch';
  const { reduced } = useMotion();
  const lookup = definitionLookup(catalogue);
  const openGallery = (): void => {
    session.patch({ galleryOpen: true });
  };
  return renderOrder(placements, session.ui.frozen).map((placement, order) => {
    const frame = frameOf(cell, placement);
    if (placement.widget.key === ADD_TILE.key) {
      return (
        <View key={placement.widget.key} style={frame} className="absolute">
          <AddTile onPress={openGallery} />
        </View>
      );
    }
    const definition = lookup(placement.widget.type);
    if (definition === undefined) {
      return null;
    }
    return (
      <Fragment key={placement.widget.key}>
        <EditableWidget
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
        {revealed.key === placement.widget.key ? (
          <RevealOverlay
            frame={frame}
            label={`Showing ${definition.title}`}
            onDone={revealed.done}
          />
        ) : null}
      </Fragment>
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
