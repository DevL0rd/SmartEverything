import type { ReactNode } from 'react';
import type { BoardClass, BoardWidget } from '@smarteverything/domain';
import { Button } from '../../button';
import { Sheet } from '../../sheet';
import { Text } from '../../text';
import type { Cell } from '../board-geometry';
import type { WidgetDefinition } from '../types';
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
  readonly flow: GalleryFlow;
  readonly placed: readonly BoardWidget[];
  readonly board: BoardClass;
  readonly cell: Cell;
}

function Content({ items, flow, placed, board, cell }: ContentProps): ReactNode {
  const { step, size } = flow;
  if (items.length === 0) {
    return (
      <Text variant="body" tone="variant" className="py-6 text-center">
        Everything you can add is already on this page.
      </Text>
    );
  }
  if (step?.entry.pick !== undefined && size !== null) {
    return (
      <TargetStep
        item={step}
        picker={step.entry.pick}
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
      board={board}
      cell={cell}
      query={flow.query}
      onQuery={flow.setQuery}
      onOpen={flow.open}
      onAdd={flow.add}
    />
  );
}

export function WidgetGallery(props: WidgetGalleryProps): ReactNode {
  const { open, definitions, placed, board, cell } = props;
  const flow = useGalleryFlow(board, props.onAdd, props.onClose);
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
      open={open}
      onClose={flow.close}
      title={picker === undefined ? 'Add widget' : picker.title}
      kind="inspector"
      detents={['full']}
      footer={footer}
    >
      <Content
        items={galleryItems(definitions, placed, board)}
        flow={flow}
        placed={placed}
        board={board}
        cell={cell}
      />
    </Sheet>
  );
}
