import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type { FoodCandidate, FoodRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List, Section } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { errorText } from '../../../format/errors';
import { joinParts } from '../../../format/text';
import { isBarcode, matchesFood, useProductSearch } from '../data/foods';
import { amountText } from '../model/macros';
import { OFF_ATTRIBUTION } from './portion-sheet';

function perText(food: Pick<FoodCandidate, 'kcal' | 'basis' | 'serving'>): string {
  if (food.kcal === null) {
    return 'No nutrition facts';
  }
  return `${amountText(food.kcal, 'kcal')} kcal per ${String(food.basis.amount)} ${food.basis.unit}`;
}

function FoodList({
  title,
  foods,
  onPick,
}: {
  readonly title: string;
  readonly foods: readonly FoodRow[];
  readonly onPick: (food: FoodRow) => void;
}): ReactNode {
  const router = useRouter();
  if (foods.length === 0) {
    return null;
  }
  return (
    <List title={title} inset>
      {foods.map((food) => (
        <ListRow
          key={food.id}
          icon={food.kind === 'drink' ? 'cupSoda' : 'apple'}
          title={food.name}
          subtitle={joinParts([food.brand, perText(food)])}
          onPress={() => {
            onPick(food);
          }}
          contextMenu={[
            {
              label: 'Edit food',
              icon: 'pencil',
              onPress: (): void => {
                router.push(href.food(food.id));
              },
            },
          ]}
        />
      ))}
    </List>
  );
}

const RECENT_SHOWN = 12;

export function SavedFoods({
  foods,
  query,
  onPick,
}: {
  readonly foods: readonly FoodRow[];
  readonly query: string;
  readonly onPick: (food: FoodRow) => void;
}): ReactNode {
  if (query.trim() !== '') {
    return (
      <FoodList
        title="Your foods"
        foods={foods.filter((food) => matchesFood(food, query))}
        onPick={onPick}
      />
    );
  }
  return (
    <>
      <FoodList title="Favourites" foods={foods.filter((food) => food.favourite)} onPick={onPick} />
      <FoodList
        title="Recent"
        foods={foods
          .filter((food) => !food.favourite && food.last_used_at !== null)
          .slice(0, RECENT_SHOWN)}
        onPick={onPick}
      />
    </>
  );
}

function BarcodeRow({
  barcode,
  onBarcode,
}: {
  readonly barcode: string;
  readonly onBarcode: (barcode: string) => void;
}): ReactNode {
  return (
    <List title="Barcode" inset>
      <ListRow
        icon="scanBarcode"
        title={`Look up ${barcode}`}
        subtitle="Open Food Facts"
        chevron
        onPress={() => {
          onBarcode(barcode);
        }}
      />
    </List>
  );
}

function ProductList({
  products,
  onPick,
}: {
  readonly products: readonly FoodCandidate[];
  readonly onPick: (product: FoodCandidate) => void;
}): ReactNode {
  if (products.length === 0) {
    return (
      <Text variant="callout" tone="variant" className="px-4">
        No products match
      </Text>
    );
  }
  return (
    <List inset>
      {products.map((product) => (
        <ListRow
          key={product.barcode ?? product.name}
          icon={product.kind === 'drink' ? 'cupSoda' : 'apple'}
          title={product.name}
          subtitle={joinParts([product.brand, perText(product)])}
          onPress={() => {
            onPick(product);
          }}
        />
      ))}
    </List>
  );
}

export function ProductResults({
  query,
  savedBarcodes,
  onPick,
  onBarcode,
}: {
  readonly query: string;
  readonly savedBarcodes: ReadonlySet<string>;
  readonly onPick: (product: FoodCandidate) => void;
  readonly onBarcode: (barcode: string) => void;
}): ReactNode {
  const search = useProductSearch(query);
  const trimmed = query.trim();
  if (isBarcode(trimmed)) {
    return <BarcodeRow barcode={trimmed} onBarcode={onBarcode} />;
  }
  if (!search.active) {
    return null;
  }
  const { data, error } = search.result;
  return (
    <Section title="Open Food Facts" footer={OFF_ATTRIBUTION}>
      {data === undefined && error === null ? <Skeleton shape="block" className="h-40" /> : null}
      {error === null ? null : (
        <Text variant="callout" tone="critical" className="px-4">
          {errorText(error).title}
        </Text>
      )}
      {data === undefined ? null : (
        <ProductList
          products={data.filter(
            (product) => product.barcode === null || !savedBarcodes.has(product.barcode),
          )}
          onPick={onPick}
        />
      )}
    </Section>
  );
}
