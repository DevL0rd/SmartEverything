import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { MEALS, portionLabel, unitLabel } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { TimeField, type TimeOfDay } from '../../../components/time-field';
import { useLogFood } from '../data/log-food';
import { MEAL_INFO, type Meal } from '../model/meals';
import type { PortionTarget } from '../model/target';
import { NutrientPreview } from './nutrient-preview';

type Unit = 'serving' | 'base';

const MEAL_OPTIONS = MEALS.map((meal) => ({ value: meal, label: MEAL_INFO[meal].label }));

function timeOf(at: number): TimeOfDay {
  const date = new Date(at);
  return { hour: date.getHours(), minute: date.getMinutes() };
}

function atTime(at: number, time: TimeOfDay): number {
  const date = new Date(at);
  date.setHours(time.hour, time.minute, 0, 0);
  return date.getTime();
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      {children}
    </View>
  );
}

export const OFF_ATTRIBUTION =
  'Food data from Open Food Facts, shared under the Open Database Licence.';

function Attribution(): ReactNode {
  return (
    <Text variant="caption" tone="faint">
      {OFF_ATTRIBUTION}
    </Text>
  );
}

function ServingStepper({
  size,
  amount,
  onChange,
}: {
  readonly size: number;
  readonly amount: number;
  readonly onChange: (amount: number) => void;
}): ReactNode {
  return (
    <NumberStepper
      label="Servings"
      value={Math.round((amount / size) * 2) / 2}
      min={0.5}
      max={20}
      step={0.5}
      unit="×"
      onChange={(count) => {
        onChange(count * size);
      }}
    />
  );
}

function AmountControl({
  target,
  amount,
  onChange,
}: {
  readonly target: PortionTarget;
  readonly amount: number;
  readonly onChange: (amount: number) => void;
}): ReactNode {
  const serving = target.food.serving;
  const [unit, setUnit] = useState<Unit>(serving === null ? 'base' : 'serving');
  const base = unitLabel(target.food.basis.unit);
  return (
    <View className="gap-3">
      {serving === null ? null : (
        <Segmented<Unit>
          label="Amount in"
          options={[
            { value: 'serving', label: serving.label },
            { value: 'base', label: base },
          ]}
          value={unit}
          onChange={setUnit}
        />
      )}
      {unit === 'serving' && serving !== null ? (
        <ServingStepper size={serving.amount} amount={amount} onChange={onChange} />
      ) : (
        <NumberStepper
          label="Amount"
          value={amount}
          min={5}
          max={5000}
          step={target.food.basis.unit === 'ml' ? 25 : 10}
          unit={base}
          onChange={onChange}
        />
      )}
    </View>
  );
}

function Footer({
  target,
  busy,
  onSave,
  onRemove,
}: {
  readonly target: PortionTarget;
  readonly busy: boolean;
  readonly onSave: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="flex-1 flex-row gap-3">
      {target.entry === null ? null : (
        <Button label="Remove" variant="destructive" icon="trash" onPress={onRemove} />
      )}
      <Button
        label={target.entry === null ? 'Add' : 'Save'}
        icon={target.entry === null ? 'plus' : 'check'}
        loading={busy}
        grow
        onPress={onSave}
      />
    </View>
  );
}

export interface PortionForm {
  readonly body: ReactNode;
  readonly footer: ReactNode;
}

export function usePortionForm(target: PortionTarget, onDone: () => void): PortionForm {
  const [amount, setAmount] = useState(target.amount);
  const [meal, setMeal] = useState<Meal>(target.meal);
  const [time, setTime] = useState<TimeOfDay>(timeOf(target.at));
  const [busy, setBusy] = useState(false);
  const log = useLogFood();
  const finish = (work: Promise<boolean>): void => {
    setBusy(true);
    void work.then((ok) => {
      setBusy(false);
      if (ok) {
        onDone();
      }
    });
  };
  const subtitle = joinParts([target.food.brand, portionLabel(target.food, amount)]);
  return {
    footer: (
      <Footer
        target={target}
        busy={busy}
        onSave={() => {
          finish(log.save(target, { amount, meal, at: atTime(target.at, time) }));
        }}
        onRemove={() => {
          finish(log.remove(target));
        }}
      />
    ),
    body: (
      <View className="gap-5 pb-2">
        <Text variant="callout" tone="variant" numberOfLines={1}>
          {subtitle}
        </Text>
        <NutrientPreview food={target.food} amount={amount} />
        {target.fromOpenFoodFacts ? <Attribution /> : null}
        <Field label="Amount">
          <AmountControl target={target} amount={amount} onChange={setAmount} />
        </Field>
        <Field label="Meal">
          <Segmented<Meal> label="Meal" options={MEAL_OPTIONS} value={meal} onChange={setMeal} />
        </Field>
        <Field label="Time">
          <TimeField label="Time" value={time} onChange={setTime} />
        </Field>
      </View>
    ),
  };
}

export function PortionSheet({
  target,
  onClose,
}: {
  readonly target: PortionTarget;
  readonly onClose: () => void;
}): ReactNode {
  const form = usePortionForm(target, onClose);
  return (
    <Sheet open onClose={onClose} title={target.food.name} detents={['fit']} footer={form.footer}>
      {form.body}
    </Sheet>
  );
}
