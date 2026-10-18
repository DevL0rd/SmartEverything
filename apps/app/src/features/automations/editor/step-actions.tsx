import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { OverflowButton } from '../../../components/menu';
import { Sheet } from '../../../components/sheet';
import { notify } from '../../../components/toast-store';
import { blockChoices, duplicateStep, moveStep, moveToBlock, removeStep } from '../model/steps';
import { useStepTree } from './step-tree';

interface StepActionsProps {
  readonly id: string;
  readonly position: number;
  readonly count: number;
}

function MoveToBlock({
  id,
  open,
  onClose,
}: {
  readonly id: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const tree = useStepTree();
  if (!open) return null;
  return (
    <Sheet open title="Move to block" onClose={onClose} detents={['full']}>
      {blockChoices(tree.root, id).map((choice) => (
        <ListRow
          key={choice.value}
          title={choice.label}
          wrapSubtitle
          onPress={() => {
            const next = moveToBlock(tree.root, id, choice.target);
            if (next === tree.root) {
              notify({ message: 'This step can’t move there.', tone: 'critical' });
              return;
            }
            tree.change(next);
            onClose();
          }}
        />
      ))}
    </Sheet>
  );
}

function Overflow({ id, onMove }: { readonly id: string; readonly onMove: () => void }): ReactNode {
  const tree = useStepTree();
  return (
    <OverflowButton
      label="Step actions"
      items={[
        { label: 'Move to block', icon: 'route', onPress: onMove },
        {
          label: 'Duplicate',
          icon: 'copy',
          onPress: (): void => {
            tree.change(duplicateStep(tree.root, id, randomUUID));
          },
        },
      ]}
    />
  );
}

export function StepActions({ id, position, count }: StepActionsProps): ReactNode {
  const tree = useStepTree();
  const [moving, setMoving] = useState(false);
  const label = `step ${String(position + 1)}`;
  return (
    <>
      <View className="flex-row justify-end gap-1">
        <IconButton
          icon="chevronUp"
          label={`Move ${label} earlier`}
          disabled={position === 0}
          onPress={() => {
            tree.change(moveStep(tree.root, id, -1));
          }}
        />
        <IconButton
          icon="chevronDown"
          label={`Move ${label} later`}
          disabled={position === count - 1}
          onPress={() => {
            tree.change(moveStep(tree.root, id, 1));
          }}
        />
        <IconButton
          icon="trash"
          label={`Remove ${label}`}
          onPress={() => {
            tree.change(removeStep(tree.root, id));
          }}
        />
        <Overflow
          id={id}
          onMove={() => {
            setMoving(true);
          }}
        />
      </View>
      <MoveToBlock
        id={id}
        open={moving}
        onClose={() => {
          setMoving(false);
        }}
      />
    </>
  );
}
