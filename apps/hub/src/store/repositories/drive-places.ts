import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

export const DRIVE_PLACE_ROW = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    admin: z.string().min(1).nullable(),
    country: z.string().regex(/^[A-Z]{2}$/),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  })
  .readonly();

export type DrivePlaceRow = z.infer<typeof DRIVE_PLACE_ROW>;

export interface DrivePlaceBounds {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

const COLUMNS = 'id, name, admin, country, lat, lon';

const SELECT = `select ${COLUMNS} from drive_places`;

const TOTAL = z.strictObject({ total: z.int().nonnegative() });

export class DrivePlacesRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DrivePlaceRow | undefined {
    return this.context.sql.get(DRIVE_PLACE_ROW, `${SELECT} where id = $id`, { id });
  }

  byId(id: string): DrivePlaceRow {
    return found(this.find(id), 'place', id);
  }

  count(): number {
    return this.context.sql.get(TOTAL, 'select count(*) as total from drive_places')?.total ?? 0;
  }

  inCountry(country: string): DrivePlaceRow[] {
    return this.context.sql.all(
      DRIVE_PLACE_ROW,
      `${SELECT} where country = $country order by name, id`,
      {
        country,
      },
    );
  }

  within(bounds: DrivePlaceBounds): DrivePlaceRow[] {
    const crosses = bounds.west > bounds.east;
    return this.context.sql.all(
      DRIVE_PLACE_ROW,
      `${SELECT} where lat between $south and $north
         and (($crosses = 0 and lon between $west and $east) or ($crosses = 1 and (lon >= $west or lon <= $east)))
       order by id`,
      { ...bounds, crosses: crosses ? 1 : 0 },
    );
  }

  replaceAll(places: readonly DrivePlaceRow[]): void {
    this.context.write(() => {
      const rows = places.map((place) => DRIVE_PLACE_ROW.parse(place));
      for (const row of rows) {
        this.context.sql.run(
          'save the place',
          `insert into drive_places (${COLUMNS}) values ($id, $name, $admin, $country, $lat, $lon)
           on conflict (id) do update set name = excluded.name, admin = excluded.admin,
             country = excluded.country, lat = excluded.lat, lon = excluded.lon`,
          { ...row },
        );
      }
      this.context.sql.run(
        'drop the places missing from the dataset',
        `delete from drive_places where id not in (select value from json_each($ids))`,
        { ids: jsonText(rows.map((row) => row.id)) },
      );
    });
  }
}
