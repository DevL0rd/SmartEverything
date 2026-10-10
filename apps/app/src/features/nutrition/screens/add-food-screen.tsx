import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { ApiError, factsOf, type FoodCandidate } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { lookupBarcode } from '../../../api/nutrition';
import { FlowFrame } from '../../../components/flow-frame';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { useSizeClass } from '../../../design/size-class';
import { useMinute } from '../../../store/clock';
import { ProductResults, SavedFoods } from '../components/food-results';
import { usePortionForm } from '../components/portion-sheet';
import { useFoods } from '../data/foods';
import { useAddGlass } from '../data/water';
import { momentOn } from '../model/day';
import { MEAL_INFO, isMeal, type Meal } from '../model/meals';
import { newTarget, type PortionTarget } from '../model/target';
import { dayKeyOf } from '../../../format/time';
import { millilitres } from '../../../format/number';

const DAY = z.iso.date();

interface AddParams {
  readonly meal: Meal | null;
  readonly day: string;
  readonly today: string;
  readonly at: number;
  readonly barcode: string | null;
}

function useAddParams(): AddParams {
  const params = useLocalSearchParams<{ meal?: string; day?: string; barcode?: string }>();
  const now = useMinute();
  const today = dayKeyOf(now);
  const parsed = DAY.safeParse(params.day);
  const day = parsed.success && parsed.data <= today ? parsed.data : today;
  return {
    meal: isMeal(params.meal) ? params.meal : null,
    day,
    today,
    at: day === today ? now : momentOn(day, now),
    barcode: params.barcode ?? null,
  };
}

function candidateTarget(product: FoodCandidate, params: AddParams): PortionTarget {
  return newTarget(
    product,
    { saveAs: { ...product, origin: 'open_food_facts', favourite: false } },
    params.meal,
    params.at,
  );
}

function PortionStep({
  target,
  onBack,
  onDone,
}: {
  readonly target: PortionTarget;
  readonly onBack: () => void;
  readonly onDone: () => void;
}): ReactNode {
  const form = usePortionForm(target, onDone);
  return (
    <FlowFrame title={target.food.name} onCancel={onBack} footer={form.footer}>
      {form.body}
    </FlowFrame>
  );
}

function useBarcodeLookup(
  params: AddParams,
  choose: (target: PortionTarget) => void,
): (barcode: string) => void {
  const router = useRouter();
  return (barcode) => {
    lookupBarcode(barcode).then(
      (product) => {
        choose(candidateTarget(product, params));
      },
      (error: unknown) => {
        const missing = error instanceof ApiError && error.code === 'not_found';
        notify({
          message: missing ? 'Not in Open Food Facts' : 'Barcode not looked up',
          tone: 'critical',
          ...(missing
            ? {
                action: {
                  label: 'Create food',
                  onPress: (): void => {
                    router.push(href.newFood({ barcode }));
                  },
                },
              }
            : { error }),
        });
      },
    );
  };
}

function QuickRows({
  query,
  params,
}: {
  readonly query: string;
  readonly params: AddParams;
}): ReactNode {
  const router = useRouter();
  const glass = useAddGlass(params.day, params.today);
  return (
    <List inset>
      {glass.ml === null || query !== '' ? null : (
        <ListRow
          icon="glassWater"
          title={`Glass of water · ${millilitres(glass.ml)}`}
          onPress={() => {
            glass.add();
            router.back();
          }}
        />
      )}
      <ListRow
        icon="plus"
        title={query === '' ? 'Create a food' : `Create “${query}”`}
        subtitle="Your own, with its nutrition facts"
        chevron
        href={href.newFood(query === '' ? {} : { name: query })}
      />
    </List>
  );
}

function SearchBar({
  query,
  onQuery,
  params,
}: {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly params: AddParams;
}): ReactNode {
  const android = useSizeClass().platform === 'android';
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <SearchField
          value={query}
          onChange={onQuery}
          placeholder="Search foods and drinks"
          focusOnMount
          variant="field"
        />
      </View>
      {android ? (
        <IconButton
          icon="scanBarcode"
          label="Scan a barcode"
          variant="tonal"
          href={href.scanFood({
            day: params.day,
            ...(params.meal === null ? {} : { meal: params.meal }),
          })}
        />
      ) : null}
    </View>
  );
}

function useScannedBarcode(barcode: string | null, lookup: (barcode: string) => void): void {
  const looked = useRef<string | null>(null);
  useEffect(() => {
    if (barcode !== null && looked.current !== barcode) {
      looked.current = barcode;
      lookup(barcode);
    }
  }, [barcode, lookup]);
}

function SearchStep({
  params,
  onChoose,
}: {
  readonly params: AddParams;
  readonly onChoose: (target: PortionTarget) => void;
}): ReactNode {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const foods = useFoods();
  const lookup = useBarcodeLookup(params, onChoose);
  useScannedBarcode(params.barcode, lookup);
  const saved = foods.data ?? [];
  return (
    <FlowFrame
      title={params.meal === null ? 'Add food' : `Add to ${MEAL_INFO[params.meal].label}`}
      onCancel={() => {
        router.back();
      }}
    >
      <SearchBar query={query} onQuery={setQuery} params={params} />
      <QuickRows query={query.trim()} params={params} />
      {foods.error === null ? null : (
        <Text variant="callout" tone="critical">
          {errorText(foods.error).title}
        </Text>
      )}
      <SavedFoods
        foods={saved}
        query={query}
        onPick={(food) => {
          onChoose(newTarget(factsOf(food), { food }, params.meal, params.at));
        }}
      />
      <ProductResults
        query={query}
        savedBarcodes={
          new Set(saved.flatMap((food) => (food.barcode === null ? [] : [food.barcode])))
        }
        onPick={(product) => {
          onChoose(candidateTarget(product, params));
        }}
        onBarcode={lookup}
      />
    </FlowFrame>
  );
}

export function AddFoodScreen(): ReactNode {
  const router = useRouter();
  const params = useAddParams();
  const [target, setTarget] = useState<PortionTarget | null>(null);
  if (target !== null) {
    return (
      <PortionStep
        target={target}
        onBack={() => {
          setTarget(null);
        }}
        onDone={() => {
          router.back();
        }}
      />
    );
  }
  return <SearchStep params={params} onChoose={setTarget} />;
}
