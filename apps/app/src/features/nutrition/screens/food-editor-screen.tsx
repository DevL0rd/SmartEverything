import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { FoodRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { FlowFrame } from '../../../components/flow-frame';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import {
  AmountFields,
  FavouriteField,
  NameFields,
  NutrientFields,
  WaterField,
  type Problems,
} from '../components/food-fields';
import { useFoodSave, useForgetFood } from '../data/food-editor';
import { useFoods } from '../data/foods';
import { blankForm, checkForm, formOf, type FoodForm } from '../model/food-form';

function Editor({
  food,
  initial,
}: {
  readonly food: FoodRow | null;
  readonly initial: FoodForm;
}): ReactNode {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [problems, setProblems] = useState<Problems>(new Map());
  const saving = useFoodSave(food, () => {
    router.back();
  });
  const remove = useForgetFood(food);
  const submit = (): void => {
    const checked = checkForm(form, food?.origin ?? 'custom');
    if (checked.ok) {
      saving.save(checked.food);
    } else {
      setProblems(checked.problems);
    }
  };
  return (
    <FlowFrame
      title={food === null ? 'New food' : 'Edit food'}
      onCancel={() => {
        router.back();
      }}
      footer={
        <>
          {food === null ? null : (
            <Button label="Forget" variant="destructive" icon="trash" onPress={remove} />
          )}
          <Button label="Save" icon="check" grow loading={saving.busy} onPress={submit} />
        </>
      }
    >
      <NameFields
        form={form}
        set={setForm}
        problems={problems}
        focus={food === null && form.name === ''}
      />
      <AmountFields form={form} set={setForm} problems={problems} />
      <NutrientFields form={form} set={setForm} problems={problems} />
      <WaterField form={form} set={setForm} />
      <FavouriteField form={form} set={setForm} />
    </FlowFrame>
  );
}

export function NewFoodScreen(): ReactNode {
  const params = useLocalSearchParams<{ name?: string; barcode?: string }>();
  return <Editor food={null} initial={blankForm(params.name ?? '', params.barcode ?? '')} />;
}

function Notice({ children }: { readonly children: ReactNode }): ReactNode {
  const router = useRouter();
  return (
    <FlowFrame
      title="Edit food"
      onCancel={() => {
        router.back();
      }}
    >
      {children}
    </FlowFrame>
  );
}

export function EditFoodScreen(): ReactNode {
  const { foodId } = useLocalSearchParams<{ foodId: string }>();
  const foods = useFoods();
  if (foods.error !== null) {
    return (
      <Notice>
        <ErrorState error={foods.error} />
      </Notice>
    );
  }
  if (foods.data === undefined) {
    return (
      <Notice>
        <Skeleton shape="block" className="h-72" />
      </Notice>
    );
  }
  const food: FoodRow | undefined = foods.data.find((row) => row.id === foodId);
  if (food === undefined) {
    return (
      <Notice>
        <Text variant="callout" tone="variant">
          This food is not saved any more.
        </Text>
      </Notice>
    );
  }
  return <Editor food={food} initial={formOf(food)} />;
}
