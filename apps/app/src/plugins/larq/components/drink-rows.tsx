import type { BottleDrinkRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { clock } from '../../../format/time';
import { millilitres } from '../../../format/number';
import { drinkEntryHref } from '../model/entry-href';

function RowOf({ drink }: { readonly drink: BottleDrinkRow }): ReactNode {
  const refill = drink.kind === 'fill';
  const opens = drink.entryId !== null;
  return (
    <ListRow
      title={clock(drink.at)}
      subtitle={refill ? 'Refill' : 'Drink'}
      icon={refill ? 'refresh' : 'glassWater'}
      value={millilitres(Math.round(drink.ml))}
      label={`${clock(drink.at)}, ${refill ? 'refill' : 'drink'} of ${millilitres(Math.round(drink.ml))}`}
      {...(drink.entryId === null ? {} : { href: drinkEntryHref(drink.entryId) })}
      chevron={opens}
    />
  );
}

export function DrinkRows({ drinks }: { readonly drinks: readonly BottleDrinkRow[] }): ReactNode {
  return drinks.map((drink) => <RowOf key={`${drink.at}-${drink.kind}`} drink={drink} />);
}
