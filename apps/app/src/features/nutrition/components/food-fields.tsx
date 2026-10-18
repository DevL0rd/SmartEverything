import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { FoodKind } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SwitchRow } from '../../../components/rows';
import { List, Section } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { NUTRIENT_FIELDS, nutrientProblemKey, withKind, type FoodForm } from '../model/food-form';

export type Problems = ReadonlyMap<string, string>;

function Field({
  label,
  value,
  onChange,
  problem,
  helper,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly problem?: string | undefined;
  readonly helper?: string;
}): ReactNode {
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      kind="number"
      error={problem ?? null}
      {...(helper === undefined ? {} : { helper })}
    />
  );
}

export function NutrientFields({
  form,
  set,
  problems,
}: {
  readonly form: FoodForm;
  readonly set: (form: FoodForm) => void;
  readonly problems: Problems;
}): ReactNode {
  const [more, setMore] = useState(false);
  const fields = NUTRIENT_FIELDS.filter((field) => field.main || more);
  return (
    <Section
      title={`Nutrition per ${form.basisAmount === '' ? '…' : form.basisAmount} ${form.unit}`}
    >
      <View className="gap-3">
        <Field
          label="Calories (kcal)"
          value={form.kcal}
          onChange={(kcal) => {
            set({ ...form, kcal });
          }}
          problem={problems.get('kcal')}
        />
        {fields.map((field) => (
          <Field
            key={field.nutrient}
            label={`${field.label} (${field.unit})`}
            value={form.nutrients[field.nutrient] ?? ''}
            onChange={(value) => {
              set({ ...form, nutrients: { ...form.nutrients, [field.nutrient]: value } });
            }}
            problem={problems.get(nutrientProblemKey(field.nutrient))}
          />
        ))}
        {more ? null : (
          <Button
            label="More nutrients"
            variant="text"
            icon="chevronDown"
            onPress={() => {
              setMore(true);
            }}
          />
        )}
      </View>
    </Section>
  );
}

function KindField({
  form,
  set,
}: {
  readonly form: FoodForm;
  readonly set: (form: FoodForm) => void;
}): ReactNode {
  return (
    <Segmented<FoodKind>
      label="Kind"
      options={[
        { value: 'food', label: 'Food', icon: 'apple' },
        { value: 'drink', label: 'Drink', icon: 'cupSoda' },
      ]}
      value={form.kind}
      onChange={(kind) => {
        set(withKind(form, kind));
      }}
    />
  );
}

export function NameFields({
  form,
  set,
  problems,
  focus,
}: {
  readonly form: FoodForm;
  readonly set: (form: FoodForm) => void;
  readonly problems: Problems;
  readonly focus: boolean;
}): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        value={form.name}
        onChange={(name) => {
          set({ ...form, name });
        }}
        error={problems.get('name') ?? null}
        focusOnMount={focus}
      />
      <TextField
        label="Brand, optional"
        value={form.brand}
        onChange={(brand) => {
          set({ ...form, brand });
        }}
        error={problems.get('brand') ?? null}
      />
    </View>
  );
}

export function AmountFields({
  form,
  set,
  problems,
}: {
  readonly form: FoodForm;
  readonly set: (form: FoodForm) => void;
  readonly problems: Problems;
}): ReactNode {
  return (
    <Section title="Amounts">
      <View className="gap-3">
        <KindField form={form} set={set} />
        <Field
          label={`Facts are for (${form.unit})`}
          value={form.basisAmount}
          onChange={(basisAmount) => {
            set({ ...form, basisAmount });
          }}
          problem={problems.get('basis')}
          helper="For example 100, or one serving"
        />
        <Field
          label={`Serving size (${form.unit}), optional`}
          value={form.servingAmount}
          onChange={(servingAmount) => {
            set({ ...form, servingAmount });
          }}
          problem={problems.get('serving')}
        />
        {form.servingAmount === '' ? null : (
          <TextField
            label="Serving name"
            value={form.servingLabel}
            onChange={(servingLabel) => {
              set({ ...form, servingLabel });
            }}
            placeholder="1 cup, 1 can, 1 slice…"
          />
        )}
      </View>
    </Section>
  );
}

export function WaterField({
  form,
  set,
}: {
  readonly form: FoodForm;
  readonly set: (form: FoodForm) => void;
}): ReactNode {
  if (form.kind !== 'drink') {
    return null;
  }
  return (
    <Section
      title="Water"
      footer="How much of this drink counts toward your water. Water, tea, coffee, milk and juice count fully; alcohol does not."
    >
      <View className="gap-2">
        <Text variant="callout">{`Counts ${String(form.waterPercent)} % toward water`}</Text>
        <Slider
          label="Counts toward water"
          value={form.waterPercent}
          min={0}
          max={100}
          step={10}
          onChange={(waterPercent) => {
            set({ ...form, waterPercent });
          }}
          onCommit={(waterPercent) => {
            set({ ...form, waterPercent });
          }}
        />
      </View>
    </Section>
  );
}

export function FavouriteField({
  form,
  set,
}: {
  readonly form: FoodForm;
  readonly set: (form: FoodForm) => void;
}): ReactNode {
  return (
    <List inset>
      <SwitchRow
        title="Favourite"
        icon="star"
        value={form.favourite}
        onChange={(favourite) => {
          set({ ...form, favourite });
        }}
      />
    </List>
  );
}
