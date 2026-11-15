import type { PlannerItemRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { QuickRow, type MenuItem } from '../../../components/menu-rows';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { useSettings } from '../../../store/selectors';
import type { ItemTarget } from './item-editor';
import { itemMenuOf } from './item-menu';
import { menuItemOf, useItemActionRunner, type ItemActionScope } from './item-menu-host';

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
  readonly scope: ItemActionScope;
  readonly disabled: boolean;
  readonly onClose: () => void;
}

const CLOSING = new Set(['done', 'skip']);

function useItemActions({
  item,
  target,
  scope,
  disabled,
  onClose,
}: ActionProps): readonly MenuItem[] {
  const timeZone = useSettings().time_zone;
  const run = useItemActionRunner(item, target, scope);
  const model = itemMenuOf({
    item,
    occurrenceKey: target.occurrenceKey,
    offline: disabled,
    timeZone,
  });
  return model.quick.map((entry) => {
    const menuItem = menuItemOf(entry, run);
    if (!CLOSING.has(entry.id)) return menuItem;
    return {
      ...menuItem,
      onPress: (): void => {
        menuItem.onPress();
        onClose();
      },
    };
  });
}

export function ItemActions(props: ActionProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const actions = useItemActions(props);
  if (!pointer) return <QuickRow items={actions} close={() => undefined} subpages={false} />;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {actions.map((action, index) => (
        <Button
          key={action.id ?? action.label}
          label={action.label}
          {...(action.icon === undefined ? {} : { icon: action.icon })}
          variant={index === 0 ? 'tonal' : 'outlined'}
          disabled={action.disabled === true}
          onPress={action.onPress}
        />
      ))}
    </View>
  );
}
