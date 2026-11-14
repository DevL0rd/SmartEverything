import type { PlannerItemRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { QuickRow, type MenuItem } from '../../../components/menu-rows';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { usePlannerWrites } from '../data';
import { askAboutItem } from './item-ask';
import type { ItemTarget } from './item-sheet';

export function reported(work: Promise<unknown>, message: string): void {
  background(
    work.catch((error: unknown) => {
      notify({ message, error, tone: 'critical' });
    }),
    'planner.item_action_failed',
  );
}

interface ActionProps {
  readonly item: PlannerItemRow;
  readonly target: ItemTarget;
  readonly disabled: boolean;
  readonly onClose: () => void;
}

function useItemActions({ item, target, disabled }: ActionProps): readonly MenuItem[] {
  const writes = usePlannerWrites(target.person);
  const key = item.rrule === null ? 'single' : target.occurrenceKey;
  const blocked = disabled || key === null;
  return [
    {
      id: 'done',
      label: 'Done',
      icon: 'check',
      disabled: blocked,
      onPress: (): void => {
        reported(
          writes.completeItem(item.id, { occurrence_key: key ?? 'single' }),
          'Couldn’t mark that done',
        );
      },
    },
    {
      id: 'skip',
      label: 'Skip',
      icon: 'skipForward',
      disabled: blocked,
      onPress: (): void => {
        reported(writes.skipItem(item.id, key ?? 'single'), 'Couldn’t skip that');
      },
    },
    {
      id: 'ask',
      label: 'Ask AI',
      icon: 'sparkles',
      onPress: (): void => {
        askAboutItem(item, target.occurrenceKey);
      },
    },
  ];
}

export function ItemActions(props: ActionProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const actions = useItemActions(props);
  if (!pointer) return <QuickRow items={actions} close={props.onClose} subpages={false} />;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {actions.map((action, index) => (
        <Button
          key={action.id ?? action.label}
          label={action.label}
          {...(action.icon === undefined ? {} : { icon: action.icon })}
          variant={index === 0 ? 'tonal' : 'outlined'}
          disabled={action.disabled === true}
          onPress={() => {
            action.onPress();
            if (index < 2) props.onClose();
          }}
        />
      ))}
    </View>
  );
}
