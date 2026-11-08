import type { ReactNode } from 'react';
import type { BoardClass, BoardWidget } from '@smarteverything/domain';
import { Button } from '../../button';
import { Sheet } from '../../sheet';
import { Text } from '../../text';
import type { Cell } from '../board-geometry';
import { usePickerSource } from '../picker-source';
import type { PickerState, WidgetDefinition } from '../types';
import { BrowseStep } from './gallery-browse-step';
import { galleryItems, type GalleryAdd, type GalleryItem } from './gallery-model';
import { TargetStep } from './gallery-target-step';
import { useGalleryFlow, type GalleryFlow } from './use-gallery-flow';

export interface WidgetGalleryProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly definitions: readonly WidgetDefinition[];
  readonly placed: readonly BoardWidget[];
  readonly board: BoardClass;
  readonly cell: Cell;
  readonly onAdd: (request: GalleryAdd) => void;
}

interface ContentProps {
  readonly items: readonly GalleryItem[];
  readonly pickerState: PickerState;
  readonly flow: GalleryFlow;
  readonly placed: readonly BoardWidget[];
  readonly board: BoardClass;
  readonly cell: Cell;
}

function Content({ items, pickerState, flow, placed, board, cell }: ContentProps): ReactNode {
  const { step, size } = flow;
  if (items.length === 0) {
    return (
      <Text variant="body" tone="variant" className="py-6 text-center">
        There are no widgets to add right now.
      </Text>
    );
  }
  if (step?.entry.pick !== undefined && size !== null) {
    return (
      <TargetStep
        item={step}
        pickerState={pickerState}
        placed={placed}
        board={board}
        cell={cell}
        size={size}
        picked={flow.picked}
        onPick={flow.pick}
        onSize={flow.resize}
        onBack={flow.back}
      />
    );
  }
  return (
    <BrowseStep
      items={items}
      placed={placed}
      pickerState={pickerState}
      board={board}
      cell={cell}
      query={flow.query}
      onQuery={flow.setQuery}
      onOpen={flow.open}
      onAdd={flow.add}
    />
  );
}

function OpenGallery({
  definitions,
  placed,
  board,
  cell,
  onAdd,
  onClose,
}: WidgetGalleryProps): ReactNode {
  const { state: pickerState, read: readPicker } = usePickerSource();
  const items = galleryItems(definitions, placed, board, pickerState);
  const flow = useGalleryFlow({ board, items, placed, pickerState, readPicker, onAdd });
  const picker = flow.step?.entry.pick;
  const footer =
    picker === undefined ? undefined : (
      <Button
        label={flow.picked === null ? 'Choose one to add' : 'Add widget'}
        disabled={flow.picked === null}
        grow
        onPress={flow.addPicked}
      />
    );
  return (
    <Sheet
      open
      onClose={onClose}
      title={picker === undefined ? 'Add widget' : picker.title}
      kind="inspector"
      detents={['full']}
      footer={footer}
    >
      <Content
        items={items}
        pickerState={pickerState}
        flow={flow}
        placed={placed}
        board={board}
        cell={cell}
      />
    </Sheet>
  );
}

export function WidgetGallery(props: WidgetGalleryProps): ReactNode {
  return props.open ? <OpenGallery {...props} /> : null;
}
