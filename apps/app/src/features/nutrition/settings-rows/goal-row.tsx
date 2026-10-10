import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { NUTRITION_GOAL_LIMITS, type NutritionGoalKey } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useEntityStore } from '../../../store/store-context';
import { saveNutritionPrefs, useNutritionPrefRead } from '../data/prefs';
import { amountText } from '../model/macros';

function GoalFooter({
  canClear,
  onClear,
  onSave,
}: {
  readonly canClear: boolean;
  readonly onClear: () => void;
  readonly onSave: () => void;
}): ReactNode {
  return (
    <View className="flex-1 flex-row gap-3">
      {canClear ? <Button label="No goal" variant="outlined" onPress={onClear} /> : null}
      <Button label="Save" icon="check" grow onPress={onSave} />
    </View>
  );
}

function GoalStepper({
  goal,
  value,
  onChange,
}: {
  readonly goal: NutritionGoalKey;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  const limit = NUTRITION_GOAL_LIMITS[goal];
  return (
    <View className="gap-4 pb-2">
      <Text variant="callout" tone="variant">
        {`How much ${limit.label.toLowerCase()} you aim for each day.`}
      </Text>
      <NumberStepper
        label={limit.label}
        value={value}
        min={limit.min}
        max={limit.max}
        step={limit.step}
        unit={limit.unit}
        onChange={onChange}
      />
    </View>
  );
}

function GoalSheet({
  goal,
  value,
  onClose,
}: {
  readonly goal: NutritionGoalKey;
  readonly value: number | null;
  readonly onClose: () => void;
}): ReactNode {
  const store = useEntityStore();
  const limit = NUTRITION_GOAL_LIMITS[goal];
  const [chosen, setChosen] = useState(value ?? limit.suggested);
  const save = (next: number | null): void => {
    void saveNutritionPrefs(store, { [goal]: next });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${limit.label} goal`}
      detents={['fit']}
      footer={
        <GoalFooter
          canClear={value !== null}
          onClear={() => {
            save(null);
          }}
          onSave={() => {
            save(chosen);
          }}
        />
      }
    >
      <GoalStepper goal={goal} value={chosen} onChange={setChosen} />
    </Sheet>
  );
}

export function GoalRow({ goal }: { readonly goal: NutritionGoalKey }): ReactNode {
  const pref = useNutritionPrefRead();
  const [open, setOpen] = useState(false);
  const limit = NUTRITION_GOAL_LIMITS[goal];
  if (pref.status === 'invalid') {
    return (
      <ListRow
        title={limit.label}
        subtitle="Your nutrition goals could not be read"
        subtitleTone="critical"
        value="Reset"
        onPress={pref.reset}
      />
    );
  }
  const value = pref.value[goal];
  return (
    <>
      <ListRow
        title={limit.label}
        value={value === null ? 'No goal' : `${amountText(value, limit.unit)} ${limit.unit}`}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <GoalSheet
          goal={goal}
          value={value}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
