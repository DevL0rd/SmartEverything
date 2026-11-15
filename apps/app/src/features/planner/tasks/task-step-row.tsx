import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { usePlannerWrites } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { reported } from '../item/item-actions';
import type { StepView } from '../item/item-steps';
import { StepRow } from '../item/step-row';
import { OUTDENT_CHANGE } from '../item/steps-model';
import { TASK_FRAME } from './task-row';
import type { RowEdge } from './task-rows';

function Row({ step, edge }: { readonly step: StepView; readonly edge: RowEdge }): ReactNode {
  const { person, offline } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  return (
    <View className={cn('border-hairline border-outline-variant bg-surface-1', TASK_FRAME[edge])}>
      <View className="ml-13 mr-3 h-hairline bg-outline-variant" />
      <View className="pl-10 pr-2">
        <StepRow
          step={step}
          disabled={offline}
          onDone={(done) => {
            reported(writes.completeItem(done.item.id), 'Couldn’t tick that step');
          }}
          onOutdent={(moved) => {
            reported(
              writes.updateItem(moved.item, { changes: OUTDENT_CHANGE }),
              'Couldn’t make that its own task',
            );
          }}
        />
      </View>
    </View>
  );
}

export const TaskStepRow = memo(Row);
