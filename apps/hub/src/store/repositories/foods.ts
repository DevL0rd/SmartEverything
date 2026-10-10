import { FOOD_ROW, type FoodChange, type FoodRow, type NewFood } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_FOOD = storedRow(FOOD_ROW, {
  json: ['basis', 'serving', 'grams'],
  flags: ['favourite'],
});

const COLUMNS = `id, profile_id, name, brand, barcode, kind, basis, serving, kcal, grams, water_percent,
  origin, favourite, last_used_at, created_at, updated_at`;

const FOODS_LIMIT = 1000;

const LOOKUP = z.object({ answer: z.string().nullable(), fetched_at: z.string() });

export interface CachedLookup {
  readonly answer: unknown;
  readonly fetchedAt: string;
}

function valuesOf(food: FoodChange): Record<string, SQLInputValue | undefined> {
  return {
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    kind: food.kind,
    basis: food.basis === undefined ? undefined : jsonText(food.basis),
    serving:
      food.serving === undefined
        ? undefined
        : food.serving === null
          ? null
          : jsonText(food.serving),
    kcal: food.kcal,
    grams: food.grams === undefined ? undefined : jsonText(food.grams),
    water_percent: food.water_percent,
    favourite: food.favourite === undefined ? undefined : food.favourite ? 1 : 0,
  };
}

export class FoodsRepository {
  constructor(private readonly context: StoreContext) {}

  list(profileId: string): FoodRow[] {
    return this.context.sql.all(
      STORED_FOOD,
      `select ${COLUMNS} from foods where profile_id = $profileId
       order by favourite desc, last_used_at desc nulls last, name limit $limit`,
      { profileId, limit: FOODS_LIMIT },
    );
  }

  byId(id: string, profileId: string): FoodRow {
    return found(
      this.context.sql.get(
        STORED_FOOD,
        `select ${COLUMNS} from foods where id = $id and profile_id = $profileId`,
        { id, profileId },
      ),
      'food',
      id,
    );
  }

  save(profileId: string, food: NewFood): FoodRow {
    return this.context.write(() => {
      const existing =
        food.barcode === null
          ? undefined
          : this.context.sql.get(
              STORED_FOOD,
              `select ${COLUMNS} from foods where profile_id = $profileId and barcode = $barcode`,
              { profileId, barcode: food.barcode },
            );
      if (existing !== undefined) {
        return this.update(existing.id, profileId, food);
      }
      const id = this.context.newId();
      const now = this.context.now();
      const values = { ...valuesOf(food), origin: food.origin, last_used_at: null };
      const columns = Object.keys(values);
      this.context.sql.run(
        'save the food',
        `insert into foods (id, profile_id, ${columns.join(', ')}, created_at, updated_at)
         values ($id, $profileId, ${columns.map((column) => `$${column}`).join(', ')}, $now, $now)`,
        { id, profileId, now, ...assignments(values).parameters, last_used_at: null },
      );
      const row = this.byId(id, profileId);
      this.context.changed('foods', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, profileId: string, change: FoodChange): FoodRow {
    return this.change(id, profileId, valuesOf(change));
  }

  used(id: string, profileId: string): void {
    this.change(id, profileId, { last_used_at: this.context.now() });
  }

  remove(id: string, profileId: string): void {
    this.context.write(() => {
      const before = this.byId(id, profileId);
      this.context.sql.run('forget the food', 'delete from foods where id = $id', { id });
      this.context.changed('foods', 'DELETE', null, before);
    });
  }

  cached(key: string): CachedLookup | undefined {
    const row = this.context.sql.get(
      LOOKUP,
      'select answer, fetched_at from food_lookups where key = $key',
      { key },
    );
    return row === undefined
      ? undefined
      : {
          answer: row.answer === null ? null : z.unknown().parse(JSON.parse(row.answer)),
          fetchedAt: row.fetched_at,
        };
  }

  remember(key: string, answer: unknown): void {
    this.context.sql.run(
      'cache the food lookup',
      `insert into food_lookups (key, answer, fetched_at) values ($key, $answer, $now)
       on conflict (key) do update set answer = excluded.answer, fetched_at = excluded.fetched_at`,
      { key, answer: answer === null ? null : jsonText(answer), now: this.context.now() },
    );
  }

  private change(
    id: string,
    profileId: string,
    values: Readonly<Record<string, SQLInputValue | undefined>>,
  ): FoodRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      const set = assignments({ ...values, updated_at: this.context.now() });
      this.context.sql.run('change the food', `update foods set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      const after = this.byId(id, profileId);
      this.context.changed('foods', 'UPDATE', after, before);
      return after;
    });
  }
}
