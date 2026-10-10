import type { ReactNode } from 'react';
import type { HealthEntryRow } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { clock } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { saveProblemOf, useEntryWrites, useRetryEntry } from '../../health-log';
import type { MenuItem } from '../../../components/menu';
import { amountText } from '../model/macros';
import { nutritionOf, waterMlOfEntry } from '../model/portion';
import { millilitres } from '../../../format/number';

interface FoodLine {
  readonly name: string;
  readonly subtitle: string;
  readonly value: string | null;
}

function lineOf(entry: HealthEntryRow): FoodLine {
  const data = nutritionOf(entry);
  const water = waterMlOfEntry(entry);
  const kcal = data === null ? null : data.kilocalories;
  return {
    name: entry.food === null ? (data?.name ?? 'Food') : entry.food.name,
    subtitle: joinParts([
      entry.food?.label,
      clock(entry.start_time),
      water > 0 ? `${millilitres(water)} water` : null,
    ]),
    value: kcal === null ? null : `${amountText(kcal, 'kcal')} kcal`,
  };
}

function retryItem(
  entry: HealthEntryRow,
  problem: string | null,
  retry: (entry: HealthEntryRow) => void,
): readonly MenuItem[] {
  return problem === null
    ? []
    : [
        {
          label: 'Try saving again',
          icon: 'refresh',
          onPress: (): void => {
            retry(entry);
          },
        },
      ];
}

export function FoodEntryRow({
  entry,
  onEdit,
}: {
  readonly entry: HealthEntryRow;
  readonly onEdit: (entry: HealthEntryRow) => void;
}): ReactNode {
  const writes = useEntryWrites();
  const retry = useRetryEntry();
  const line = lineOf(entry);
  const problem = saveProblemOf(entry);
  const edit = (): void => {
    onEdit(entry);
  };
  const remove = (): void => {
    void writes.remove(entry, line.name);
  };
  return (
    <ListRow
      title={line.name}
      subtitle={problem ?? line.subtitle}
      subtitleTone={problem === null ? 'variant' : 'critical'}
      {...(line.value === null ? {} : { value: line.value })}
      onPress={edit}
      contextMenu={[
        { label: 'Edit', icon: 'pencil', onPress: edit },
        ...retryItem(entry, problem, retry),
        { label: 'Remove', icon: 'trash', destructive: true, onPress: remove },
      ]}
    />
  );
}

export function WaterEntryRow({ entry }: { readonly entry: HealthEntryRow }): ReactNode {
  const writes = useEntryWrites();
  const retry = useRetryEntry();
  const problem = saveProblemOf(entry);
  const amount = millilitres(waterMlOfEntry(entry));
  const remove = (): void => {
    void writes.remove(entry, 'Water');
  };
  const ask = (): void => {
    void confirm({
      title: `Remove ${amount} of water?`,
      confirmLabel: 'Remove',
      tone: 'destructive',
    }).then((sure) => {
      if (sure) {
        remove();
      }
    });
  };
  return (
    <ListRow
      icon="glassWater"
      title={amount}
      subtitle={problem ?? clock(entry.start_time)}
      subtitleTone={problem === null ? 'variant' : 'critical'}
      onPress={ask}
      contextMenu={[
        ...retryItem(entry, problem, retry),
        { label: 'Remove', icon: 'trash', destructive: true, onPress: remove },
      ]}
    />
  );
}
