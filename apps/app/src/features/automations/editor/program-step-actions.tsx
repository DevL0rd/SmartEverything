import { createContext, useContext, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { editAutomationTree, identifyActions, type Action } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { OverflowButton } from '../../../components/menu';
import { Sheet } from '../../../components/sheet';
import { notify } from '../../../components/toast-store';
import { moved } from '../model/editor-state';
import { programBlocks } from '../model/program-blocks';

interface ProgramTree {
  readonly actions: readonly Action[];
  readonly onChange: (actions: readonly Action[]) => void;
}
export const ProgramTreeContext = createContext<ProgramTree | null>(null);
interface ProgramStepActionsProps extends ProgramTree {
  readonly action: Action;
  readonly index: number;
}
interface MoveToBlockProps {
  readonly action: Action;
  readonly open: boolean;
  readonly onClose: () => void;
}
function MoveToBlock({ action, open, onClose }: MoveToBlockProps): ReactNode {
  const tree = useContext(ProgramTreeContext);
  const nodeId = action.nodeId;
  if (!open || tree === null || nodeId === undefined) return null;
  return (
    <Sheet open={open} title="Move to block" onClose={onClose} detents={['full']}>
      {programBlocks(tree.actions, nodeId).map((choice) => (
        <ListRow
          key={choice.value}
          title={choice.label}
          wrapSubtitle
          onPress={() => {
            try {
              tree.onChange(
                editAutomationTree(tree.actions, { type: 'move', nodeId, target: choice.target }),
              );
              onClose();
            } catch (error) {
              notify({
                message: 'This move could not be applied. Check the program fields and limits.',
                tone: 'critical',
                error,
              });
            }
          }}
        />
      ))}
    </Sheet>
  );
}
interface ExtraStepActionsProps extends ProgramStepActionsProps {
  readonly onMove: () => void;
}
function ExtraStepActions({
  actions,
  action,
  index,
  onChange,
  onMove,
}: ExtraStepActionsProps): ReactNode {
  return (
    <OverflowButton
      label={`Step ${String(index + 1)} actions`}
      items={[
        {
          label: 'Move to block',
          icon: 'route',
          onPress: onMove,
        },
        {
          label: 'Duplicate',
          icon: 'copy',
          onPress: (): void => {
            onChange([
              ...actions.slice(0, index + 1),
              ...identifyActions([action], randomUUID, true),
              ...actions.slice(index + 1),
            ]);
          },
        },
      ]}
    />
  );
}
function StepOrder({ actions, index, onChange }: ProgramStepActionsProps): ReactNode {
  return (
    <>
      <IconButton
        icon="chevronUp"
        label={`Move step ${String(index + 1)} earlier`}
        disabled={index === 0}
        onPress={() => {
          onChange(moved(actions, index, -1));
        }}
      />
      <IconButton
        icon="chevronDown"
        label={`Move step ${String(index + 1)} later`}
        disabled={index === actions.length - 1}
        onPress={() => {
          onChange(moved(actions, index, 1));
        }}
      />
      <IconButton
        icon="trash"
        label={`Remove step ${String(index + 1)}`}
        onPress={() => {
          onChange(actions.filter((_, position) => position !== index));
        }}
      />
    </>
  );
}
export function ProgramStepActions({
  actions,
  action,
  index,
  onChange,
}: ProgramStepActionsProps): ReactNode {
  const [moving, setMoving] = useState(false);
  return (
    <>
      <View className="flex-row justify-end gap-1">
        <StepOrder actions={actions} action={action} index={index} onChange={onChange} />
        <ExtraStepActions
          actions={actions}
          action={action}
          index={index}
          onChange={onChange}
          onMove={() => {
            setMoving(true);
          }}
        />
      </View>
      <MoveToBlock
        action={action}
        open={moving}
        onClose={() => {
          setMoving(false);
        }}
      />
    </>
  );
}
